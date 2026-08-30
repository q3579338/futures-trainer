import { describe, expect, it } from 'vitest';
import { applyCancelOrder, applyPlaceOrder, applyPositionMode, createInitialState } from './engine';
import { canSwitchPositionMode } from './hedge';
import { positionLiquidationPrice } from './liquidation';
import type { EngineState, MarketCtx } from './types';

function ctx(over: Partial<MarketCtx> = {}): MarketCtx {
  return {
    lastPrice: { BTCUSDT: 60000 },
    markPrice: { BTCUSDT: 60000 },
    fundingRate: { BTCUSDT: 0 },
    nextFundingTime: { BTCUSDT: 0 },
    depth: {
      BTCUSDT: {
        bids: [[59990, 50]],
        asks: [[60010, 50]],
      },
    },
    change1m: { BTCUSDT: 0 },
    now: 1_700_000_000_000,
    ...over,
  };
}

function funded(): EngineState {
  const s = createInitialState(1_700_000_000_000);
  s.walletBalance = 20_000;
  s.totalDeposited = 20_000;
  s.deposits = [{ time: 1_700_000_000_000, amount: 20_000 }];
  s.positionMode = 'HEDGE';
  return s;
}

const qty = 10000 / 60000; // 1/6

describe('双向持仓', () => {
  it('同币对可同时持多空，独立均价/保证金/强平价', () => {
    let st = funded();
    const c = ctx();
    const long = applyPlaceOrder(
      st,
      {
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'MARKET',
        qty,
        reduceOnly: false,
        leverage: 10,
        marginMode: 'ISOLATED',
        reason: '计划内',
        positionSide: 'LONG',
      },
      c,
    );
    expect(long.error).toBeUndefined();
    st = long.state;
    const short = applyPlaceOrder(
      st,
      {
        symbol: 'BTCUSDT',
        side: 'SELL',
        type: 'MARKET',
        qty,
        reduceOnly: false,
        leverage: 10,
        marginMode: 'ISOLATED',
        reason: '计划内',
        positionSide: 'SHORT',
      },
      c,
    );
    expect(short.error).toBeUndefined();
    st = short.state;
    expect(st.positions).toHaveLength(2);
    const L = st.positions.find((p) => p.side === 'LONG')!;
    const S = st.positions.find((p) => p.side === 'SHORT')!;
    expect(L.qty).toBeCloseTo(qty, 9);
    expect(S.qty).toBeCloseTo(qty, 9);
    expect(L.entryPrice).toBeCloseTo(60010, 6);
    expect(S.entryPrice).toBeCloseTo(59990, 6);
    expect(L.isolatedWallet).toBeCloseTo(L.initialMargin, 6);
    expect(S.isolatedWallet).toBeCloseTo(S.initialMargin, 6);

    const marks = { BTCUSDT: 60000 };
    const lpL = positionLiquidationPrice(st, L, 60000, marks)!;
    const lpS = positionLiquidationPrice(st, S, 60000, marks)!;
    expect(lpL).toBeLessThan(L.entryPrice);
    expect(lpS).toBeGreaterThan(S.entryPrice);
    expect(lpL).not.toBeCloseTo(lpS, 0);
  });

  it('平多不影响空头仓位', () => {
    let st = funded();
    const c = ctx();
    st = applyPlaceOrder(
      st,
      {
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'MARKET',
        qty,
        reduceOnly: false,
        leverage: 10,
        marginMode: 'ISOLATED',
        reason: '计划内',
        positionSide: 'LONG',
      },
      c,
    ).state;
    st = applyPlaceOrder(
      st,
      {
        symbol: 'BTCUSDT',
        side: 'SELL',
        type: 'MARKET',
        qty,
        reduceOnly: false,
        leverage: 10,
        marginMode: 'ISOLATED',
        reason: '计划内',
        positionSide: 'SHORT',
      },
      c,
    ).state;
    const shortQty = st.positions.find((p) => p.side === 'SHORT')!.qty;
    const closed = applyPlaceOrder(
      st,
      {
        symbol: 'BTCUSDT',
        side: 'SELL',
        type: 'MARKET',
        qty,
        reduceOnly: true,
        leverage: 10,
        marginMode: 'ISOLATED',
        positionSide: 'LONG',
      },
      c,
    );
    expect(closed.error).toBeUndefined();
    st = closed.state;
    expect(st.positions).toHaveLength(1);
    expect(st.positions[0]!.side).toBe('SHORT');
    expect(st.positions[0]!.qty).toBeCloseTo(shortQty, 9);
  });

  it('有持仓或挂单时拒绝切换持仓模式', () => {
    let st = funded();
    const c = ctx();
    st = applyPlaceOrder(
      st,
      {
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'MARKET',
        qty,
        reduceOnly: false,
        leverage: 10,
        marginMode: 'ISOLATED',
        reason: '计划内',
        positionSide: 'LONG',
      },
      c,
    ).state;
    const r = applyPositionMode(st, 'ONE_WAY');
    expect(r.error).toBe('当前有持仓，无法切换持仓模式');
    expect(canSwitchPositionMode(st).ok).toBe(false);

    let empty = funded();
    empty = applyPlaceOrder(
      empty,
      {
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        qty,
        price: 50000,
        reduceOnly: false,
        leverage: 10,
        marginMode: 'ISOLATED',
        reason: '计划内',
        positionSide: 'LONG',
      },
      c,
    ).state;
    expect(empty.orders).toHaveLength(1);
    expect(applyPositionMode(empty, 'ONE_WAY').error).toBe('当前有挂单，无法切换持仓模式');

    empty = applyCancelOrder(empty, empty.orders[0]!.id).state;
    const ok = applyPositionMode(empty, 'ONE_WAY');
    expect(ok.error).toBeUndefined();
    expect(ok.state.positionMode).toBe('ONE_WAY');
  });
});
