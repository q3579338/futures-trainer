import { describe, expect, it } from 'vitest';
import { applyPlaceOrder, createInitialState } from './engine';
import type { EngineState, MarketCtx } from './types';

function ctx(): MarketCtx {
  return {
    lastPrice: { BTCUSDT: 60000 },
    markPrice: { BTCUSDT: 60000 },
    fundingRate: { BTCUSDT: 0 },
    nextFundingTime: { BTCUSDT: 0 },
    depth: { BTCUSDT: { bids: [[59990, 10]], asks: [[60010, 10]] } },
    change1m: { BTCUSDT: 0 },
    now: 1_700_000_000_000,
  };
}

function funded(): EngineState {
  const s = createInitialState();
  s.walletBalance = 10_000;
  s.totalDeposited = 10_000;
  return s;
}

describe('Post Only', () => {
  it('买单限价≥卖一则拒绝', () => {
    const r = applyPlaceOrder(
      funded(),
      {
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        qty: 0.01,
        price: 60010,
        timeInForce: 'GTX',
        reduceOnly: false,
        leverage: 10,
        marginMode: 'ISOLATED',
        reason: '计划内',
      },
      ctx(),
    );
    expect(r.error).toBe('Post-Only 将立即吃单，已拒绝');
    expect(r.state.positions).toHaveLength(0);
  });

  it('postOnly 标志等价于 GTX', () => {
    const r = applyPlaceOrder(
      funded(),
      {
        symbol: 'BTCUSDT',
        side: 'SELL',
        type: 'LIMIT',
        qty: 0.01,
        price: 59990,
        postOnly: true,
        reduceOnly: false,
        leverage: 10,
        marginMode: 'ISOLATED',
        reason: '计划内',
      },
      ctx(),
    );
    expect(r.error).toBe('Post-Only 将立即吃单，已拒绝');
  });

  it('不会立即成交的 Post Only 挂上簿', () => {
    const r = applyPlaceOrder(
      funded(),
      {
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        qty: 0.01,
        price: 59900,
        timeInForce: 'GTX',
        reduceOnly: false,
        leverage: 10,
        marginMode: 'ISOLATED',
        reason: '计划内',
      },
      ctx(),
    );
    expect(r.error).toBeUndefined();
    expect(r.state.orders).toHaveLength(1);
    expect(r.state.orders[0]!.timeInForce).toBe('GTX');
    expect(r.state.positions).toHaveLength(0);
  });
});
