import { describe, expect, it } from 'vitest';
import { cumulativeSide, depthChartSeries } from './depthChart';
import { buildDisplayBook } from './orderbook';

describe('档位聚合与深度图', () => {
  it('tick=1 时 100.1+100.4+100.9 聚到 101 数量 6', () => {
    const { asks } = buildDisplayBook(
      [
        [100.1, 1],
        [100.4, 2],
        [100.9, 3],
      ],
      [],
      1,
      7,
    );
    const live = asks.filter((r) => r.price > 0);
    expect(live).toHaveLength(1);
    expect(live[0]!.price).toBe(101);
    expect(live[0]!.qty).toBe(6);
  });

  it('累计量面积图：买盘从优到劣累加', () => {
    const bids = cumulativeSide(
      [
        [100, 1],
        [99, 2],
        [98, 3],
      ],
      'bid',
    );
    expect(bids.map((x) => x.cum)).toEqual([1, 3, 6]);
    const { maxCum } = depthChartSeries(
      [
        [100, 1],
        [99, 2],
      ],
      [
        [101, 4],
        [102, 1],
      ],
    );
    expect(maxCum).toBe(5);
  });
});
