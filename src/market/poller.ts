import { RestHttpError, type Kline, type PremiumIndex, type Ticker24h } from './rest';
import type { DepthBook } from '../engine/types';

export type PollKind = 'premiumIndex' | 'depth' | 'ticker24h' | 'klines';

export const POLL_EVERY_MS: Record<PollKind, number> = {
  premiumIndex: 1_000,
  depth: 1_000,
  ticker24h: 2_000,
  klines: 3_000,
};

export const BACKOFF_INITIAL_MS = 1_000;
export const BACKOFF_MAX_MS = 30_000;

export interface PollJob {
  kind: PollKind;
  symbol: string;
}

export function uniqueSymbols(current: string, extras: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [current, ...extras]) {
    const s = raw.trim().toUpperCase();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export function isDue(lastAt: number | undefined, everyMs: number, now: number): boolean {
  if (lastAt == null) return true;
  return now - lastAt >= everyMs;
}

export function nextBackoffMs(prevBackoffMs: number): number {
  if (prevBackoffMs <= 0) return BACKOFF_INITIAL_MS;
  return Math.min(prevBackoffMs * 2, BACKOFF_MAX_MS);
}

export function computeBackoffUntil(
  prevBackoffMs: number,
  now: number,
  retryAfterMs: number | null,
): { backoffMs: number; backoffUntil: number } {
  const backoffMs =
    retryAfterMs != null && retryAfterMs > 0
      ? Math.min(retryAfterMs, 60_000)
      : nextBackoffMs(prevBackoffMs);
  return { backoffMs, backoffUntil: now + backoffMs };
}

export function canPoll(backoffUntil: number, now: number): boolean {
  return now >= backoffUntil;
}

/** 只订当前 symbol + 持仓 symbol；K 线只补图表那一个。只派发 enabled 里的 kind（混合模式只补哑流）。 */
export function planPolls(opts: {
  now: number;
  backoffUntil: number;
  last: Partial<Record<PollKind, number>>;
  symbols: string[];
  chartSymbol: string;
  enabled: PollKind[];
}): PollJob[] {
  if (!canPoll(opts.backoffUntil, opts.now)) return [];
  if (opts.enabled.length === 0) return [];
  const on = new Set(opts.enabled);
  const jobs: PollJob[] = [];
  const list = opts.symbols.length > 0 ? opts.symbols : [opts.chartSymbol];
  if (on.has('premiumIndex') && isDue(opts.last.premiumIndex, POLL_EVERY_MS.premiumIndex, opts.now)) {
    for (const s of list) jobs.push({ kind: 'premiumIndex', symbol: s });
  }
  if (on.has('depth') && isDue(opts.last.depth, POLL_EVERY_MS.depth, opts.now)) {
    for (const s of list) jobs.push({ kind: 'depth', symbol: s });
  }
  if (on.has('ticker24h') && isDue(opts.last.ticker24h, POLL_EVERY_MS.ticker24h, opts.now)) {
    for (const s of list) jobs.push({ kind: 'ticker24h', symbol: s });
  }
  if (on.has('klines') && isDue(opts.last.klines, POLL_EVERY_MS.klines, opts.now)) {
    jobs.push({ kind: 'klines', symbol: opts.chartSymbol });
  }
  return jobs;
}

export interface RestPollerOpts {
  getSymbols: () => string[];
  getChart: () => { symbol: string; interval: string };
  getEnabledKinds: () => PollKind[];
  fetchPremium: (symbol: string) => Promise<PremiumIndex>;
  fetchDepth: (symbol: string) => Promise<DepthBook>;
  fetchTicker: (symbol: string) => Promise<Ticker24h[]>;
  fetchKlines: (symbol: string, interval: string, limit: number) => Promise<Kline[]>;
  onPremium: (p: PremiumIndex) => void;
  onDepth: (symbol: string, book: DepthBook) => void;
  onTicker: (t: Ticker24h) => void;
  onKlines: (symbol: string, bars: Kline[]) => void;
  now?: () => number;
}

export class RestPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private last: Partial<Record<PollKind, number>> = {};
  private backoffMs = 0;
  private backoffUntil = 0;
  private inFlight = false;
  private stopped = true;

  constructor(private readonly opts: RestPollerOpts) {}

  start(): void {
    this.stopped = false;
    this.last = {};
    this.backoffMs = 0;
    this.backoffUntil = 0;
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, 250);
  }

  stop(): void {
    this.stopped = true;
    this.inFlight = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** 订阅集变化时立刻再拉一轮。 */
  nudge(): void {
    this.last = {};
    if (!this.stopped) void this.tick();
  }

  /** 单测可见 */
  getBackoff(): { backoffMs: number; backoffUntil: number } {
    return { backoffMs: this.backoffMs, backoffUntil: this.backoffUntil };
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.inFlight) return;
    const now = this.opts.now?.() ?? Date.now();
    const chart = this.opts.getChart();
    const jobs = planPolls({
      now,
      backoffUntil: this.backoffUntil,
      last: this.last,
      symbols: uniqueSymbols(chart.symbol, this.opts.getSymbols()),
      chartSymbol: chart.symbol,
      enabled: this.opts.getEnabledKinds(),
    });
    if (jobs.length === 0) return;
    this.inFlight = true;
    const ran = new Set<PollKind>();
    try {
      for (const job of jobs) {
        if (this.stopped) return;
        try {
          await this.runJob(job, chart.interval);
          ran.add(job.kind);
        } catch (e) {
          if (e instanceof RestHttpError && e.status === 429) {
            const next = computeBackoffUntil(this.backoffMs, now, e.retryAfterMs);
            this.backoffMs = next.backoffMs;
            this.backoffUntil = next.backoffUntil;
            return;
          }
          /* 单次其它错误：该 kind 不记 last，下轮再试 */
        }
      }
      if (ran.size > 0) {
        this.backoffMs = 0;
        this.backoffUntil = 0;
        for (const k of ran) this.last[k] = now;
      }
    } finally {
      this.inFlight = false;
    }
  }

  private async runJob(job: PollJob, interval: string): Promise<void> {
    switch (job.kind) {
      case 'premiumIndex': {
        const p = await this.opts.fetchPremium(job.symbol);
        if (!this.stopped) this.opts.onPremium(p);
        return;
      }
      case 'depth': {
        const d = await this.opts.fetchDepth(job.symbol);
        if (!this.stopped) this.opts.onDepth(job.symbol, d);
        return;
      }
      case 'ticker24h': {
        const list = await this.opts.fetchTicker(job.symbol);
        const t = list[0];
        if (t && !this.stopped) this.opts.onTicker(t);
        return;
      }
      case 'klines': {
        const bars = await this.opts.fetchKlines(job.symbol, interval, 2);
        if (!this.stopped) this.opts.onKlines(job.symbol, bars);
      }
    }
  }
}
