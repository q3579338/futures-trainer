import { describe, expect, it } from 'vitest';
import type { TradeRecord } from '../engine/types';
import { dailyPnlSeries, rangeStart, startOfLocalDay, sumRealized, tradeRealized, ymd } from './pnlAnalysis';

function t(partial: Partial<TradeRecord> & { time: number; type: TradeRecord['type'] }): TradeRecord {
  return {
    id: '1',
    symbol: 'BTCUSDT',
    side: 'BUY',
    qty: 1,
    price: 1,
    fee: 0,
    feeRate: 0,
    isMaker: false,
    realizedPnl: 0,
    ...partial,
  };
}

describe('合约盈亏分析聚合', () => {
  it('平仓记 realizedPnl，资金费取负 funding', () => {
    expect(tradeRealized(t({ type: 'CLOSE', time: 1, realizedPnl: 10 }))).toBe(10);
    expect(tradeRealized(t({ type: 'FUNDING', time: 1, funding: 2, realizedPnl: 0 }))).toBe(-2);
    expect(tradeRealized(t({ type: 'OPEN', time: 1 }))).toBe(0);
  });

  it('按本地日汇总，空日补 0', () => {
    const day = startOfLocalDay(Date.UTC(2026, 7, 22, 12));
    const trades = [
      t({ id: 'a', type: 'CLOSE', time: day + 3600_000, realizedPnl: 100 }),
      t({ id: 'b', type: 'CLOSE', time: day + 86400_000 + 1000, realizedPnl: -40 }),
    ];
    const series = dailyPnlSeries(trades, day, day + 86400_000);
    expect(series).toHaveLength(2);
    expect(series[0]!.date).toBe(ymd(day));
    expect(series[0]!.pnl).toBe(100);
    expect(series[1]!.pnl).toBe(-40);
  });

  it('区间总盈利/亏损', () => {
    const now = Date.now();
    const from = rangeStart('7d', now);
    const s = sumRealized(
      [
        t({ type: 'CLOSE', time: now - 1000, realizedPnl: 50 }),
        t({ type: 'CLOSE', time: now - 2000, realizedPnl: -20 }),
        t({ type: 'CLOSE', time: from - 1000, realizedPnl: 999 }),
      ],
      from,
      now,
    );
    expect(s.win).toBe(50);
    expect(s.loss).toBe(-20);
    expect(s.net).toBe(30);
  });
});
