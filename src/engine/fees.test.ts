import { describe, expect, it } from 'vitest';
import {
  calcFee,
  DEFAULT_FEE_TIER,
  FEE_TIERS,
  feeRate,
  feeTierLabel,
  MAKER_RATE,
  normalizeFeeTier,
  TAKER_RATE,
} from './fees';

describe('手续费分层', () => {
  it('VIP0 常量：maker 0.0200%，taker 0.0500%', () => {
    expect(MAKER_RATE).toBe(0.0002);
    expect(TAKER_RATE).toBe(0.0005);
  });

  it('默认等级是 VIP2：maker 0.0140%，taker 0.0350%', () => {
    expect(DEFAULT_FEE_TIER).toBe(2);
    expect(feeRate(true)).toBe(0.00014);
    expect(feeRate(false)).toBe(0.00035);
    // 名义 10000：taker 3.5，maker 1.4
    expect(calcFee(10000, false)).toBeCloseTo(3.5, 10);
    expect(calcFee(10000, true)).toBeCloseTo(1.4, 10);
  });

  it('指定等级：VIP0 名义 10000 taker=5 maker=2；VIP9 maker 免费', () => {
    expect(calcFee(10000, false, 0)).toBe(5);
    expect(calcFee(10000, true, 0)).toBe(2);
    expect(calcFee(10000, true, 9)).toBe(0);
    expect(calcFee(10000, false, 9)).toBeCloseTo(1.7, 10);
  });

  it('十档单调：等级越高费率越低', () => {
    expect(FEE_TIERS).toHaveLength(10);
    for (let i = 1; i < FEE_TIERS.length; i++) {
      expect(FEE_TIERS[i]!.maker).toBeLessThanOrEqual(FEE_TIERS[i - 1]!.maker);
      expect(FEE_TIERS[i]!.taker).toBeLessThan(FEE_TIERS[i - 1]!.taker);
    }
  });

  it('等级归一化：空/非法回默认，越界夹到 0~9', () => {
    expect(normalizeFeeTier(undefined)).toBe(2);
    expect(normalizeFeeTier(Number.NaN)).toBe(2);
    expect(normalizeFeeTier(-3)).toBe(0);
    expect(normalizeFeeTier(42)).toBe(9);
    expect(normalizeFeeTier(3.4)).toBe(3);
  });

  it('负名义取绝对值', () => {
    expect(calcFee(-10000, false, 0)).toBe(5);
  });

  it('标签', () => {
    expect(feeTierLabel(2)).toBe('VIP2 · Maker 0.0140% / Taker 0.0350%');
  });
});
