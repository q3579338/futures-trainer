import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FUNDING_INTERVAL_HOURS,
  fundingIntervalLabel,
  inferFundingIntervalHours,
  intervalFromAdjacent,
  mergeFundingIntervals,
} from './fundingInterval';

describe('资金费周期', () => {
  it('API 优先', () => {
    const t = Date.UTC(2026, 7, 23, 8, 0, 0);
    expect(inferFundingIntervalHours(t, t - 3600_000, 4)).toBe(4);
  });

  it('nextFundingTime 落在 04/12/20 UTC 视为 4 小时', () => {
    expect(inferFundingIntervalHours(Date.UTC(2026, 7, 23, 4, 0, 0))).toBe(4);
    expect(inferFundingIntervalHours(Date.UTC(2026, 7, 23, 12, 0, 0))).toBe(4);
    expect(inferFundingIntervalHours(Date.UTC(2026, 7, 23, 20, 0, 0))).toBe(4);
  });

  it('00/08/16 UTC 默认 8 小时', () => {
    expect(inferFundingIntervalHours(Date.UTC(2026, 7, 23, 8, 0, 0))).toBe(8);
    expect(inferFundingIntervalHours(0)).toBe(DEFAULT_FUNDING_INTERVAL_HOURS);
  });

  it('相邻 nextFundingTime 差可推导周期', () => {
    const a = Date.UTC(2026, 7, 23, 8, 0, 0);
    expect(intervalFromAdjacent(a, a + 4 * 3600_000)).toBe(4);
    expect(intervalFromAdjacent(a, a + 8 * 3600_000)).toBe(8);
    expect(intervalFromAdjacent(a, a)).toBeNull();
  });

  it('标题文案', () => {
    expect(fundingIntervalLabel(4)).toBe('4时');
    expect(fundingIntervalLabel(8)).toBe('8时');
  });

  it('fundingInfo 合并', () => {
    const m = mergeFundingIntervals({ BTCUSDT: 8 }, [{ symbol: 'TRUMPUSDT', fundingIntervalHours: 4 }]);
    expect(m.TRUMPUSDT).toBe(4);
    expect(m.BTCUSDT).toBe(8);
  });
});
