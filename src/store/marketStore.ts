import { create } from 'zustand';
import type { DepthBook } from '../engine/types';
import type { Kline, PremiumIndex, SymbolFilter, Ticker24h } from '../market/rest';
import {
  fetchDepth,
  fetchExchangeInfo,
  fetchFundingInfo,
  fetchKlines,
  fetchPremiumIndex,
  fetchTicker24h,
  POPULAR,
} from '../market/rest';
import { inferFundingIntervalHours, intervalFromAdjacent, mergeFundingIntervals } from '../lib/fundingInterval';
import { BinanceWs, type Interval } from '../market/ws';
import type { AggTradeMsg, DepthMsg, KlineMsg, MarkPriceMsg } from '../market/ws';
import {
  applyWsDown,
  applyWsOpen,
  applyWsStreamMessage,
  createHybridState,
  enabledPollKinds,
  evaluateSilence,
  muteKinds,
  streamKindFromName,
  transportOf,
  type HybridState,
  type StreamKind,
  type Transport,
} from '../market/fallback';
import { RestPoller, uniqueSymbols } from '../market/poller';
import {
  getEndpoints,
  loadEndpoints,
  saveEndpoints,
  type MarketEndpoints,
} from '../market/endpoints';
import { midLastPrice, shouldDeriveLastFromDepth, tickerLastOverride } from '../market/lastPrice';

let extraSymbols: string[] = [];
let onMarkTick: () => void = () => undefined;
let onTradeTick: () => void = () => undefined;

export function setMarketExtras(symbols: string[]): void {
  extraSymbols = symbols;
  const st = useMarketStore.getState();
  ws?.setTopic(st.symbol, st.interval, extraSymbols);
  poller?.nudge();
}

export function setTickHandlers(handlers: { onMark: () => void; onTrade: () => void }): void {
  onMarkTick = handlers.onMark;
  onTradeTick = handlers.onTrade;
}

export interface RecentTrade {
  time: number;
  price: number;
  qty: number;
  isBuyerMaker: boolean;
}

export type { Transport, StreamKind };

interface MarketState {
  symbol: string;
  interval: Interval;
  connected: boolean;
  transport: Transport;
  muteStreams: StreamKind[];
  transportHint: string | null;
  endpoints: MarketEndpoints;
  latencyMs: number;
  lastPrice: number;
  markPrice: number;
  fundingRate: number;
  nextFundingTime: number;
  eventTime: number;
  klines: Kline[];
  depth: DepthBook;
  recentTrades: RecentTrade[];
  filters: Record<string, SymbolFilter>;
  tickers: Record<string, Ticker24h>;
  lastPrices: Record<string, number>;
  markPrices: Record<string, number>;
  fundingRates: Record<string, number>;
  nextFundingTimes: Record<string, number>;
  fundingIntervals: Record<string, number>;
  depths: Record<string, DepthBook>;
  change1m: Record<string, number>;
  priceHist: Record<string, Array<{ t: number; p: number }>>;
  symbols: string[];
  ready: boolean;
  error: string | null;
  setSymbol: (s: string) => void;
  setInterval: (i: Interval) => void;
  start: () => void;
  stop: () => void;
  restart: () => void;
  hydrateEndpoints: () => Promise<void>;
  applyEndpoints: (e: MarketEndpoints) => Promise<void>;
  refreshSnapshots: () => Promise<void>;
}

let ws: BinanceWs | null = null;
let poller: RestPoller | null = null;
let tickerTimer: ReturnType<typeof setInterval> | null = null;
let silenceTimer: ReturnType<typeof setInterval> | null = null;
let hintTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let fb: HybridState = createHybridState(Date.now());
let lastMuteKey = '';

function pushHist(
  map: Record<string, Array<{ t: number; p: number }>>,
  symbol: string,
  t: number,
  p: number,
): Record<string, Array<{ t: number; p: number }>> {
  const arr = (map[symbol] ?? []).slice();
  arr.push({ t, p });
  const cut = t - 120_000;
  const trimmed = arr.filter((x) => x.t >= cut);
  return { ...map, [symbol]: trimmed };
}

