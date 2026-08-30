import { describe, expect, it } from 'vitest';
import { midLastPrice, shouldDeriveLastFromDepth, tickerLastOverride } from './lastPrice';

describe('aggTrade 哑时最新价用盘口中间价', () => {
  it('买一 77183 卖一 77189 → 中间价 77186', () => {
    expect(
      midLastPrice({
        bids: [[77183.7, 1.2]],
        asks: [[77188.5, 0.8]],
      }),
    ).toBeCloseTo((77183.7 + 77188.5) / 2, 9);
  });

  it('只有买一时退回买一', () => {
    expect(midLastPrice({ bids: [[100, 1]], asks: [] })).toBe(100);
  });

  it('ticker 在哑流时不得覆盖最新价，只在成交流活着时覆盖', () => {
    expect(tickerLastOverride(true, 77183.7)).toBeNull();
    expect(tickerLastOverride(false, 77183.7)).toBe(77183.7);
    expect(shouldDeriveLastFromDepth(true)).toBe(true);
    expect(shouldDeriveLastFromDepth(false)).toBe(false);
  });
});
