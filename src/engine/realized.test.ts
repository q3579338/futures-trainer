import { describe, expect, it } from 'vitest';
import { positionRealized, realizedAmountOf } from './realized';
import type { TradeRecord } from './types';

function rec(p: Partial<TradeRecord> & Pick<TradeRecord, 'type' | 'time'>): TradeRecord {
  return {
    id: p.id ?? `${p.type}-${p.time}`,
    positionId: 'p1',
    symbol: 'ETHUSDT',
    side: 'BUY',
    qty: 1,
    price: 2500,
    fee: 0,
    feeRate: 0,
    isMaker: false,
    realizedPnl: 0,
    ...p,
  };
}

describe('positionRealized', () => {
  it('只开仓：实现盈亏 = −开仓手续费', () => {
    const r = positionRealized([rec({ type: 'OPEN', time: 1, fee: 0.875 })], 'p1');
    expect(r.closedPnl).toBe(0);
    expect(r.fee).toBeCloseTo(0.875, 10);
    expect(r.funding).toBe(0);
    expect(r.total).toBeCloseTo(-0.875, 10);
    expect(r.records).toHaveLength(1);
  });

  it('开仓 + 部分平仓 + 资金费：合计 = 平仓盈亏 − 手续费 − 资金费', () => {
    const trades: TradeRecord[] = [
      rec({ type: 'OPEN', time: 1, fee: 1 }),
      rec({ type: 'FUNDING', time: 2, funding: 0.3, realizedPnl: -0.3 }),
      rec({ type: 'CLOSE', time: 3, fee: 0.5, realizedPnl: 12 }),
      rec({ type: 'FUNDING', time: 4, funding: -0.2, realizedPnl: 0.2 }),
    ];
    const r = positionRealized(trades, 'p1');
    expect(r.closedPnl).toBe(12);
    expect(r.fee).toBeCloseTo(1.5, 10);
    expect(r.funding).toBeCloseTo(0.1, 10);
    expect(r.total).toBeCloseTo(12 - 1.5 - 0.1, 10);
  });

  it('不串仓：别的仓位的记录不计', () => {
    const trades: TradeRecord[] = [
      rec({ type: 'OPEN', time: 1, fee: 1 }),
      rec({ type: 'OPEN', time: 1, fee: 9, positionId: 'p2', id: 'other' }),
    ];
    expect(positionRealized(trades, 'p1').fee).toBe(1);
  });

  it('强平记录按平仓计', () => {
    const r = positionRealized([rec({ type: 'LIQUIDATION', time: 5, fee: 2, realizedPnl: -100 })], 'p1');
    expect(r.closedPnl).toBe(-100);
    expect(r.total).toBe(-102);
  });

  it('明细行金额：开仓 −手续费，平仓 盈亏−手续费，资金费取反', () => {
    expect(realizedAmountOf(rec({ type: 'OPEN', time: 1, fee: 1 }))).toBe(-1);
    expect(realizedAmountOf(rec({ type: 'CLOSE', time: 1, fee: 1, realizedPnl: 5 }))).toBe(4);
    expect(realizedAmountOf(rec({ type: 'FUNDING', time: 1, funding: 0.3, realizedPnl: -0.3 }))).toBeCloseTo(-0.3, 10);
  });
});
