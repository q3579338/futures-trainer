/**
 * 币安 USDⓈ-M 组合流：{wsBase}/stream?streams=...
 * 断线指数退避 1s→2s→4s…上限 30s，重连后由调用方重拉 REST 快照。
 * 连接超时 10s；整条连接 20s 无任何消息才视为死连接。
 * 子流是否哑由 Hybrid 状态机按 lastMessageAt 判定，这里不因「收到过任意消息」就当全流健康。
 */
import { wsStreamUrl } from './endpoints';

export const WS_CONNECT_TIMEOUT_MS = 10_000;
export const WS_STALE_MS = 20_000;

export type Interval =
  | '1m'
  | '3m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '4h'
  | '6h'
  | '12h'
  | '1d'
  | '1w'
  | '1M';

export interface AggTradeMsg {
  e: 'aggTrade';
  E: number;
  s: string;
  p: string;
  q: string;
  T: number;
  m: boolean;
}

export interface MarkPriceMsg {
  e: 'markPriceUpdate';
  E: number;
  s: string;
  p: string;
  r: string;
  T: number;
}

export interface DepthMsg {
  e?: string;
  E?: number;
  s?: string;
  lastUpdateId?: number;
  /** 币安合约 WS 盘口流用 b/a；REST /fapi/v1/depth 用 bids/asks。两种都要能解析。 */
  b?: string[][];
  a?: string[][];
  bids?: string[][];
  asks?: string[][];
}

export interface KlineMsg {
  e: 'kline';
  E: number;
  s: string;
  k: {
    t: number;
    T: number;
    s: string;
    i: string;
    o: string;
    c: string;
    h: string;
    l: string;
    v: string;
    x: boolean;
  };
}

export type StreamHandler = (stream: string, data: unknown) => void;

export type WsDeadReason = 'close' | 'connect-timeout' | 'stale';

export interface WsDeadInfo {
  reason: WsDeadReason;
}

export class BinanceWs {
  private ws: WebSocket | null = null;
  private backoff = 1000;
  private destroyed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private staleTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private symbol: string;
  private extra: string[];
  private interval: Interval;
  private onMessage: StreamHandler;
  private onStatus: (connected: boolean) => void;
  private onReconnect: () => void;
  private onDead: (info: WsDeadInfo) => void;
  autoReconnect = true;

  constructor(opts: {
    symbol: string;
    extra?: string[];
    interval: Interval;
    onMessage: StreamHandler;
    onStatus: (connected: boolean) => void;
    onReconnect: () => void;
    onDead?: (info: WsDeadInfo) => void;
    autoReconnect?: boolean;
  }) {
    this.symbol = opts.symbol;
    this.extra = opts.extra ?? [];
    this.interval = opts.interval;
    this.onMessage = opts.onMessage;
    this.onStatus = opts.onStatus;
    this.onReconnect = opts.onReconnect;
    this.onDead = opts.onDead ?? (() => undefined);
    this.autoReconnect = opts.autoReconnect ?? true;
  }

  start(): void {
    this.destroyed = false;
    this.open();
  }

  setTopic(symbol: string, interval: Interval, extra: string[] = []): void {
    const extraKey = extra.slice().sort().join(',');
    const prevKey = this.extra.slice().sort().join(',');
    if (symbol === this.symbol && interval === this.interval && extraKey === prevKey) return;
    this.symbol = symbol;
    this.interval = interval;
    this.extra = extra;
    this.backoff = 1000;
    this.closeSocket();
    this.open();
  }

  setAutoReconnect(v: boolean): void {
    this.autoReconnect = v;
  }

  stop(): void {
    this.destroyed = true;
    this.clearTimers();
    this.closeSocket();
    this.onStatus(false);
  }

  private streams(): string {
    const all = Array.from(new Set([this.symbol, ...this.extra].map((x) => x.toLowerCase())));
    const parts: string[] = [];
    for (const s of all) {
      parts.push(`${s}@aggTrade`, `${s}@markPrice@1s`, `${s}@depth20@100ms`);
    }
    parts.push(`${this.symbol.toLowerCase()}@kline_${this.interval}`);
    return parts.join('/');
  }

  private open(): void {
    if (this.destroyed) return;
    this.closeSocket();
    const url = wsStreamUrl(this.streams());
    const ws = new WebSocket(url);
    this.ws = ws;
    this.armConnectTimeout();
    ws.onopen = () => {
      this.clearConnectTimer();
      this.backoff = 1000;
      this.onStatus(true);
      this.armStale();
    };
    ws.onmessage = (ev) => {
      this.armStale();
      try {
        const payload = JSON.parse(String(ev.data)) as { stream?: string; data?: unknown };
        if (payload.stream && payload.data) this.onMessage(payload.stream, payload.data);
      } catch {
        /* ignore malformed */
      }
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };
    ws.onclose = () => {
      this.clearConnectTimer();
      this.onStatus(false);
      this.onDead({ reason: 'close' });
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.destroyed || !this.autoReconnect) return;
    this.clearTimers();
    const wait = this.backoff;
    this.backoff = Math.min(this.backoff * 2, 30_000);
    this.timer = setTimeout(() => {
      this.onReconnect();
      this.open();
    }, wait);
  }

  private armConnectTimeout(): void {
    this.clearConnectTimer();
    this.connectTimer = setTimeout(() => {
      this.connectTimer = null;
      this.onDead({ reason: 'connect-timeout' });
      this.closeSocket();
      this.scheduleReconnect();
    }, WS_CONNECT_TIMEOUT_MS);
  }

  private armStale(): void {
    if (this.staleTimer) clearTimeout(this.staleTimer);
    this.staleTimer = setTimeout(() => {
      this.onDead({ reason: 'stale' });
      this.closeSocket();
      this.scheduleReconnect();
    }, WS_STALE_MS);
  }

  private closeSocket(): void {
    if (!this.ws) return;
    const ws = this.ws;
    this.ws = null;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  }

  private clearConnectTimer(): void {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }

  private clearTimers(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.staleTimer) {
      clearTimeout(this.staleTimer);
      this.staleTimer = null;
    }
    this.clearConnectTimer();
  }
}
