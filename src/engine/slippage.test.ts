import { describe, expect, it } from 'vitest';
import { eatBook, eatBookToLimit } from './slippage';
import type { DepthBook } from './types';

const book: DepthBook = {
  asks: [
    [100, 1],
    [101, 2],
    [102, 3],
  ],
  bids: [
    [99, 1],
    [98, 2],
    [97, 3],
  ],
};

describe('逐档吃单滑点', () => {
  it('买单吃 2 张：1@100 + 1@101 → 均价 100.5，未穿盘', () => {
    // 名义 = 100 + 101 = 201；均价 = 201 / 2 = 100.5
    const r = eatBook('BUY', 2, book);
    expect(r.filledQty).toBe(2);
    expect(r.notional).toBe(201);
    expect(r.avgPrice).toBeCloseTo(100.5, 10);
    expect(r.severeSlippage).toBe(false);
    expect(r.levelsUsed).toBe(2);
  });

  it('买单吃满 6 张：1@100+2@101+3@102 → 均价 608/6', () => {
    // 100 + 202 + 306 = 608；608 / 6 = 101.33333333333333
    const r = eatBook('BUY', 6, book);
    expect(r.filledQty).toBe(6);
    expect(r.notional).toBe(608);
    expect(r.avgPrice).toBeCloseTo(101.33333333333333, 10);
    expect(r.severeSlippage).toBe(false);
  });

  it('买单 7 张深度不足：按最后一档 102 外推，标注滑点严重', () => {
    // 608 + 1×102 = 710；均价 = 710 / 7 = 101.42857142857143
    const r = eatBook('BUY', 7, book);
    expect(r.filledQty).toBe(7);
    expect(r.notional).toBe(710);
    expect(r.avgPrice).toBeCloseTo(101.42857142857143, 10);
    expect(r.severeSlippage).toBe(true);
  });

  it('卖单 1.5 张：1@99 + 0.5@98 → 均价 99.333…', () => {
    // bids 降序：99×1 + 98×0.5 = 99 + 49 = 148；148 / 1.5 = 98.66666666666667
    // 注意 bids 按价格从高到低：99, 98, 97
    const r = eatBook('SELL', 1.5, book);
    expect(r.filledQty).toBe(1.5);
    expect(r.notional).toBeCloseTo(148, 10);
    expect(r.avgPrice).toBeCloseTo(98.66666666666667, 10);
    expect(r.severeSlippage).toBe(false);
  });

  it('限价买单 101：只吃 ≤101 的卖档，不外推', () => {
    // 1@100 + 2@101 = 302；均价 302/3；要 10 张也只成交 3
    const r = eatBookToLimit('BUY', 10, 101, book);
    expect(r.filledQty).toBe(3);
    expect(r.notional).toBe(302);
    expect(r.avgPrice).toBeCloseTo(100.66666666666667, 10);
    expect(r.severeSlippage).toBe(false);
  });
});
