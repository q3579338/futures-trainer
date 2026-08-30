import { describe, expect, it } from 'vitest';
import { buildDisplayBook } from './orderbook';

describe('订单簿展示', () => {
  const asks: Array<[number, number]> = [
    [100.4, 1],
    [100.5, 2],
    [101.0, 3],
    [101.2, 4],
    [102.0, 5],
    [103.0, 1],
    [104.0, 1],
    [105.0, 1],
  ];
  const bids: Array<[number, number]> = [
    [100.3, 2],
    [100.2, 2],
    [99.5, 3],
    [99.0, 4],
    [98.0, 5],
    [97.0, 1],
    [96.0, 1],
    [95.0, 1],
  ];

  it('卖盘 7 档从上到下价格递减，最优卖价在最下面', () => {
    const { asks: rows } = buildDisplayBook(asks, bids, 0.1, 7);
    expect(rows).toHaveLength(7);
    const live = rows.filter((r) => r.price > 0);
    for (let i = 1; i < live.length; i++) {
      expect(live[i]!.price).toBeLessThan(live[i - 1]!.price);
    }
    expect(live[live.length - 1]!.price).toBe(100.4);
  });

  it('买盘 7 档价格递减，最优买价在最上面', () => {
    const { bids: rows } = buildDisplayBook(asks, bids, 0.1, 7);
    expect(rows).toHaveLength(7);
    expect(rows[0]!.price).toBe(100.3);
    for (let i = 1; i < rows.length; i++) {
      if (rows[i]!.price === 0) continue;
      expect(rows[i]!.price).toBeLessThan(rows[i - 1]!.price);
    }
  });

  it('深度 = 从最优档向外的累计量 / 本侧最大累计量', () => {
    const { bids: rows } = buildDisplayBook(asks, bids, 0.1, 7);
    expect(rows[0]!.depth).toBeLessThan(rows[6]!.depth);
    expect(rows[6]!.depth).toBe(1);
    expect(rows[0]!.cum).toBe(rows[0]!.qty);
    expect(rows[1]!.cum).toBe(rows[0]!.qty + rows[1]!.qty);
  });

  it('按 tick 聚合数量', () => {
    const { asks: rows } = buildDisplayBook(
      [
        [100.1, 1],
        [100.4, 2],
        [100.9, 3],
      ],
      [],
      1,
      7,
    );
    const live = rows.filter((r) => r.price > 0);
    expect(live).toHaveLength(1);
    expect(live[0]!.price).toBe(101);
    expect(live[0]!.qty).toBe(6);
  });

  it('不足 7 档时补空行，避免跳动', () => {
    const { asks: rows } = buildDisplayBook([[101, 1]], [], 0.1, 7);
    expect(rows).toHaveLength(7);
    expect(rows.filter((r) => r.price === 0).length).toBe(6);
  });
});
