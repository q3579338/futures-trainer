/**
 * 子流健康监测 + 混合模式。纯函数，便于单测。
 *
 * 组合流连接活着不代表每条子流都在推：实测 depth 正常、markPrice/aggTrade/kline 全 0。
 * 哪条静默超过阈值，只对那条开 REST 轮询；恢复推送后停掉对应轮询。
 */

export type StreamKind = 'markPrice' | 'aggTrade' | 'depth' | 'kline';
export type StreamSource = 'ws' | 'poll';
export type Transport = 'ws' | 'hybrid' | 'polling';

export const STREAM_KINDS: StreamKind[] = ['markPrice', 'aggTrade', 'depth', 'kline'];

/** 按各流自然频率：1s 标记价 / 100ms 盘口 / 成交稀疏 / K 线只在有成交时推 */
export const STREAM_SILENCE_MS: Record<StreamKind, number> = {
  markPrice: 5_000,
  depth: 3_000,
  aggTrade: 10_000,
  kline: 90_000,
};

export const STREAM_LABEL: Record<StreamKind, string> = {
  markPrice: '标记价',
  aggTrade: '成交',
  depth: '盘口',
  kline: 'K线',
};

export const STREAM_TO_POLL: Record<StreamKind, 'premiumIndex' | 'ticker24h' | 'depth' | 'klines'> = {
  markPrice: 'premiumIndex',
  aggTrade: 'ticker24h',
  depth: 'depth',
  kline: 'klines',
};

export interface StreamHealth {
  lastWsAt: number | null;
  source: StreamSource;
}

export interface HybridState {
  /** 开始观察的时刻：WS open 或会话启动。从未收到的流用它当静默起点。 */
  watchAt: number;
  wsOpen: boolean;
  streams: Record<StreamKind, StreamHealth>;
}

function blankStreams(): Record<StreamKind, StreamHealth> {
  return {
    markPrice: { lastWsAt: null, source: 'ws' },
    aggTrade: { lastWsAt: null, source: 'ws' },
    depth: { lastWsAt: null, source: 'ws' },
    kline: { lastWsAt: null, source: 'ws' },
  };
}

export function createHybridState(now: number): HybridState {
  return {
    watchAt: now,
    wsOpen: false,
    streams: blankStreams(),
  };
}

export function applyWsOpen(s: HybridState, now: number): HybridState {
  const streams = { ...s.streams };
  for (const k of STREAM_KINDS) {
    streams[k] = { ...streams[k], lastWsAt: null };
  }
  return { ...s, watchAt: now, wsOpen: true, streams };
}

export function applyWsDown(s: HybridState): HybridState {
  return { ...s, wsOpen: false };
}

export function applyWsStreamMessage(s: HybridState, kind: StreamKind, now: number): HybridState {
  return {
    ...s,
    streams: {
      ...s.streams,
      [kind]: { lastWsAt: now, source: 'ws' },
    },
  };
}

export function evaluateSilence(s: HybridState, now: number): HybridState {
  let changed = false;
  const streams = { ...s.streams };
  for (const kind of STREAM_KINDS) {
    const h = streams[kind]!;
    if (h.source === 'poll') continue;
    const last = h.lastWsAt ?? s.watchAt;
    if (now - last >= STREAM_SILENCE_MS[kind]) {
      streams[kind] = { ...h, source: 'poll' };
      changed = true;
    }
  }
  return changed ? { ...s, streams } : s;
}

export function muteKinds(s: HybridState): StreamKind[] {
  return STREAM_KINDS.filter((k) => s.streams[k]!.source === 'poll');
}

export function enabledPollKinds(s: HybridState): Array<(typeof STREAM_TO_POLL)[StreamKind]> {
  return muteKinds(s).map((k) => STREAM_TO_POLL[k]);
}

export function transportOf(s: HybridState): Transport {
  const n = muteKinds(s).length;
  if (n === 0) return 'ws';
  if (n === STREAM_KINDS.length) return 'polling';
  return 'hybrid';
}

export function hasValidMarkPrice(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

export function statusBarText(opts: {
  transport: Transport;
  mute: StreamKind[];
  latencyMs: number;
  hasMarkPrice: boolean;
  wsOpen: boolean;
}): string {
  if (opts.transport === 'polling') return '轮询模式 · 1s';
  if (opts.transport === 'hybrid') {
    const parts = opts.mute.map((k) => `${STREAM_LABEL[k]}轮询`);
    return `混合模式 · ${parts.join(' · ')}`;
  }
  if (!opts.hasMarkPrice) return opts.wsOpen ? '等待标记价' : '重连中';
  return `实时 · ${Math.max(0, Math.round(opts.latencyMs))}ms`;
}

export function statusBarTone(opts: {
  transport: Transport;
  hasMarkPrice: boolean;
}): 'live' | 'hybrid' | 'polling' | 'wait' {
  if (opts.transport === 'polling') return 'polling';
  if (opts.transport === 'hybrid') return 'hybrid';
  if (!opts.hasMarkPrice) return 'wait';
  return 'live';
}

export function streamKindFromName(stream: string): StreamKind | null {
  const n = stream.toLowerCase();
  if (n.includes('@markprice')) return 'markPrice';
  if (n.includes('@aggtrade')) return 'aggTrade';
  if (n.includes('@depth')) return 'depth';
  if (n.includes('@kline_')) return 'kline';
  return null;
}
