import type { EquitySnapshot, TradeRecord } from '../engine/types';

export type PnlRangeKey = '7d' | '1m' | '3m' | '1y' | 'custom';

export interface DayPnl {
  date: string;
  start: number;
  pnl: number;
}

export function tradeRealized(t: TradeRecord): number {
  if (t.type === 'CLOSE' || t.type === 'LIQUIDATION') return t.realizedPnl;
  if (t.type === 'FUNDING') return -(t.funding ?? 0);
  return 0;
}

export function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function ymd(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function rangeStart(key: PnlRangeKey, now: number, customFrom?: number): number {
  if (key === 'custom' && customFrom != null) return customFrom;
  const day = startOfLocalDay(now);
  if (key === '7d') return day - 6 * 86400_000;
  if (key === '1m') return day - 29 * 86400_000;
  if (key === '3m') return day - 89 * 86400_000;
  return day - 364 * 86400_000;
}

export function dailyPnlSeries(trades: TradeRecord[], from: number, to: number): DayPnl[] {
  const start = startOfLocalDay(from);
  const end = startOfLocalDay(to);
  const map = new Map<string, number>();
  const lastExclusive = end + 86400_000;
  for (const t of trades) {
    if (t.time < start || t.time >= lastExclusive) continue;
    const k = ymd(t.time);
    map.set(k, (map.get(k) ?? 0) + tradeRealized(t));
  }
  const out: DayPnl[] = [];
  for (let t = start; t <= end; t += 86400_000) {
    const date = ymd(t);
    out.push({ date, start: t, pnl: map.get(date) ?? 0 });
  }
  return out;
}

export function sumRealized(trades: TradeRecord[], from: number, to: number): { win: number; loss: number; net: number } {
  let win = 0;
  let loss = 0;
  for (const t of trades) {
    if (t.time < from || t.time > to) continue;
    const n = tradeRealized(t);
    if (n > 0) win += n;
    else if (n < 0) loss += n;
  }
  return { win, loss, net: win + loss };
}

export function periodPnl(
  trades: TradeRecord[],
  from: number,
  to: number,
): { pnl: number; pct: number } {
  const { net } = sumRealized(trades, from, to);
  return { pnl: net, pct: 0 };
}

/** 以区间开始时权益作分母；没有快照则退回累计入金 */
export function pnlPct(pnl: number, startEquity: number): number {
  if (!(startEquity > 0)) return 0;
  return (pnl / startEquity) * 100;
}

export function equityAt(snapshots: EquitySnapshot[], t: number, fallback: number): number {
  let best: EquitySnapshot | null = null;
  for (const s of snapshots) {
    if (s.time <= t && (!best || s.time > best.time)) best = s;
  }
  return best?.equity ?? fallback;
}
