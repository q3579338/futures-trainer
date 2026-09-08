import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  bracketSource,
  clearLiveBrackets,
  DEFAULT_BRACKETS,
  getBracket,
  getBrackets,
  loadBracketTable,
  maintenanceMargin,
  maxLeverageForSymbol,
} from './brackets';
import { liquidationPrice } from './liquidation';

const TRUMP = [
  [0, 5000, 0.01, 0, 75],
  [5000, 20000, 0.015, 25, 50],
  [20000, 100000, 0.02, 125, 25],
  [100000, 200000, 0.025, 625, 20],
  [200000, 1000000, 0.05, 5625, 10],
] as Array<[number, number, number, number, number]>;

afterEach(() => clearLiveBrackets());

describe('实时档位表覆盖', () => {
  it('未加载时未建表的币走默认表', () => {
    expect(bracketSource('TRUMPUSDT')).toBe('default');
    expect(getBracket('TRUMPUSDT', 50_000).maintMarginRatio).toBe(0.05);
  });

  it('加载后按实时表算：TRUMPUSDT 5 万名义 MMR 2%、cum 125、最大 75 倍', () => {
    const n = loadBracketTable({ symbols: { TRUMPUSDT: TRUMP } });
    expect(n).toBe(1);
    expect(bracketSource('TRUMPUSDT')).toBe('live');
    const br = getBracket('TRUMPUSDT', 50_077.58);
    expect(br.maintMarginRatio).toBe(0.02);
    expect(br.cum).toBe(125);
    expect(maxLeverageForSymbol('TRUMPUSDT')).toBe(75);
    expect(maintenanceMargin('TRUMPUSDT', 50_000)).toBeCloseTo(50_000 * 0.02 - 125, 8);
  });

  it('用户实盘截图那笔：20x 逐仓多 TRUMP，强平价应离开仓价约 3.3%，不是 1.5%', () => {
    loadBracketTable({ symbols: { TRUMPUSDT: TRUMP } });
    const entry = 2.25656;
    const qty = 50_077.58 / entry;
    const br = getBracket('TRUMPUSDT', qty * 2.259);
    const lp = liquidationPrice({ side: 'LONG', qty, entryPrice: entry, isolatedWallet: 2_501.17, mmr: br.maintMarginRatio, cum: br.cum })!;
    expect(lp).toBeCloseTo(2.1819, 3);
    expect((entry - lp) / entry).toBeGreaterThan(0.03);
    expect((entry - lp) / entry).toBeLessThan(0.035);
  });

  it('实时表优先于内置表；未收录的币仍走内置/默认', () => {
    loadBracketTable({ symbols: { BTCUSDT: [[0, 300000, 0.004, 0, 150], [300000, 800000, 0.005, 300, 100]] } });
    expect(bracketSource('BTCUSDT')).toBe('live');
    expect(getBracket('BTCUSDT', 100_000).maintMarginRatio).toBe(0.004);
    expect(maxLeverageForSymbol('BTCUSDT')).toBe(150);
    expect(bracketSource('ETHUSDT')).toBe('builtin');
    expect(bracketSource('XYZUSDT')).toBe('default');
    expect(getBrackets('XYZUSDT')).toBe(DEFAULT_BRACKETS);
  });

  it('脏数据不入表：档位为空、数字非法、不是数组都跳过', () => {
    const n = loadBracketTable({
      symbols: { AUSDT: [], BUSDT: [[0, 1000, Number.NaN, 0, 10]], CUSDT: 'nope' as unknown as never, DUSDT: TRUMP },
    });
    expect(n).toBe(1);
    expect(bracketSource('DUSDT')).toBe('live');
    expect(bracketSource('BUSDT')).toBe('default');
  });

  it('随包分发的 public/brackets.json 结构与递推自洽', () => {
    const p = path.resolve(__dirname, '../../public/brackets.json');
    const data = JSON.parse(readFileSync(p, 'utf8')) as { count: number; symbols: Record<string, number[][]> };
    expect(data.count).toBeGreaterThan(300);
    expect(data.symbols.BTCUSDT).toBeDefined();
    expect(data.symbols.TRUMPUSDT).toBeDefined();
    for (const [sym, rows] of Object.entries(data.symbols)) {
      expect(rows[0]![0], sym).toBe(0);
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i]![0], `${sym} 第 ${i} 档下限=上一档上限`).toBe(rows[i - 1]![1]);
        const exp = rows[i - 1]![3] + rows[i]![0] * (rows[i]![2] - rows[i - 1]![2]);
        expect(Math.abs(exp - rows[i]![3]), `${sym} 第 ${i} 档 cum`).toBeLessThanOrEqual(1);
      }
    }
    const n = loadBracketTable(data);
    expect(n).toBe(data.count);
    expect(getBracket('TRUMPUSDT', 50_000).maintMarginRatio).toBeLessThanOrEqual(0.025);
  });
});
