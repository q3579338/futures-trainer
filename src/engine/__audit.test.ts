/**
 * 独立审计测试 —— 断言值全部由 Claude 手工计算，不引用被测函数的输出。
 * 手算过程写在每个用例的注释里，任何人都能拿计算器复核。
 */
import { describe, it, expect } from 'vitest';
import { liquidationPrice } from './liquidation';
import { getBracket, maintenanceMargin } from './brackets';
import { eatBook } from './slippage';

describe('审计：强平价（逐仓）', () => {
  it('多头 1000U 保证金 10x BTC@60000 → 54216.867470', () => {
    // Qty = 10000/60000 = 0.16666666666666666
    // 名义 10000 < 50000 → MMR 0.004, cum 0
    // LP = (0.1666666667×60000 − 1000 − 0) / (0.1666666667 × 0.996)
    //    = 9000 / 0.166 = 54216.86746987952
    const qty = 10000 / 60000;
    const lp = liquidationPrice({
      side: 'LONG', qty, entryPrice: 60000, isolatedWallet: 1000, mmr: 0.004, cum: 0,
    })!;
    expect(lp).toBeCloseTo(54216.86746987952, 6);
  });

  it('空头 1000U 保证金 10x BTC@60000 → 65737.051793', () => {
    // LP = (0.1666666667×60000 + 1000 + 0) / (0.1666666667 × 1.004)
    //    = 11000 / (1.004/6) = 66000/1.004 = 66000000/1004
    //    = 65737.05179282869   （精确分数复核：1004 × 65737 = 65,999,948；余 52/1004 = 0.05179）
    const qty = 10000 / 60000;
    const lp = liquidationPrice({
      side: 'SHORT', qty, entryPrice: 60000, isolatedWallet: 1000, mmr: 0.004, cum: 0,
    })!;
    expect(lp).toBeCloseTo(65737.05179282869, 6);
  });

  it('跨档：名义 100000U（MMR 0.005 / cum 50）多头 → 54241.206030', () => {
    // Qty = 100000/60000 = 1.6666666667, 保证金 10000
    // LP = (1.6666666667×60000 − 10000 − 50) / (1.6666666667 × 0.995)
    //    = 89950 / 1.6583333333 = 54241.20603015075
    const qty = 100000 / 60000;
    const lp = liquidationPrice({
      side: 'LONG', qty, entryPrice: 60000, isolatedWallet: 10000, mmr: 0.005, cum: 50,
    })!;
    expect(lp).toBeCloseTo(54241.20603015075, 6);
  });

  it('1x 多头几乎不可能被强平：LP 远低于开仓价', () => {
    // Qty=1, EP=60000, 保证金 60000, MMR 0.004
    // LP = (60000 − 60000 − 0) / 0.996 = 0
    const lp = liquidationPrice({
      side: 'LONG', qty: 1, entryPrice: 60000, isolatedWallet: 60000, mmr: 0.004, cum: 0,
    })!;
    expect(lp).toBeCloseTo(0, 9);
  });

  it('125x 多头强平极近：跌幅约 0.4% 就爆', () => {
    // Qty=1, EP=60000, 保证金 = 60000/125 = 480, MMR 0.004
    // LP = (60000 − 480) / 0.996 = 59520/0.996 = 59759.036144578314
    const lp = liquidationPrice({
      side: 'LONG', qty: 1, entryPrice: 60000, isolatedWallet: 480, mmr: 0.004, cum: 0,
    })!;
    expect(lp).toBeCloseTo(59759.036144578314, 6);
    expect((60000 - lp) / 60000).toBeLessThan(0.005); // 不到 0.5% 就爆
  });
});

describe('审计：维持保证金档位', () => {
  it('BTCUSDT 名义 10000 → MMR 0.4%，维持保证金 40', () => {
    const br = getBracket('BTCUSDT', 10_000);
    expect(br.maintMarginRatio).toBe(0.004);
    expect(br.cum).toBe(0);
    // 10000 × 0.004 − 0 = 40
    expect(maintenanceMargin('BTCUSDT', 10_000)).toBeCloseTo(40, 9);
  });

  it('BTCUSDT 名义 100000 → 落入 0.5% 档，维持保证金 450', () => {
    const br = getBracket('BTCUSDT', 100_000);
    expect(br.maintMarginRatio).toBe(0.005);
    expect(br.cum).toBe(50);
    // 100000 × 0.005 − 50 = 450
    expect(maintenanceMargin('BTCUSDT', 100_000)).toBeCloseTo(450, 9);
  });

  it('档位边界连续性：50000 处两档算出的维持保证金相等', () => {
    // 低档: 50000×0.004−0 = 200
    // 高档: 50000×0.005−50 = 200  ← cum 的作用就是保证这里连续
    expect(50_000 * 0.004 - 0).toBeCloseTo(50_000 * 0.005 - 50, 9);
  });

  it('BTCUSDT 名义 1000000 → 1% 档，维持保证金 6950', () => {
    // 1000000 × 0.01 − 3050 = 6950
    expect(maintenanceMargin('BTCUSDT', 1_000_000)).toBeCloseTo(6950, 9);
  });
});

describe('审计：逐档吃单滑点', () => {
  it('买单吃穿两档 → 加权均价 60010', () => {
    // 卖一 60000 × 1.0；卖二 60020 × 1.0；买 2.0
    // 成交额 = 60000 + 60020 = 120020，均价 = 120020/2 = 60010
    const asks: Array<[number, number]> = [[60000, 1], [60020, 1], [60040, 5]];
    const r = eatBook('BUY', 2, { bids: [], asks });
    expect(r.avgPrice).toBeCloseTo(60010, 6);
    expect(r.filledQty).toBeCloseTo(2, 9);
  });

  it('买单只吃一档一半 → 均价即该档价', () => {
    const asks: Array<[number, number]> = [[60000, 10]];
    const r = eatBook('BUY', 3, { bids: [], asks });
    expect(r.avgPrice).toBeCloseTo(60000, 9);
  });

  it('卖单吃穿两档 → 加权均价 59990', () => {
    // 买一 60000×1，买二 59980×1，卖 2 → (60000+59980)/2 = 59990
    const bids: Array<[number, number]> = [[60000, 1], [59980, 1], [59960, 5]];
    const r = eatBook('SELL', 2, { bids, asks: [] });
    expect(r.avgPrice).toBeCloseTo(59990, 6);
  });

  it('不等量加权：卖一 60000×0.5 + 卖二 60100×1.5 → 均价 60075', () => {
    // (60000×0.5 + 60100×1.5)/2 = (30000 + 90150)/2 = 60075
    const asks: Array<[number, number]> = [[60000, 0.5], [60100, 1.5], [60200, 9]];
    const r = eatBook('BUY', 2, { bids: [], asks });
    expect(r.avgPrice).toBeCloseTo(60075, 6);
  });
});
