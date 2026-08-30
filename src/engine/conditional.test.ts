import { describe, expect, it } from 'vitest';
import { isConditionalTriggered } from './conditional';
import { applyMarkTick, applyPlaceOrder, createInitialState } from './engine';
import type { EngineState, MarketCtx, Order } from './types';

function baseOrder(over: Partial<Order>): Order {
  return {
    id: 'o1',
    symbol: 'BTCUSDT',
    side: 'BUY',
    type: 'STOP_MARKET',
    timeInForce: 'GTC',
    qty: 0.01,
    reduceOnly: false,
    workingType: 'MARK_PRICE',
    leverage: 10,
    marginMode: 'ISOLATED',
    status: 'NEW',
    createdAt: 1,
    stopPrice: 61000,
    ...over,
  };
}

function ctx(mark: number, last: number): MarketCtx {
  return {
    lastPrice: { BTCUSDT: last },
    markPrice: { BTCUSDT: mark },
    fundingRate: { BTCUSDT: 0 },
    nextFundingTime: { BTCUSDT: 0 },
    depth: { BTCUSDT: { bids: [[last - 10, 20]], asks: [[last + 10, 20]] } },
    change1m: { BTCUSDT: 0 },
    now: 1_700_000_000_000,
  };
}

function funded(): EngineState {
  const s = createInitialState();
  s.walletBalance = 20_000;
  s.totalDeposited = 20_000;
  return s;
}

describe('四类条件单触发', () => {
  it('STOP / STOP_MARKET：买≥触发、卖≤触发', () => {
    const buy = baseOrder({ type: 'STOP', side: 'BUY', stopPrice: 61000 });
    expect(isConditionalTriggered(buy, 60999)).toBe(false);
    expect(isConditionalTriggered(buy, 61000)).toBe(true);
    const sell = baseOrder({ type: 'STOP_MARKET', side: 'SELL', stopPrice: 59000 });
    expect(isConditionalTriggered(sell, 59001)).toBe(false);
    expect(isConditionalTriggered(sell, 59000)).toBe(true);
  });

  it('TAKE_PROFIT / TAKE_PROFIT_MARKET：买≤触发、卖≥触发', () => {
    const buy = baseOrder({ type: 'TAKE_PROFIT', side: 'BUY', stopPrice: 59000 });
    expect(isConditionalTriggered(buy, 59001)).toBe(false);
    expect(isConditionalTriggered(buy, 59000)).toBe(true);
    const sell = baseOrder({ type: 'TAKE_PROFIT_MARKET', side: 'SELL', stopPrice: 61000 });
    expect(isConditionalTriggered(sell, 60999)).toBe(false);
    expect(isConditionalTriggered(sell, 61000)).toBe(true);
  });

  it('默认按标记价触发，可选最新价', () => {
    let st = funded();
    st = applyPlaceOrder(
      st,
      {
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'STOP_MARKET',
        qty: 0.01,
        stopPrice: 61000,
        reduceOnly: false,
        leverage: 10,
        marginMode: 'ISOLATED',
        reason: '计划内',
        workingType: 'MARK_PRICE',
      },
      ctx(60000, 62000),
    ).state;
    expect(st.orders).toHaveLength(1);
    // 最新价已过触发、标记价未过 → 默认不触发
    st = applyMarkTick(st, ctx(60000, 62000)).state;
    expect(st.orders).toHaveLength(1);
    expect(st.positions).toHaveLength(0);
    // 标记价到达
    const fired = applyMarkTick(st, ctx(61000, 60000));
    expect(fired.state.orders).toHaveLength(0);
    expect(fired.state.positions).toHaveLength(1);
  });

  it('workingType=CONTRACT_PRICE 用最新价触发', () => {
    let st = funded();
    st = applyPlaceOrder(
      st,
      {
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'STOP_MARKET',
        qty: 0.01,
        stopPrice: 61000,
        reduceOnly: false,
        leverage: 10,
        marginMode: 'ISOLATED',
        reason: '计划内',
        workingType: 'CONTRACT_PRICE',
      },
      ctx(60000, 60000),
    ).state;
    const fired = applyMarkTick(st, ctx(60000, 61000));
    expect(fired.state.positions).toHaveLength(1);
  });
});
