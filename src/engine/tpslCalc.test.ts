import { describe, expect, it } from 'vitest';
import { pnlAtTrigger, roeAtTrigger, triggerFromPnl, triggerFromRoe } from './tpslCalc';

describe('TP/SL 按金额/回报率反推触发价', () => {
  it('多头 qty=1 entry=60000 IM=6000：+10% ROE → 60600', () => {
    const px = triggerFromRoe('LONG', 60000, 1, 6000, 10)!;
    expect(px).toBeCloseTo(60600, 9);
    expect(roeAtTrigger('LONG', 60000, 1, 6000, px)).toBeCloseTo(10, 9);
  });

  it('多头 −20% ROE → 58800', () => {
    expect(triggerFromRoe('LONG', 60000, 1, 6000, -20)).toBeCloseTo(58800, 9);
  });

  it('多头金额 +100 → 60100', () => {
    expect(triggerFromPnl('LONG', 60000, 1, 100)).toBeCloseTo(60100, 9);
    expect(pnlAtTrigger('LONG', 60000, 1, 60100)).toBeCloseTo(100, 9);
  });

  it('空头 +10% ROE → 59400；亏损 100 → 60100', () => {
    expect(triggerFromRoe('SHORT', 60000, 1, 6000, 10)).toBeCloseTo(59400, 9);
    expect(triggerFromPnl('SHORT', 60000, 1, -100)).toBeCloseTo(60100, 9);
  });
});
