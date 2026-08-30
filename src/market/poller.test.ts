import { describe, expect, it } from 'vitest';
import { RestHttpError, parseRetryAfterMs } from './rest';
import {
  BACKOFF_INITIAL_MS,
  BACKOFF_MAX_MS,
  POLL_EVERY_MS,
  RestPoller,
  computeBackoffUntil,
  nextBackoffMs,
  planPolls,
  uniqueSymbols,
  type PollKind,
} from './poller';

const ALL: PollKind[] = ['premiumIndex', 'depth', 'ticker24h', 'klines'];

function lastAt(partial: Partial<Record<PollKind, number>> = {}): Partial<Record<PollKind, number>> {
  return partial;
}

describe('轮询订阅节流', () => {
  it('只订当前 symbol + 持仓 symbol，去重且忽略空串', () => {
    expect(uniqueSymbols('btcusdt', ['ETHUSDT', 'BTCUSDT', '', 'ethusdt'])).toEqual([
      'BTCUSDT',
      'ETHUSDT',
    ]);
  });

  it('t=0 全部到期：premium/depth/ticker 按订阅数，kline 只订图表 symbol', () => {
    const jobs = planPolls({
      now: 0,
      backoffUntil: 0,
      last: lastAt(),
      symbols: ['BTCUSDT', 'ETHUSDT'],
      chartSymbol: 'BTCUSDT',
      enabled: ALL,
    });
    const kinds = jobs.map((j) => `${j.kind}:${j.symbol}`).sort();
    expect(kinds).toEqual(
      [
        'depth:BTCUSDT',
        'depth:ETHUSDT',
        'klines:BTCUSDT',
        'premiumIndex:BTCUSDT',
        'premiumIndex:ETHUSDT',
        'ticker24h:BTCUSDT',
        'ticker24h:ETHUSDT',
      ].sort(),
    );
    expect(jobs.filter((j) => j.kind === 'klines')).toHaveLength(1);
    expect(jobs.filter((j) => j.kind === 'klines')[0]?.symbol).toBe('BTCUSDT');
  });

  it('1s：只有 premiumIndex 与 depth；ticker 要 2s，kline 要 3s', () => {
    const last = lastAt({
      premiumIndex: 0,
      depth: 0,
      ticker24h: 0,
      klines: 0,
    });
    const at999 = planPolls({
      now: POLL_EVERY_MS.premiumIndex - 1,
      backoffUntil: 0,
      last,
      symbols: ['BTCUSDT'],
      chartSymbol: 'BTCUSDT',
      enabled: ALL,
    });
    expect(at999).toEqual([]);

    const at1s = planPolls({
      now: 1_000,
      backoffUntil: 0,
      last,
      symbols: ['BTCUSDT'],
      chartSymbol: 'BTCUSDT',
      enabled: ALL,
    });
    expect(at1s.map((j) => j.kind).sort()).toEqual(['depth', 'premiumIndex']);

    const at2s = planPolls({
      now: 2_000,
      backoffUntil: 0,
      last,
      symbols: ['BTCUSDT'],
      chartSymbol: 'BTCUSDT',
      enabled: ALL,
    });
    expect(at2s.map((j) => j.kind).sort()).toEqual(['depth', 'premiumIndex', 'ticker24h']);

    const at3s = planPolls({
      now: 3_000,
      backoffUntil: 0,
      last: lastAt({
        premiumIndex: 0,
        depth: 0,
        ticker24h: 2_000,
        klines: 0,
      }),
      symbols: ['BTCUSDT'],
      chartSymbol: 'BTCUSDT',
      enabled: ALL,
    });
    expect(at3s.map((j) => j.kind).sort()).toEqual(['depth', 'klines', 'premiumIndex']);
  });

  it('enabled 为空不派发；只派发哑流对应 kind', () => {
    expect(
      planPolls({
        now: 0,
        backoffUntil: 0,
        last: lastAt(),
        symbols: ['BTCUSDT'],
        chartSymbol: 'BTCUSDT',
        enabled: [],
      }),
    ).toEqual([]);
    const jobs = planPolls({
      now: 0,
      backoffUntil: 0,
      last: lastAt(),
      symbols: ['BTCUSDT', 'ETHUSDT'],
      chartSymbol: 'BTCUSDT',
      enabled: ['premiumIndex'],
    });
    expect(jobs.map((j) => `${j.kind}:${j.symbol}`).sort()).toEqual(
      ['premiumIndex:BTCUSDT', 'premiumIndex:ETHUSDT'].sort(),
    );
  });

  it('退避期内一个任务都不派发', () => {
    const jobs = planPolls({
      now: 1_000,
      backoffUntil: 1_001,
      last: lastAt(),
      symbols: ['BTCUSDT'],
      chartSymbol: 'BTCUSDT',
      enabled: ALL,
    });
    expect(jobs).toEqual([]);
  });
});

