import { describe, expect, it } from 'vitest';
import { adlLights } from './adl';
import type { Position } from './types';

function p(over: Partial<Position> = {}): Position {
  return {
    id: 'p',
    symbol: 'BTCUSDT',
    side: 'LONG',
    qty: 1,
    entryPrice: 60000,
    leverage: 20,
    marginMode: 'ISOLATED',
    isolatedWallet: 3000,
    initialMargin: 3000,
    openTime: 1,
    reason: '计划内',
    tags: [],
    tiltScore: 0,
    accumulatedFunding: 0,
    lastFundingSettle: 1,
    ...over,
  };
}

describe('ADL 五格', () => {
  it('亏损或持平为 0 格', () => {
    expect(adlLights(p(), 60000)).toBe(0);
    expect(adlLights(p(), 59000)).toBe(0);
  });

  it('盈利×杠杆映射 1~5 格', () => {
    // ROE = 1000/3000 ≈ 0.333, score = 0.333*20 ≈ 6.67 → 3 格
    expect(adlLights(p(), 61000)).toBe(3);
    // 大盈利
    expect(adlLights(p({ leverage: 50 }), 70000)).toBe(5);
  });
});
