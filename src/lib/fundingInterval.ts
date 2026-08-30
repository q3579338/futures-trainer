/** 资金费结算周期：按币对动态，默认 8h。不改引擎结算公式。 */

export const DEFAULT_FUNDING_INTERVAL_HOURS = 8;

export interface FundingInfoRow {
  symbol: string;
  fundingIntervalHours: number;
}

/** 相邻两次 nextFundingTime 之差 → 小时周期 */
export function intervalFromAdjacent(prevNext: number, currNext: number): number | null {
  if (!(prevNext > 0) || !(currNext > prevNext)) return null;
  const hours = (currNext - prevNext) / 3_600_000;
  if (hours >= 0.9 && hours <= 1.1) return 1;
  if (hours >= 3.5 && hours <= 4.5) return 4;
  if (hours >= 7.5 && hours <= 8.5) return 8;
  return null;
}

/**
 * 优先用 /fapi/v1/fundingInfo；否则看 nextFundingTime 是否落在 4h 整点（04/12/20 UTC）。
 * 00/08/16 无法区分 4h 与 8h，退回 8。
 */
export function inferFundingIntervalHours(
  nextFundingTime: number,
  now = Date.now(),
  apiHours?: number,
): number {
  void now;
  if (apiHours && apiHours > 0) return apiHours;
  if (!(nextFundingTime > 0)) return DEFAULT_FUNDING_INTERVAL_HOURS;
  const utcH = new Date(nextFundingTime).getUTCHours();
  if (utcH % 4 === 0 && utcH % 8 !== 0) return 4;
  return DEFAULT_FUNDING_INTERVAL_HOURS;
}

export function fundingIntervalLabel(hours: number): string {
  const n = hours > 0 ? hours : DEFAULT_FUNDING_INTERVAL_HOURS;
  return `${n}时`;
}

export function mergeFundingIntervals(
  prev: Record<string, number>,
  rows: FundingInfoRow[],
): Record<string, number> {
  const next = { ...prev };
  for (const r of rows) {
    if (r.symbol && r.fundingIntervalHours > 0) next[r.symbol] = r.fundingIntervalHours;
  }
  return next;
}
