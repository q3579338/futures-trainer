import { getEndpoints } from './endpoints';

export interface SymbolFilter {
  symbol: string;
  tickSize: number;
  stepSize: number;
  minQty: number;
  minNotional: number;
  pricePrecision: number;
  quantityPrecision: number;
  status: string;
}

export interface PremiumIndex {
  symbol: string;
  markPrice: number;
  lastFundingRate: number;
  nextFundingTime: number;
  time: number;
}

export class RestHttpError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;
  constructor(status: number, path: string, retryAfterMs: number | null = null) {
    super(`REST ${status} ${path}`);
    this.name = 'RestHttpError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export function parseRetryAfterMs(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const sec = Number(header);
  if (Number.isFinite(sec) && sec >= 0) return Math.round(sec * 1000);
  const abs = Date.parse(header);
  if (Number.isFinite(abs)) return Math.max(0, abs - now);
  return null;
}

export interface Kline {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Ticker24h {
  symbol: string;
  lastPrice: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number;
}

/** 浏览器直连 REST 基址（币安公开接口带 CORS）。自定义镜像由行情源设置覆盖。 */
export function restFetchBase(): string {
  return getEndpoints().restBase;
}

async function getJson<T>(path: string): Promise<T> {
  const url = `${restFetchBase()}${path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      throw new RestHttpError(res.status, path, parseRetryAfterMs(res.headers.get('Retry-After')));
    }
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

interface RawFilter {
  filterType: string;
  tickSize?: string;
  stepSize?: string;
  minQty?: string;
  notional?: string;
  minNotional?: string;
}

interface RawSymbol {
  symbol: string;
  status: string;
  contractType: string;
  quoteAsset: string;
  pricePrecision: number;
  quantityPrecision: number;
  filters: RawFilter[];
}

interface ExchangeInfo {
  symbols: RawSymbol[];
}

export async function fetchExchangeInfo(): Promise<SymbolFilter[]> {
  const info = await getJson<ExchangeInfo>('/fapi/v1/exchangeInfo');
  const out: SymbolFilter[] = [];
  for (const s of info.symbols) {
    if (s.contractType !== 'PERPETUAL' || s.quoteAsset !== 'USDT') continue;
    if (s.status !== 'TRADING') continue;
    const price = s.filters.find((f) => f.filterType === 'PRICE_FILTER');
    const lot = s.filters.find((f) => f.filterType === 'LOT_SIZE');
    const minN = s.filters.find((f) => f.filterType === 'MIN_NOTIONAL');
    out.push({
      symbol: s.symbol,
      tickSize: Number(price?.tickSize ?? 0.01),
      stepSize: Number(lot?.stepSize ?? 0.001),
      minQty: Number(lot?.minQty ?? 0.001),
      minNotional: Number(minN?.notional ?? minN?.minNotional ?? 5),
      pricePrecision: s.pricePrecision,
      quantityPrecision: s.quantityPrecision,
      status: s.status,
    });
  }
  return out;
}

type RawKline = [number, string, string, string, string, string, number, ...unknown[]];

export async function fetchKlines(
  symbol: string,
  interval: string,
  limit = 500,
  startTime?: number,
  endTime?: number,
): Promise<Kline[]> {
  let q = `/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`;
  if (startTime != null) q += `&startTime=${startTime}`;
  if (endTime != null) q += `&endTime=${endTime}`;
  const raw = await getJson<RawKline[]>(q);
  return raw.map((k) => ({
    time: Math.floor(k[0] / 1000),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
  }));
}

export async function fetchTicker24h(symbol?: string): Promise<Ticker24h[]> {
  const q = symbol
    ? `/fapi/v1/ticker/24hr?symbol=${encodeURIComponent(symbol)}`
    : '/fapi/v1/ticker/24hr';
  const raw = await getJson<unknown>(q);
  const arr = Array.isArray(raw) ? raw : [raw];
  return (arr as Array<Record<string, string>>).map((t) => ({
    symbol: String(t['symbol'] ?? ''),
    lastPrice: Number(t['lastPrice']),
    priceChangePercent: Number(t['priceChangePercent']),
    highPrice: Number(t['highPrice']),
    lowPrice: Number(t['lowPrice']),
    volume: Number(t['volume']),
    quoteVolume: Number(t['quoteVolume']),
  }));
}

/** 币安只认 5/10/20/50/100/500/1000；默认 20 档（跟 WS 的 depth20 对齐），深盘用 500。 */
export const DEPTH_LIMITS = [5, 10, 20, 50, 100, 500, 1000] as const;
export type DepthLimit = (typeof DEPTH_LIMITS)[number];

export async function fetchDepth(symbol: string, limit: DepthLimit = 20): Promise<{
  bids: Array<[number, number]>;
  asks: Array<[number, number]>;
}> {
  const raw = await getJson<{ bids: string[][]; asks: string[][] }>(
    `/fapi/v1/depth?symbol=${encodeURIComponent(symbol)}&limit=${limit}`,
  );
  return {
    bids: raw.bids.map((x) => [Number(x[0]), Number(x[1])]),
    asks: raw.asks.map((x) => [Number(x[0]), Number(x[1])]),
  };
}

export async function fetchPremiumIndex(symbol: string): Promise<PremiumIndex> {
  const raw = await getJson<Record<string, string | number>>(
    `/fapi/v1/premiumIndex?symbol=${encodeURIComponent(symbol)}`,
  );
  return {
    symbol: String(raw.symbol ?? symbol),
    markPrice: Number(raw.markPrice),
    lastFundingRate: Number(raw.lastFundingRate),
    nextFundingTime: Number(raw.nextFundingTime),
    time: Number(raw.time),
  };
}

export async function fetchServerTime(): Promise<number> {
  const raw = await getJson<{ serverTime: number }>('/fapi/v1/time');
  return Number(raw.serverTime);
}

export interface FundingInfo {
  symbol: string;
  fundingIntervalHours: number;
}

/** 仅返回非默认周期的合约；未出现的币对按 8h 处理。 */
export async function fetchFundingInfo(): Promise<FundingInfo[]> {
  const raw = await getJson<Array<Record<string, unknown>>>('/fapi/v1/fundingInfo');
  return (Array.isArray(raw) ? raw : []).map((r) => ({
    symbol: String(r.symbol ?? ''),
    fundingIntervalHours: Number(r.fundingIntervalHours ?? 8),
  }));
}

export const POPULAR = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'DOGEUSDT',
  'ADAUSDT',
  'AVAXUSDT',
  'LINKUSDT',
  'SUIUSDT',
];
