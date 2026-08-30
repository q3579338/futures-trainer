import { DEFAULT_REST_BASE, getEndpoints, wsStreamUrl } from './endpoints';
import { restFetchBase } from './rest';

export const DIAGNOSE_WINDOW_MS = 12_000;

export const DIAGNOSE_STREAMS = [
  'btcusdt@aggTrade',
  'btcusdt@markPrice@1s',
  'btcusdt@depth20@100ms',
  'btcusdt@kline_1m',
] as const;

export interface DiagnoseItem {
  id: string;
  name: string;
  ok: boolean;
  ms: number;
  detail: string;
}

export interface DiagnoseReport {
  items: DiagnoseItem[];
  summary: string;
}

export const REST_FAIL_HINT =
  'REST 直连不可用。请检查网络，或在「行情源设置」填写可用的镜像/代理地址后重试。';
export const WS_FAIL_HINT =
  'WebSocket 连不上，通常是 DNS 污染或网络限制，请开启代理/VPN 后重试；运行时将对全部子流启用 REST 轮询';
export const ALL_STREAMS_OK_HINT = '全部子流正常。将使用实时 WebSocket 行情。';
export const WS_OPEN_ALL_MUTE_HINT =
  'WebSocket 连接能打开，但 12 秒内所有子流都是 0 条。运行时将进入轮询模式。';
export const PARTIAL_MUTE_HINT =
  'WebSocket 连接是活的，但部分子流无数据。运行时只对哑流启用 REST 轮询（混合模式），其余继续走 WS。';

type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<Response>;

interface WsLike {
  onopen: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  close: () => void;
}

type WsCtor = new (url: string) => WsLike;

export function streamShortName(stream: string): string {
  const i = stream.indexOf('@');
  return i >= 0 ? stream.slice(i + 1) : stream;
}

export function streamLine(name: string, count: number): string {
  return `${name}：${count} 条 ${count > 0 ? '✅' : '❌'}`;
}

export function summarize(opts: {
  restOk: boolean;
  wsOpen: boolean;
  streams: Array<{ name: string; count: number }>;
}): string {
  const { restOk, wsOpen, streams } = opts;
  if (!wsOpen) {
    return restOk ? WS_FAIL_HINT : `${REST_FAIL_HINT} ${WS_FAIL_HINT}`;
  }
  const live = streams.filter((s) => s.count > 0);
  const mute = streams.filter((s) => s.count === 0);
  const restBit = restOk ? 'REST 直连可用。' : REST_FAIL_HINT;
  if (mute.length === 0) return `${ALL_STREAMS_OK_HINT} ${restBit}`.trim();
  if (live.length === 0) return `${WS_OPEN_ALL_MUTE_HINT} ${restBit}`.trim();
  const muteNames = mute.map((s) => s.name).join('、');
  const liveNames = live.map((s) => s.name).join('、');
  return `${PARTIAL_MUTE_HINT} 哑流：${muteNames}；正常：${liveNames}。${restBit}`;
}

export async function diagnoseConnection(opts?: {
  onItem?: (item: DiagnoseItem) => void;
  fetchImpl?: FetchLike;
  WebSocketImpl?: WsCtor;
  restBase?: string;
  wsBase?: string;
  timeoutMs?: number;
  windowMs?: number;
}): Promise<DiagnoseReport> {
  const timeoutMs = opts?.timeoutMs ?? 10_000;
  const windowMs = opts?.windowMs ?? DIAGNOSE_WINDOW_MS;
  const restBase = opts?.restBase ?? restFetchBase();
  const wsBase = opts?.wsBase ?? getEndpoints().wsBase;
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const items: DiagnoseItem[] = [];
  const push = (it: DiagnoseItem) => {
    items.push(it);
    opts?.onItem?.(it);
  };

  const rest = await probeRest(fetchImpl, restBase, timeoutMs);
  push(rest);

  const ws = await probeCombinedStream(opts?.WebSocketImpl, wsBase, timeoutMs, windowMs);
  push(ws.open);
  for (const row of ws.streams) push(row);

  const streamRows = ws.streams.map((it) => ({
    name: it.name,
    count: parseCount(it.detail),
  }));
  const summary = summarize({
    restOk: rest.ok,
    wsOpen: ws.open.ok,
    streams: streamRows,
  });
  return { items, summary };
}

