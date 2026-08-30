import { describe, expect, it } from 'vitest';
import { calcFee, MAKER_RATE, TAKER_RATE } from './fees';

describe('手续费计算（VIP0）', () => {
  it('费率常量：maker 0.0200%，taker 0.0500%', () => {
    expect(MAKER_RATE).toBe(0.0002);
    expect(TAKER_RATE).toBe(0.0005);
  });

  it('名义 10000：taker=5，maker=2', () => {
    // 10000 × 0.0005 = 5；10000 × 0.0002 = 2
    expect(calcFee(10000, false)).toBe(5);
    expect(calcFee(10000, true)).toBe(2);
  });

  it('名义 50000：taker=25，maker=10', () => {
    // 50000 × 0.0005 = 25；50000 × 0.0002 = 10
    expect(calcFee(50000, false)).toBe(25);
    expect(calcFee(50000, true)).toBe(10);
  });

  it('名义 1：taker=0.0005，maker=0.0002', () => {
    expect(calcFee(1, false)).toBeCloseTo(0.0005, 12);
    expect(calcFee(1, true)).toBeCloseTo(0.0002, 12);
  });
});