function change1mOf(hist: Array<{ t: number; p: number }> | undefined, now: number, last: number): number {
  if (!hist || hist.length === 0 || last <= 0) return 0;
  const target = now - 60_000;
  let best = hist[0]!;
  for (const x of hist) {
    if (x.t <= target) best = x;
    else break;
  }
  if (best.p <= 0) return 0;
  return ((last - best.p) / best.p) * 100;
}

function parseDepth(d: DepthMsg): DepthBook {
  // 合约 WS 盘口流字段是 b/a，REST 是 bids/asks —— 两种格式都要接，
  // 否则 WS 盘口会静默解析成空数组，市价单直接报「盘口不足」。
  return {
    bids: (d.b ?? d.bids ?? []).map((x) => [Number(x[0]), Number(x[1])]),
    asks: (d.a ?? d.asks ?? []).map((x) => [Number(x[0]), Number(x[1])]),
  };
}

export const __parseDepthForTest = parseDepth;

function mergeKlines(existing: Kline[], incoming: Kline[]): Kline[] {
  const next = existing.slice();
  for (const bar of incoming) {
    const last = next[next.length - 1];
    if (last && last.time === bar.time) next[next.length - 1] = bar;
    else if (!last || bar.time > last.time) next.push(bar);
    else {
      const i = next.findIndex((x) => x.time === bar.time);
      if (i >= 0) next[i] = bar;
    }
  }
  if (next.length > 600) next.splice(0, next.length - 600);
  return next;
}

function applyPremium(p: PremiumIndex): void {
  const st = useMarketStore.getState();
  const mark = p.markPrice;
  const rate = p.lastFundingRate;
  const nextT = p.nextFundingTime;
  const eventTime = p.time || Date.now();
  const latency = Date.now() - eventTime;
  const hist = pushHist(st.priceHist, p.symbol, eventTime, mark);
  const ch = { ...st.change1m, [p.symbol]: change1mOf(hist[p.symbol], eventTime, mark) };
  const prevNext = st.nextFundingTimes[p.symbol] ?? 0;
  const fromAdj = intervalFromAdjacent(prevNext, nextT);
  const hours = inferFundingIntervalHours(nextT, Date.now(), st.fundingIntervals[p.symbol] ?? fromAdj ?? undefined);
  const fundingIntervals =
    st.fundingIntervals[p.symbol] === hours
      ? st.fundingIntervals
      : { ...st.fundingIntervals, [p.symbol]: hours };
  useMarketStore.setState({
    markPrices: { ...st.markPrices, [p.symbol]: mark },
    fundingRates: { ...st.fundingRates, [p.symbol]: rate },
    nextFundingTimes: { ...st.nextFundingTimes, [p.symbol]: nextT },
    fundingIntervals,
    priceHist: hist,
    change1m: ch,
    ...(p.symbol === st.symbol
      ? {
          markPrice: mark,
          fundingRate: rate,
          nextFundingTime: nextT,
          eventTime,
          latencyMs: latency,
        }
      : {}),
  });
  onMarkTick();
}

function applyTicker(t: Ticker24h): void {
  const st = useMarketStore.getState();
  const muted = fb.streams.aggTrade.source === 'poll';
  const last = tickerLastOverride(muted, t.lastPrice);
  useMarketStore.setState({
    tickers: { ...st.tickers, [t.symbol]: t },
    ...(last != null
      ? {
          lastPrices: { ...st.lastPrices, [t.symbol]: last },
          ...(t.symbol === st.symbol ? { lastPrice: last } : {}),
        }
      : {}),
  });
  if (last != null) onTradeTick();
}

function applyDepthBook(symbol: string, book: DepthBook): void {
  const st = useMarketStore.getState();
  const muted = shouldDeriveLastFromDepth(fb.streams.aggTrade.source === 'poll');
  const mid = muted ? midLastPrice(book) : null;
  useMarketStore.setState({
    depths: { ...st.depths, [symbol]: book },
    ...(symbol === st.symbol ? { depth: book } : {}),
    ...(mid != null
      ? {
          lastPrices: { ...st.lastPrices, [symbol]: mid },
          ...(symbol === st.symbol ? { lastPrice: mid } : {}),
        }
      : {}),
  });
  if (mid != null) onTradeTick();
}

