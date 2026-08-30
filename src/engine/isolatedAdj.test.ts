import { describe, expect, it } from 'vitest';
import { applyAdjustIsolatedMargin, previewIsolatedAdjust } from './isolatedAdj';
import { liquidationPrice } from './liquidation';
import type { EngineState, MarketCtx, Position } from './types';

const qty = 10000 / 60000;

function pos(wallet: number): Position {
  return {
    id: 'p1',
    symbol: 'BTCUSDT',
    side: 'LONG',
    qty,
    entryPrice: 60000,
    leverage: 10,
    marginMode: 'ISOLATED',
    isolatedWallet: wallet,
    initialMargin: 1000,
    openTime: 1,
    reason: '计划内',
    tags: [],
    tiltScore: 0,
    accumulatedFunding: 0,
    lastFundingSettle: 1,
  };
}

function stateOf(p: Position): EngineState {
  return {
    walletBalance: 5000,
    totalDeposited: 10000,
    positions: [p],
    orders: [],
    orderHistory: [],
    positionMode: 'ONE_WAY',
    trades: [],
    deposits: [],
    snapshots: [],
    lastFundingSettle: 1,
    lastLossClose: null,
    lastCloseTime: null,
    consecutiveLosses: 0,
    dayKey: '2024-01-01',
    dayStartEquity: 10000,
    dayStartDeposited: 10000,
    totalFee: 0,
    totalFundingPaid: 0,
    liquidationCount: 0,
    riskConfig: { dailyLossPct: 0.05, consecutiveLossLimit: 3, maxMarginPct: 0.2, maxLeverage: 125 },
    pendingRiskConfig: { dailyLossPct: 0.05, consecutiveLossLimit: 3, maxMarginPct: 0.2, maxLeverage: 125 },
    lock: { dailyLossUntil: null, consecutiveUntil: null, liquidationUntil: null },
  };
}

const c: MarketCtx = {
  lastPrice: { BTCUSDT: 60000 },
  markPrice: { BTCUSDT: 60000 },
  fundingRate: { BTCUSDT: 0 },
  nextFundingTime: { BTCUSDT: 0 },
  depth: { BTCUSDT: { bids: [], asks: [] } },
  change1m: {},
  now: 1,
};

describe('逐仓保证金调整后的强平价', () => {
  it('起始 1000U：LP = 54216.86746987952（与审计用例同构）', () => {
    // Qty=10000/60000, EP=60000, IsolatedWallet=1000, MMR=0.004, cum=0
    // LP = (10000 − 1000) / ((10000/60000)×0.996) = 9000 / 0.166 = 54216.86746987952
    const lp = liquidationPrice({
      side: 'LONG',
      qty,
      entryPrice: 60000,
      isolatedWallet: 1000,
      mmr: 0.004,
      cum: 0,
    })!;
    expect(lp).toBeCloseTo(54216.86746987952, 6);
  });

  it('增加 500U 后 LP = 51204.81927710843', () => {
    // IsolatedWallet=1500
    // LP = (10000 − 1500) / ((1/6)×0.996) = 8500 × 6 / 0.996 = 51000 / 0.996 = 51204.81927710843
    const preview = previewIsolatedAdjust(pos(1000), 500, 60000);
    expect('error' in preview).toBe(false);
    if ('error' in preview) return;
    expect(preview.nextWallet).toBe(1500);
    expect(preview.liqPrice).toBeCloseTo(51204.81927710843, 6);
    const r = applyAdjustIsolatedMargin(stateOf(pos(1000)), 'p1', 500, c);
    expect(r.error).toBeUndefined();
    expect(r.state.positions[0]!.isolatedWallet).toBe(1500);
    expect(r.liqPrice).toBeCloseTo(51204.81927710843, 6);
  });

  it('从 1500 减 200：LP = 53012.04819277108，不得减破起始保证金', () => {
    // IsolatedWallet=1300
    // LP = (10000 − 1300) × 6 / 0.996 = 52200 / 0.996 = 52409.63855421687 wait:
    // 8700 * 6 / 0.996 = 52200 / 0.996 = 52409.63855421687
    const preview = previewIsolatedAdjust(pos(1500), -200, 60000);
    expect('error' in preview).toBe(false);
    if ('error' in preview) return;
    expect(preview.nextWallet).toBe(1300);
    expect(preview.liqPrice).toBeCloseTo(52409.63855421687, 6);

    const under = applyAdjustIsolatedMargin(stateOf(pos(1000)), 'p1', -1, c);
    expect(under.error).toBe('减少后不得低于起始保证金要求');
  });
});
