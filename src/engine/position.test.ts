import { describe, expect, it } from 'vitest';
import { addPositionAvgPrice, realizedPnl, initialMargin } from './position';

describe('加仓均价', () => {
  it('等量加仓：1@100 + 1@110 → 105', () => {
    // (1×100 + 1×110) / 2 = 210 / 2 = 105
    expect(addPositionAvgPrice(1, 100, 1, 110)).toBe(105);
  });

  it('不等量加仓：2@100 + 1@130 → 110', () => {
    // (2×100 + 1×130) / 3 = 330 / 3 = 110
    expect(addPositionAvgPrice(2, 100, 1, 130)).toBe(110);
  });

  it('小数数量：0.5@20000 + 1.5@21000 → 20750', () => {
    // (0.5×20000 + 1.5×21000) / 2 = (10000 + 31500) / 2 = 41500 / 2 = 20750
    expect(addPositionAvgPrice(0.5, 20000, 1.5, 21000)).toBe(20750);
  });
});

describe('平仓已实现盈亏', () => {
  it('多头 1 张 50000→51000 → +1000', () => {
    expect(realizedPnl('LONG', 1, 50000, 51000)).toBe(1000);
  });

  it('空头 2 张 30000→29000 → +2000', () => {
    // (30000 − 29000) × 2 = 2000
    expect(realizedPnl('SHORT', 2, 30000, 29000)).toBe(2000);
  });
});

describe('起始保证金', () => {
  it('名义 50000 / 100x = 500', () => {
    expect(initialMargin(1, 50000, 100)).toBe(500);
  });
});
