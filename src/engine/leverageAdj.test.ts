import { describe, expect, it } from 'vitest';
import { applyChangeLeverage } from './leverageAdj';
import type { EngineState, MarketCtx, Position } from './types';

function pos(): Position {
  return {
    id: 'p1',
    symbol: 'BTCUSDT',
    side: 'LONG',
    qty: 1,
    entryPrice: 60000,
    leverage: 10,
    marginMode: 'ISOLATED',
    isolatedWallet: 6000,
    initialMargin: 6000,
    openTime: 1,
    reason: '计划内',
    tags: [],
    tiltScore: 0,
    accumulatedFunding: 0,
    lastFundingSettle: 1,
  };
}

function stateOf(p: Position, wallet = 1000): EngineState {
  return {
    walletBalance: wallet,
    totalDeposited: 20000,
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
    dayStartEquity: 20000,
    dayStartDeposited: 20000,
    totalFee: 0,
    totalFundingPaid: 0,
    liquidationCount: 0,
    riskConfig: { dailyLossPct: 0.05, consecutiveLossLimit: 3, maxMarginPct: 1, maxLeverage: 125 },
    pendingRiskConfig: { dailyLossPct: 0.05, consecutiveLossLimit: 3, maxMarginPct: 1, maxLeverage: 125 },
    lock: { dailyLossUntil: null, consecutiveUntil: null, liquidationUntil: null },
  };
}

describe('调整杠杆', () => {
  it('标记价已远离、升至 125x 会立即强平则拒绝', () => {
    // 10x 多头 qty=1 EP=60000 IM=6000，mark=49000（名义仍在 125x 档）
    // 升到 125x 后 isolated=49000/125=392，LP=(60000-392)/0.996≈59849 > 49000 → 立即强平
    const c: MarketCtx = {
      lastPrice: { BTCUSDT: 49000 },
      markPrice: { BTCUSDT: 49000 },
      fundingRate: { BTCUSDT: 0 },
      nextFundingTime: { BTCUSDT: 0 },
      depth: { BTCUSDT: { bids: [], asks: [] } },
      change1m: {},
      now: 1,
    };
    const r = applyChangeLeverage(stateOf(pos(), 50_000), 'BTCUSDT', 125, c);
    expect(r.error).toBe('调整杠杆将立即触发强平');
  });

  it('降杠杆需要补足起始保证金，余额不足则拒绝', () => {
    const c: MarketCtx = {
      lastPrice: { BTCUSDT: 60000 },
      markPrice: { BTCUSDT: 60000 },
      fundingRate: { BTCUSDT: 0 },
      nextFundingTime: { BTCUSDT: 0 },
      depth: { BTCUSDT: { bids: [], asks: [] } },
      change1m: {},
      now: 1,
    };
    const p = pos();
    p.leverage = 20;
    p.initialMargin = 3000;
    p.isolatedWallet = 3000;
    // occupied=3000, wallet=3500, upnl=0, avail=500。1x 需要 60000，远远不够
    const r = applyChangeLeverage(stateOf(p, 3500), 'BTCUSDT', 1, c);
    expect(r.error).toMatch(/可用余额不足/);
  });
});
