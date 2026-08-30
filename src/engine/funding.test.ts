import { describe, expect, it } from 'vitest';
import { calcFunding, nextFundingTime, fundingTimesDue } from './funding';

describe('资金费结算', () => {
  it('r>0 多头付：qty=1 mark=50000 r=0.0001 → 多头付出 5', () => {
    // 资金费 = 持仓名义价值 × r = 50000 × 0.0001 = 5；多头付
    expect(calcFunding(1, 50000, 0.0001, 'LONG')).toBeCloseTo(5, 12);
  });

  it('r>0 空头收：同一笔空头收入 5（返回 −5 表示账户入账）', () => {
    expect(calcFunding(1, 50000, 0.0001, 'SHORT')).toBeCloseTo(-5, 12);
  });

  it('r<0 多头收：r=−0.0003 → 多头 −15（入账 15）', () => {
    // 50000 × (−0.0003) = −15
    expect(calcFunding(1, 50000, -0.0003, 'LONG')).toBeCloseTo(-15, 12);
  });

  it('r=0 资金费为 0', () => {
    expect(calcFunding(2, 40000, 0, 'LONG')).toBe(0);
    expect(calcFunding(2, 40000, 0, 'SHORT')).toBe(0);
  });

  it('下次结算点为 UTC 00:00 / 08:00 / 16:00', () => {
    // 2024-01-01 07:30:00 UTC → 08:00
    const t = Date.UTC(2024, 0, 1, 7, 30, 0);
    expect(nextFundingTime(t)).toBe(Date.UTC(2024, 0, 1, 8, 0, 0));
    // 16:00 整 → 次日 00:00
    const t2 = Date.UTC(2024, 0, 1, 16, 0, 0);
    expect(nextFundingTime(t2)).toBe(Date.UTC(2024, 0, 2, 0, 0, 0));
  });

  it('漏结算补齐：07:00 到 16:01 应包含 08:00 与 16:00 两点', () => {
    const last = Date.UTC(2024, 0, 1, 7, 0, 0);
    const now = Date.UTC(2024, 0, 1, 16, 1, 0);
    expect(fundingTimesDue(last, now)).toEqual([
      Date.UTC(2024, 0, 1, 8, 0, 0),
      Date.UTC(2024, 0, 1, 16, 0, 0),
    ]);
  });
});