function applyKlineBars(symbol: string, bars: Kline[]): void {
  const st = useMarketStore.getState();
  if (symbol !== st.symbol) return;
  const next = mergeKlines(st.klines, bars);
  const close = next[next.length - 1]?.close;
  const muted = fb.streams.aggTrade.source === 'poll';
  useMarketStore.setState({
    klines: next,
    ...(close != null && !muted
      ? { lastPrice: close, lastPrices: { ...st.lastPrices, [symbol]: close } }
      : {}),
  });
}

function handleWsPayload(stream: string, data: unknown): void {
  const kind = streamKindFromName(stream);
  if (kind) {
    const wasPoll = fb.streams[kind].source === 'poll';
    fb = applyWsStreamMessage(fb, kind, Date.now());
    if (wasPoll) syncTransport(false);
  }

  const st = useMarketStore.getState();
  if (stream.includes('@markPrice')) {
    const m = data as MarkPriceMsg;
    applyPremium({
      symbol: m.s,
      markPrice: Number(m.p),
      lastFundingRate: Number(m.r),
      nextFundingTime: Number(m.T),
      time: Number(m.E),
    });
    return;
  }
  if (stream.includes('@aggTrade')) {
    const t = data as AggTradeMsg;
    const price = Number(t.p);
    const qty = Number(t.q);
    const rec: RecentTrade = {
      time: Number(t.T),
      price,
      qty,
      isBuyerMaker: Boolean(t.m),
    };
    const recent = t.s === st.symbol ? [...st.recentTrades, rec].slice(-40) : st.recentTrades;
    useMarketStore.setState({
      lastPrices: { ...st.lastPrices, [t.s]: price },
      ...(t.s === st.symbol ? { lastPrice: price, recentTrades: recent } : {}),
    });
    onTradeTick();
    return;
  }
  if (stream.includes('@depth20')) {
    const d = data as DepthMsg;
    const book = parseDepth(d);
    const sym = stream.split('@')[0]?.toUpperCase() ?? st.symbol;
    applyDepthBook(sym, book);
    return;
  }
  if (stream.includes('@kline_')) {
    const k = data as KlineMsg;
    if (k.s !== st.symbol) return;
    applyKlineBars(k.s, [
      {
        time: Math.floor(k.k.t / 1000),
        open: Number(k.k.o),
        high: Number(k.k.h),
        low: Number(k.k.l),
        close: Number(k.k.c),
        volume: Number(k.k.v),
      },
    ]);
  }
}

function handleDead(): void {
  if (!running) return;
  fb = applyWsDown(fb);
  fb = evaluateSilence(fb, Date.now());
  syncTransport(true);
}

function startWs(): void {
  ws?.stop();
  const st = useMarketStore.getState();
  ws = new BinanceWs({
    symbol: st.symbol,
    extra: extraSymbols,
    interval: st.interval,
    autoReconnect: true,
    onMessage: handleWsPayload,
    onStatus: (connected) => {
      if (!running) return;
      fb = connected ? applyWsOpen(fb, Date.now()) : applyWsDown(fb);
      useMarketStore.setState({ connected });
      if (!connected) {
        fb = evaluateSilence(fb, Date.now());
        syncTransport(true);
      }
    },
    onReconnect: () => {
      void useMarketStore.getState().refreshSnapshots();
    },
    onDead: handleDead,
  });
  ws.start();
}

function stopWs(): void {
  ws?.stop();
  ws = null;
}

function startPoller(): void {
  poller?.stop();
  poller = new RestPoller({
    getSymbols: () => extraSymbols,
    getChart: () => {
      const s = useMarketStore.getState();
      return { symbol: s.symbol, interval: s.interval };
    },
    getEnabledKinds: () => enabledPollKinds(fb),
    fetchPremium: fetchPremiumIndex,
    fetchDepth,
    fetchTicker: (s) => fetchTicker24h(s),
    fetchKlines,
    onPremium: applyPremium,
    onDepth: applyDepthBook,
    onTicker: applyTicker,
    onKlines: applyKlineBars,
  });
  poller.start();
}