function parseCount(detail: string): number {
  const m = detail.match(/(\d+)\s*条/);
  return m ? Number(m[1]) : 0;
}

async function probeRest(fetchImpl: FetchLike, restBase: string, timeoutMs: number): Promise<DiagnoseItem> {
  const t0 = Date.now();
  const base = restBase || DEFAULT_REST_BASE;
  const url = `${base}/fapi/v1/time`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal });
    const ms = Date.now() - t0;
    if (!res.ok) {
      return item('rest', 'REST 直连', false, ms, `HTTP ${res.status}（${url}）`);
    }
    const body = (await res.json()) as { serverTime?: unknown };
    if (typeof body.serverTime !== 'number') {
      return item('rest', 'REST 直连', false, ms, '响应不是有效的 serverTime');
    }
    return item('rest', 'REST 直连', true, ms, `HTTP 200 · serverTime ${body.serverTime} · ${url}`);
  } catch (e) {
    const ms = Date.now() - t0;
    const aborted = e instanceof Error && e.name === 'AbortError';
    return item('rest', 'REST 直连', false, ms, aborted ? `超时 ${timeoutMs}ms` : errText(e));
  } finally {
    clearTimeout(timer);
  }
}

function probeCombinedStream(
  WebSocketImpl: WsCtor | undefined,
  wsBase: string,
  handshakeTimeoutMs: number,
  windowMs: number,
): Promise<{ open: DiagnoseItem; streams: DiagnoseItem[] }> {
  const Ctor = WebSocketImpl ?? (globalThis as { WebSocket?: WsCtor }).WebSocket;
  const url = wsStreamUrl(DIAGNOSE_STREAMS.join('/'), wsBase);
  const emptyStreams = (): DiagnoseItem[] =>
    DIAGNOSE_STREAMS.map((full) => {
      const name = streamShortName(full);
      return item(`stream:${name}`, name, false, 0, '0 条');
    });

  if (!Ctor) {
    return Promise.resolve({
      open: item('ws', 'WS 组合流', false, 0, '当前环境不支持 WebSocket'),
      streams: emptyStreams(),
    });
  }

  return new Promise((resolve) => {
    const t0 = Date.now();
    let settled = false;
    let opened = false;
    let sock: WsLike | null = null;
    const counts: Record<string, number> = {};
    for (const full of DIAGNOSE_STREAMS) counts[streamShortName(full)] = 0;

    let handshakeTimer: ReturnType<typeof setTimeout> | undefined;
    let windowTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (ok: boolean, detail: string) => {
      if (settled) return;
      settled = true;
      if (handshakeTimer) clearTimeout(handshakeTimer);
      if (windowTimer) clearTimeout(windowTimer);
      try {
        sock?.close();
      } catch {
        /* ignore */
      }
      const elapsed = Date.now() - t0;
      const streams = DIAGNOSE_STREAMS.map((full) => {
        const name = streamShortName(full);
        const count = counts[name] ?? 0;
        return item(`stream:${name}`, name, count > 0, elapsed, `${count} 条`);
      });
      resolve({
        open: item('ws', 'WS 组合流', ok, elapsed, detail),
        streams,
      });
    };

    handshakeTimer = setTimeout(() => {
      if (!opened) finish(false, `握手超时 ${handshakeTimeoutMs}ms`);
    }, handshakeTimeoutMs);

    try {
      sock = new Ctor(url);
    } catch (e) {
      finish(false, errText(e));
      return;
    }
    sock.onopen = () => {
      opened = true;
      clearTimeout(handshakeTimer);
      windowTimer = setTimeout(() => finish(true, `观察 ${windowMs}ms`), windowMs);
    };
    sock.onmessage = (ev) => {
      try {
        const payload = JSON.parse(String(ev.data)) as { stream?: string };
        if (!payload.stream) return;
        const name = streamShortName(payload.stream);
        if (name in counts) counts[name] = (counts[name] ?? 0) + 1;
      } catch {
        /* ignore */
      }
    };
    sock.onerror = () => {
      if (!opened) finish(false, `握手失败（${url}）`);
    };
    sock.onclose = () => {
      if (!opened && !settled) finish(false, '连接在握手完成前关闭');
    };
  });
}

function item(id: string, name: string, ok: boolean, ms: number, detail: string): DiagnoseItem {
  return { id, name, ok, ms, detail };
}

function errText(e: unknown): string {
  if (e instanceof Error) return e.message || e.name;
  return String(e);
}