describe('429 退避', () => {
  it('指数退避 1s → 2s → 4s … 上限 30s', () => {
    expect(nextBackoffMs(0)).toBe(BACKOFF_INITIAL_MS);
    expect(nextBackoffMs(1_000)).toBe(2_000);
    expect(nextBackoffMs(2_000)).toBe(4_000);
    expect(nextBackoffMs(16_000)).toBe(30_000);
    expect(nextBackoffMs(30_000)).toBe(BACKOFF_MAX_MS);
    expect(BACKOFF_MAX_MS).toBe(30_000);
  });

  it('无 Retry-After 时用指数退避', () => {
    const a = computeBackoffUntil(0, 10_000, null);
    expect(a.backoffMs).toBe(1_000);
    expect(a.backoffUntil).toBe(11_000);
    const b = computeBackoffUntil(1_000, 11_000, null);
    expect(b.backoffMs).toBe(2_000);
    expect(b.backoffUntil).toBe(13_000);
  });

  it('有 Retry-After 时优先采用，上限 60s', () => {
    const a = computeBackoffUntil(1_000, 5_000, 8_000);
    expect(a.backoffMs).toBe(8_000);
    expect(a.backoffUntil).toBe(13_000);
    const b = computeBackoffUntil(1_000, 0, 120_000);
    expect(b.backoffMs).toBe(60_000);
  });

  it('parseRetryAfterMs：秒数与 HTTP 日期', () => {
    expect(parseRetryAfterMs('3')).toBe(3_000);
    expect(parseRetryAfterMs(null)).toBeNull();
    const now = Date.UTC(2026, 0, 1, 0, 0, 0);
    expect(parseRetryAfterMs('Thu, 01 Jan 2026 00:00:05 GMT', now)).toBe(5_000);
  });

  it('RestHttpError 标记 429 与 retryAfter', () => {
    const e = new RestHttpError(429, '/fapi/v1/depth', 2_000);
    expect(e.status).toBe(429);
    expect(e.retryAfterMs).toBe(2_000);
    expect(e).toBeInstanceOf(Error);
  });

  it('RestPoller 遇到 429 后进入退避，期间不再发请求', async () => {
    const now = 10_000;
    let premiumCalls = 0;
    const p = new RestPoller({
      getSymbols: () => [],
      getChart: () => ({ symbol: 'BTCUSDT', interval: '1m' }),
      getEnabledKinds: () => ALL,
      fetchPremium: async () => {
        premiumCalls += 1;
        throw new RestHttpError(429, '/fapi/v1/premiumIndex', 4_000);
      },
      fetchDepth: async () => ({ bids: [], asks: [] }),
      fetchTicker: async () => [],
      fetchKlines: async () => [],
      onPremium: () => undefined,
      onDepth: () => undefined,
      onTicker: () => undefined,
      onKlines: () => undefined,
      now: () => now,
    });
    p.start();
    await new Promise((r) => setTimeout(r, 20));
    expect(premiumCalls).toBe(1);
    const b = p.getBackoff();
    expect(b.backoffMs).toBe(4_000);
    expect(b.backoffUntil).toBe(14_000);
    await new Promise((r) => setTimeout(r, 300));
    expect(premiumCalls).toBe(1);
    p.stop();
  });
});