function stopPoller(): void {
  poller?.stop();
  poller = null;
}

function startSilenceTimer(): void {
  stopSilenceTimer();
  silenceTimer = setInterval(() => {
    if (!running) return;
    const prev = lastMuteKey;
    fb = evaluateSilence(fb, Date.now());
    const next = muteKinds(fb).join(',');
    if (prev !== next) syncTransport(true);
  }, 500);
}

function stopSilenceTimer(): void {
  if (silenceTimer) {
    clearInterval(silenceTimer);
    silenceTimer = null;
  }
}

function syncTransport(nudge: boolean): void {
  const mute = muteKinds(fb);
  const t = transportOf(fb);
  const muteKey = mute.join(',');
  const prevT = useMarketStore.getState().transport;
  lastMuteKey = muteKey;
  useMarketStore.setState({
    transport: t,
    muteStreams: mute,
    connected: fb.wsOpen,
  });
  if (mute.length === 0) {
    stopPoller();
    if (prevT !== 'ws' && t === 'ws') setHint('已恢复实时 WebSocket 行情', 8_000);
    return;
  }
  if (!poller) startPoller();
  else if (nudge) poller.nudge();
}

function setHint(text: string | null, autoClearMs?: number): void {
  if (hintTimer) {
    clearTimeout(hintTimer);
    hintTimer = null;
  }
  useMarketStore.setState({ transportHint: text });
  if (text && autoClearMs) {
    hintTimer = setTimeout(() => {
      hintTimer = null;
      if (useMarketStore.getState().transportHint === text) {
        useMarketStore.setState({ transportHint: null });
      }
    }, autoClearMs);
  }
}

function startTickerTimer(): void {
  stopTickerTimer();
  tickerTimer = setInterval(() => {
    void fetchTicker24h()
      .then((list) => {
        const tickers: Record<string, Ticker24h> = {};
        for (const t of list) {
          if (t.symbol.endsWith('USDT')) tickers[t.symbol] = t;
        }
        useMarketStore.setState({ tickers });
      })
      .catch(() => undefined);
  }, 15_000);
}

function stopTickerTimer(): void {
  if (tickerTimer) {
    clearInterval(tickerTimer);
    tickerTimer = null;
  }
}

