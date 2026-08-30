import { describe, expect, it } from 'vitest';
import { liquidationPrice, shouldLiquidate, crossedWalletEquiv } from './liquidation';
import { getBracket, maintenanceMargin } from './brackets';
import type { EngineState, Position } from './types';
import { createInitialState } from './engine';

describe('强平价计算（规格 3.4 原公式）', () => {
  it('逐仓多头：Qty=1 EP=50000 IsolatedWallet=500 MMR=0.40% cum=0', () => {
    // LP = (Qty×EP − IsolatedWallet − cum) / (Qty × (1 − MMR))
    //    = (50000 − 500 − 0) / (1 × 0.996)
    //    = 49500 / 0.996
    // 手算：49500 ÷ 0.996 = 49500000 / 996 = 49698.79518072289
    const lp = liquidationPrice({
      side: 'LONG',
      qty: 1,
      entryPrice: 50000,
      isolatedWallet: 500,
      mmr: 0.004,
      cum: 0,
    });
    expect(lp).toBeCloseTo(49698.79518072289, 8);
  });

  it('逐仓空头：Qty=1 EP=50000 IsolatedWallet=500 MMR=0.40% cum=0', () => {
    // LP = (Qty×EP + IsolatedWallet + cum) / (Qty × (1 + MMR))
    //    = (50000 + 500 + 0) / (1 × 1.004)
    //    = 50500 / 1.004
    // 手算：50500 ÷ 1.004 = 50500000 / 1004 = 50298.80478087649
    const lp = liquidationPrice({
      side: 'SHORT',
      qty: 1,
      entryPrice: 50000,
      isolatedWallet: 500,
      mmr: 0.004,
      cum: 0,
    });
    expect(lp).toBeCloseTo(50298.80478087649, 8);
  });

  it('逐仓多头第二档：Qty=2 EP=30000 名义=60000 → MMR=0.50% cum=50 IsolatedWallet=1200', () => {
    const br = getBracket('BTCUSDT', 60000);
    expect(br.maintMarginRatio).toBe(0.005);
    expect(br.cum).toBe(50);
    // LP = (2×30000 − 1200 − 50) / (2 × (1 − 0.005))
    //    = (60000 − 1250) / 1.99
    //    = 58750 / 1.99
    // 手算：58750 ÷ 1.99 = 5875000 / 199 = 29522.61306532663
    const lp = liquidationPrice({
      side: 'LONG',
      qty: 2,
      entryPrice: 30000,
      isolatedWallet: 1200,
      mmr: br.maintMarginRatio,
      cum: br.cum,
    });
    expect(lp).toBeCloseTo(29522.61306532663, 8);
  });

  it('全仓：IsolatedWallet 换成 walletBalance − 其他仓维持保证金 + 其他仓未实现盈亏', () => {
    // 本仓多头 Qty=1 EP=50000；钱包 2000
    // 其他仓维持保证金 100，其他仓未实现盈亏 −50
    // IW_eq = 2000 − 100 + (−50) = 1850
    // LP = (50000 − 1850 − 0) / 0.996 = 48150 / 0.996
    // 手算：48150 ÷ 0.996 = 48150000 / 996 = 48343.37349397590
    const lp = liquidationPrice({
      side: 'LONG',
      qty: 1,
      entryPrice: 50000,
      isolatedWallet: 1850,
      mmr: 0.004,
      cum: 0,
    });
    expect(lp).toBeCloseTo(48343.3734939759, 8);
  });

  it('触发条件：多头 mark≤LP，空头 mark≥LP', () => {
    expect(shouldLiquidate('LONG', 49698.79518072289, 49698.79518072289)).toBe(true);
    expect(shouldLiquidate('LONG', 49699, 49698.79518072289)).toBe(false);
    expect(shouldLiquidate('SHORT', 50298.80478087649, 50298.80478087649)).toBe(true);
    expect(shouldLiquidate('SHORT', 50298, 50298.80478087649)).toBe(false);
  });

  it('全仓有效保证金交叉校验：wallet − otherMaint + otherUpnl', () => {
    const state: EngineState = createInitialState(0);
    state.walletBalance = 2000;
    const other: Position = {
      id: 'other',
      symbol: 'ETHUSDT',
      side: 'LONG',
      qty: 1,
      entryPrice: 2000,
      leverage: 10,
      marginMode: 'CROSSED',
      isolatedWallet: 200,
      initialMargin: 200,
      openTime: 0,
      reason: '计划内',
      tags: [],
      tiltScore: 0,
      accumulatedFunding: 0,
      lastFundingSettle: 0,
    };
    const self: Position = {
      ...other,
      id: 'self',
      symbol: 'BTCUSDT',
      qty: 1,
      entryPrice: 50000,
      isolatedWallet: 500,
      initialMargin: 500,
    };
    state.positions = [self, other];
    // other mark = 1950 → upnl = (1950-2000)*1 = -50
    // other notional = 1950，ETH 第一档 MMR=0.5% cum=0 → maint = 1950*0.005 − 0 = 9.75
    const marks = { BTCUSDT: 50000, ETHUSDT: 1950 };
    const iw = crossedWalletEquiv(state, self, marks);
    const maint = maintenanceMargin('ETHUSDT', 1950);
    expect(maint).toBeCloseTo(9.75, 10);
    expect(iw).toBeCloseTo(2000 - 9.75 + -50, 10);
  });
});
