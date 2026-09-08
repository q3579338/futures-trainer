import { describe, expect, it } from 'vitest';
import { buildDisplayBook, mergeDeepBook, type BookLevel } from './orderbook';

const top = {
  asks: [[2483.15, 1], [2483.2, 2], [2483.3, 3]] as BookLevel[],
  bids: [[2483.14, 1], [2483.1, 2], [2483.0, 3]] as BookLevel[],
};
const deep = {
  asks: [[2483.15, 9], [2483.3, 9], [2484.0, 4], [2485.5, 5], [2490.0, 6]] as BookLevel[],
  bids: [[2483.14, 9], [2483.0, 9], [2482.5, 4], [2481.0, 5], [2470.0, 6]] as BookLevel[],
};

describe('mergeDeepBook', () => {
  it('WS 覆盖范围内以 WS 为准，范围外接深盘，不重复不交叉', () => {
    const m = mergeDeepBook(top, deep);
    expect(m.asks.map((x) => x[0])).toEqual([2483.15, 2483.2, 2483.3, 2484.0, 2485.5, 2490.0]);
    expect(m.asks[0]![1]).toBe(1); // 2483.15 用 WS 的量，不用深盘的 9
    expect(m.bids.map((x) => x[0])).toEqual([2483.14, 2483.1, 2483.0, 2482.5, 2481.0, 2470.0]);
    const bestAsk = Math.min(...m.asks.map((x) => x[0]));
    const bestBid = Math.max(...m.bids.map((x) => x[0]));
    expect(bestAsk).toBeGreaterThan(bestBid);
  });

  it('没有深盘时原样返回；WS 为空时直接用深盘', () => {
    expect(mergeDeepBook(top, null)).toBe(top);
    expect(mergeDeepBook(top, { asks: [], bids: [] })).toBe(top);
    const m = mergeDeepBook({ asks: [], bids: [] }, deep);
    expect(m.asks.length).toBe(5);
    expect(m.bids.length).toBe(5);
  });

  it('聚合到 1 USDT 时，仅 WS 3 档只能凑 1~2 行，接上深盘后买卖各能给满 6 行', () => {
    const only = buildDisplayBook(top.asks, top.bids, 1, 6);
    expect(only.asks.filter((r) => r.price > 0).length).toBeLessThan(6);
    const wide = {
      asks: Array.from({ length: 30 }, (_, i) => [2484 + i, 1] as BookLevel),
      bids: Array.from({ length: 30 }, (_, i) => [2482 - i, 1] as BookLevel),
    };
    const merged = mergeDeepBook(top, wide);
    const disp = buildDisplayBook(merged.asks, merged.bids, 1, 6);
    expect(disp.asks.filter((r) => r.price > 0).length).toBe(6);
    expect(disp.bids.filter((r) => r.price > 0).length).toBe(6);
  });

  it('cap 生效', () => {
    const wide = {
      asks: Array.from({ length: 900 }, (_, i) => [2484 + i * 0.1, 1] as BookLevel),
      bids: Array.from({ length: 900 }, (_, i) => [2482 - i * 0.1, 1] as BookLevel),
    };
    const m = mergeDeepBook(top, wide, 100);
    expect(m.asks.length).toBe(100);
    expect(m.bids.length).toBe(100);
  });
});
