/**
 * 资金费：每 8 小时（UTC 00:00 / 08:00 / 16:00）结算，费率用 markPrice 流的实时 r。
 * 资金费 = 持仓名义价值 × r
 * r > 0 时多头付、空头收；r < 0 时多头收、空头付。
 * 返回值：正数表示账户付出，负数表示账户收入。
 */
import type { PositionSide } from './types';

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

export function calcFunding(
  qty: number,
  markPrice: number,
  rate: number,
  side: PositionSide,
): number {
  const notional = qty * markPrice;
  const signed = notional * rate;
  const pay = side === 'LONG' ? signed : -signed;
  return pay === 0 ? 0 : pay;
}

/** 下一个 UTC 00:00 / 08:00 / 16:00 */
export function nextFundingTime(now: number): number {
  const d = new Date(now);
  const h = d.getUTCHours();
  const nextH = h < 8 ? 8 : h < 16 ? 16 : 24;
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), nextH === 24 ? 24 : nextH, 0, 0, 0);
  return t;
}

export function prevFundingTime(now: number): number {
  return nextFundingTime(now) - EIGHT_HOURS_MS;
}

/** lastSettledAt < 结算时刻 ≤ now 的全部资金费时点（按时间升序） */
export function fundingTimesDue(lastSettledAt: number, now: number): number[] {
  if (now <= lastSettledAt) return [];
  const times: number[] = [];
  let t = nextFundingTime(lastSettledAt);
  while (t <= now) {
    times.push(t);
    t += EIGHT_HOURS_MS;
    if (times.length > 12) break;
  }
  return times;
}

export function fundingCountdownMs(now: number, nextT?: number): number {
  const target = nextT && nextT > now ? nextT : nextFundingTime(now);
  return Math.max(0, target - now);
}
