/**
 * 维持保证金档位表
 * 结构：{ notionalFloor, notionalCap, maintMarginRatio, cum, maxLeverage }
 * 维持保证金 = 名义价值 × MMR − cum
 *
 * BTCUSDT 来源：规格文件所列币安公开档位表（可后续更新）。
 * ETHUSDT / SOLUSDT / BNBUSDT：按币安公开杠杆保证金档位整理，cum 用
 *   cum_i = cum_{i-1} + notionalFloor_i × (MMR_i − MMR_{i-1})
 * 递推校验。其余 symbol 走 DEFAULT_BRACKETS。
 */
import type { Bracket } from './types';

function b(
  notionalFloor: number,
  notionalCap: number,
  maintMarginRatio: number,
  cum: number,
  maxLeverage: number,
): Bracket {
  return { notionalFloor, notionalCap, maintMarginRatio, cum, maxLeverage };
}

/** BTCUSDT：规格第三章表格，一字不改 */
export const BTCUSDT_BRACKETS: Bracket[] = [
  b(0, 50_000, 0.004, 0, 125),
  b(50_000, 600_000, 0.005, 50, 100),
  b(600_000, 3_000_000, 0.01, 3_050, 50),
  b(3_000_000, 12_000_000, 0.025, 48_050, 20),
  b(12_000_000, 70_000_000, 0.05, 348_050, 10),
  b(70_000_000, 100_000_000, 0.1, 3_848_050, 5),
  b(100_000_000, 230_000_000, 0.125, 6_348_050, 4),
  b(230_000_000, 480_000_000, 0.15, 12_098_050, 3),
  b(480_000_000, 600_000_000, 0.25, 60_098_050, 2),
  b(600_000_000, 1_000_000_000, 0.5, 210_098_050, 1),
];

/**
 * ETHUSDT 公开档位（币安 USDⓈ-M 杠杆保证金）
 * cum 校验：50000*(0.0065-0.005)=75；250000*(0.01-0.0065)+75=950；…
 */
export const ETHUSDT_BRACKETS: Bracket[] = [
  b(0, 50_000, 0.005, 0, 100),
  b(50_000, 250_000, 0.0065, 75, 75),
  b(250_000, 1_000_000, 0.01, 950, 50),
  b(1_000_000, 7_500_000, 0.02, 10_950, 25),
  b(7_500_000, 22_500_000, 0.05, 235_950, 10),
  b(22_500_000, 75_000_000, 0.1, 1_360_950, 5),
  b(75_000_000, 150_000_000, 0.125, 3_235_950, 4),
  b(150_000_000, 225_000_000, 0.15, 6_985_950, 3),
  b(225_000_000, 375_000_000, 0.25, 29_485_950, 2),
  b(375_000_000, 750_000_000, 0.5, 123_235_950, 1),
];

/**
 * SOLUSDT 公开档位
 * cum 校验：25000*(0.025-0.01)=375；100000*(0.05-0.025)+375=2875；…
 */
export const SOLUSDT_BRACKETS: Bracket[] = [
  b(0, 25_000, 0.01, 0, 50),
  b(25_000, 100_000, 0.025, 375, 25),
  b(100_000, 250_000, 0.05, 2_875, 20),
  b(250_000, 500_000, 0.1, 15_375, 10),
  b(500_000, 1_000_000, 0.125, 27_875, 5),
  b(1_000_000, 2_000_000, 0.15, 52_875, 4),
  b(2_000_000, 4_000_000, 0.25, 252_875, 2),
  b(4_000_000, 8_000_000, 0.5, 1_252_875, 1),
];

/**
 * BNBUSDT 公开档位
 * cum 校验：10000*(0.01-0.0065)=35；50000*(0.025-0.01)+35=785；…
 */
export const BNBUSDT_BRACKETS: Bracket[] = [
  b(0, 10_000, 0.0065, 0, 75),
  b(10_000, 50_000, 0.01, 35, 50),
  b(50_000, 250_000, 0.025, 785, 25),
  b(250_000, 1_000_000, 0.05, 7_035, 10),
  b(1_000_000, 2_000_000, 0.1, 57_035, 5),
  b(2_000_000, 5_000_000, 0.125, 107_035, 4),
  b(5_000_000, 10_000_000, 0.25, 732_035, 2),
  b(10_000_000, 20_000_000, 0.5, 3_232_035, 1),
];

/** 未单独建表的 symbol 使用的默认档位 */
export const DEFAULT_BRACKETS: Bracket[] = [
  b(0, 5_000, 0.01, 0, 50),
  b(5_000, 25_000, 0.025, 75, 25),
  b(25_000, 100_000, 0.05, 700, 20),
  b(100_000, 250_000, 0.1, 5_700, 10),
  b(250_000, 1_000_000, 0.125, 11_950, 5),
  b(1_000_000, 2_000_000, 0.15, 36_950, 4),
  b(2_000_000, 5_000_000, 0.25, 236_950, 2),
  b(5_000_000, 10_000_000, 0.5, 1_486_950, 1),
];

const TABLE: Record<string, Bracket[]> = {
  BTCUSDT: BTCUSDT_BRACKETS,
  ETHUSDT: ETHUSDT_BRACKETS,
  SOLUSDT: SOLUSDT_BRACKETS,
  BNBUSDT: BNBUSDT_BRACKETS,
};

export function getBrackets(symbol: string): Bracket[] {
  return TABLE[symbol.toUpperCase()] ?? DEFAULT_BRACKETS;
}

export function getBracket(symbol: string, notional: number): Bracket {
  const rows = getBrackets(symbol);
  const abs = Math.abs(notional);
  for (const row of rows) {
    if (abs >= row.notionalFloor && abs < row.notionalCap) return row;
  }
  return rows[rows.length - 1]!;
}

/** 维持保证金 = 名义价值 × MMR − cum */
export function maintenanceMargin(symbol: string, notional: number): number {
  const br = getBracket(symbol, notional);
  return Math.abs(notional) * br.maintMarginRatio - br.cum;
}

export function maxLeverageForNotional(symbol: string, notional: number): number {
  return getBracket(symbol, notional).maxLeverage;
}

export function maxLeverageForSymbol(symbol: string): number {
  return getBrackets(symbol)[0]?.maxLeverage ?? 20;
}
