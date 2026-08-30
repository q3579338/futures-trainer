import { describe, expect, it } from 'vitest';
import { boll, ema, kdj, macd, rsi, sma } from './indicators';

describe('K 线指标', () => {
  it('SMA(3) 手算', () => {
    expect(sma([1, 2, 3, 6], 3)).toEqual([null, null, 2, (2 + 3 + 6) / 3]);
  });

  it('EMA 首值等于 SMA', () => {
    const e = ema([1, 2, 3, 4], 3);
    expect(e[2]).toBeCloseTo(2, 9);
    expect(e[0]).toBeNull();
  });

  it('BOLL 中轨=SMA', () => {
    const v = [1, 2, 3, 4, 5];
    const b = boll(v, 3, 2);
    expect(b.mid[4]).toBeCloseTo(sma(v, 3)[4]!, 9);
    expect(b.upper[4]!).toBeGreaterThan(b.mid[4]!);
    expect(b.lower[4]!).toBeLessThan(b.mid[4]!);
  });

  it('RSI / MACD / KDJ 产出等长序列', () => {
    const c = [10, 11, 12, 11, 13, 14, 13, 15, 16, 15, 17, 18, 19, 18, 20, 21];
    const h = c.map((x) => x + 1);
    const l = c.map((x) => x - 1);
    expect(rsi(c, 5)).toHaveLength(c.length);
    expect(macd(c).dif).toHaveLength(c.length);
    expect(kdj(h, l, c).k).toHaveLength(c.length);
  });
});