export const useMarketStore = create<MarketState>((set, get) => ({
  symbol: 'BTCUSDT',
  interval: '1m',
  connected: false,
  transport: 'ws',
  muteStreams: [],
  transportHint: null,
  endpoints: getEndpoints(),
  latencyMs: 0,
  lastPrice: 0,
  markPrice: 0,
  fundingRate: 0,
  nextFundingTime: 0,
  eventTime: 0,
  klines: [],
  depth: { bids: [], asks: [] },
  recentTrades: [],
  filters: {},
  tickers: {},
  lastPrices: {},
  markPrices: {},
  fundingRates: {},
  nextFundingTimes: {},
  fundingIntervals: {},
  depths: {},
  change1m: {},
  priceHist: {},
  symbols: [...POPULAR],
  ready: false,
  error: null,

  setSymbol: (s) => {
    set({ symbol: s });
    void get().refreshSnapshots();
    ws?.setTopic(s, get().interval, extraSymbols);
    poller?.nudge();
  },

  setInterval: (i) => {
    set({ interval: i });
    void get().refreshSnapshots();
    ws?.setTopic(get().symbol, i, extraSymbols);
    poller?.nudge();
  },

  start: () => {
    if (running) return;
    running = true;
    lastMuteKey = '';
    fb = createHybridState(Date.now());
    set({ transport: 'ws', muteStreams: [], connected: false, endpoints: getEndpoints() });
    startWs();
    startSilenceTimer();
    void get().refreshSnapshots();
    void bootstrap();
    startTickerTimer();
  },

  stop: () => {
    running = false;
    fb = createHybridState(Date.now());
    lastMuteKey = '';
    stopWs();
    stopPoller();
    stopTickerTimer();
    stopSilenceTimer();
    if (hintTimer) {
      clearTimeout(hintTimer);
      hintTimer = null;
    }
    set({ connected: false, transport: 'ws', muteStreams: [], transportHint: null });
  },

  restart: () => {
    get().stop();
    get().start();
  },

  hydrateEndpoints: async () => {
    const e = await loadEndpoints();
    set({ endpoints: e });
  },

  applyEndpoints: async (e) => {
    await saveEndpoints(e);
    set({ endpoints: getEndpoints() });
    get().restart();
  },

  refreshSnapshots: async () => {
    const { symbol, interval } = get();
    const [klinesR, depthR, premiumR, tickersR] = await Promise.allSettled([
      fetchKlines(symbol, interval, 500),
      fetchDepth(symbol),
      fetchPremiumIndex(symbol),
      fetchTicker24h(symbol),
    ]);
    if (klinesR.status === 'fulfilled') {
      const klines = klinesR.value;
      const close = klines[klines.length - 1]?.close;
      const st = useMarketStore.getState();
      const muted = fb.streams.aggTrade.source === 'poll';
      useMarketStore.setState({
        klines,
        ...(close != null && !muted
          ? { lastPrice: close, lastPrices: { ...st.lastPrices, [symbol]: close } }
          : {}),
      });
    }
    if (depthR.status === 'fulfilled') applyDepthBook(symbol, depthR.value);
    if (tickersR.status === 'fulfilled' && tickersR.value[0]) applyTicker(tickersR.value[0]);
    if (premiumR.status === 'fulfilled') applyPremium(premiumR.value);
    const allFailed = [klinesR, depthR, premiumR, tickersR].every((r) => r.status === 'rejected');
    if (allFailed) {
      const e = klinesR.status === 'rejected' ? klinesR.reason : null;
      set({ error: e instanceof Error ? e.message : '行情快照失败' });
    } else {
      set({ error: null });
      if (tickersR.status !== 'fulfilled') onTradeTick();
    }
  },
}));

async function bootstrap(): Promise<void> {
  try {
    const [info, tickers, funding] = await Promise.all([
      fetchExchangeInfo(),
      fetchTicker24h(),
      fetchFundingInfo().catch(() => [] as Awaited<ReturnType<typeof fetchFundingInfo>>),
    ]);
    const filters: Record<string, SymbolFilter> = {};
    for (const f of info) filters[f.symbol] = f;
    const tmap: Record<string, Ticker24h> = {};
    for (const t of tickers) {
      if (t.symbol.endsWith('USDT')) tmap[t.symbol] = t;
    }
    const symbols = info.map((s) => s.symbol).sort((a, b) => {
      const pa = POPULAR.indexOf(a);
      const pb = POPULAR.indexOf(b);
      if (pa >= 0 && pb >= 0) return pa - pb;
      if (pa >= 0) return -1;
      if (pb >= 0) return 1;
      return a.localeCompare(b);
    });
    useMarketStore.setState({
      filters,
      tickers: tmap,
      symbols,
      fundingIntervals: mergeFundingIntervals(useMarketStore.getState().fundingIntervals, funding),
      ready: true,
    });
  } catch (e) {
    useMarketStore.setState({
      error: e instanceof Error ? e.message : 'exchangeInfo 失败',
      ready: true,
    });
  }
}

export function currentMarketCtxNow() {
  const m = useMarketStore.getState();
  return {
    lastPrice: { ...m.lastPrices, [m.symbol]: m.lastPrice || m.lastPrices[m.symbol] || 0 },
    markPrice: { ...m.markPrices, [m.symbol]: m.markPrice || m.markPrices[m.symbol] || 0 },
    fundingRate: { ...m.fundingRates, [m.symbol]: m.fundingRate },
    nextFundingTime: { ...m.nextFundingTimes, [m.symbol]: m.nextFundingTime },
    depth: { ...m.depths, [m.symbol]: m.depth },
    change1m: m.change1m,
    now: Date.now(),
  };
}

export function subscribedSymbols(): string[] {
  return uniqueSymbols(useMarketStore.getState().symbol, extraSymbols);
}
