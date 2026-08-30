import type { Deposit, EquitySnapshot, OpenReason, TradeRecord } from './types';
import { OPEN_REASONS } from './types';

export interface ReasonBucket {
  reason: OpenReason;
  count: number;
  wins: number;
  pnl: number;
  winRate: number;
}

export interface ReviewStats {
  tradeCount: number;
  wins: number;
  losses: number;
  winRate: number;
  grossWin: number;
  grossLoss: number;
  profitFactor: number | null;
  expectancy: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  liquidationCount: number;
  totalFee: number;
  totalFundingPaid: number;
  byReason: ReasonBucket[];
  revenge: {
    count: number;
    loseCount: number;
    pnl: number;
    sentence: string;
  };
  holdBuckets: { label: string; count: number }[];
  hourlyPnl: { hour: number; pnl: number; count: number }[];
}

function closedTrades(trades: TradeRecord[]): TradeRecord[] {
  return trades.filter((t) => t.type === 'CLOSE' || t.type === 'LIQUIDATION');
}

function fmtSigned(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  if (n > 0) return `+${abs}`;
  if (n < 0) return `−${abs}`;
  return abs;
}

export function revengeSentence(count: number, loseCount: number, pnl: number): string {
  if (count === 0) {
    return '你还没有被判定为回血单的交易。距上一笔亏损平仓 10 分钟内且本笔保证金 ≥ 上笔 1.5 倍时，系统会自动标记 REVENGE。';
  }
  return `你的 ${count} 笔回血单里 ${loseCount} 笔继续亏，累计 ${fmtSigned(pnl)} USDT`;
}

export function maxDrawdown(snapshots: EquitySnapshot[]): { abs: number; pct: number } {
  let peak = -Infinity;
  let dd = 0;
  let ddPct = 0;
  for (const s of snapshots) {
    if (s.equity > peak) peak = s.equity;
    const drop = peak - s.equity;
    if (drop > dd) {
      dd = drop;
      ddPct = peak > 0 ? drop / peak : 0;
    }
  }
  return { abs: dd === -Infinity ? 0 : Math.max(0, dd), pct: ddPct };
}

const HOLD_DEFS: { label: string; max: number }[] = [
  { label: '<1 分钟', max: 60_000 },
  { label: '1–5 分钟', max: 5 * 60_000 },
  { label: '5–15 分钟', max: 15 * 60_000 },
  { label: '15–60 分钟', max: 60 * 60_000 },
  { label: '1–4 小时', max: 4 * 60 * 60_000 },
  { label: '>4 小时', max: Infinity },
];

export function computeReviewStats(
  trades: TradeRecord[],
  deposits: Deposit[],
  snapshots: EquitySnapshot[],
): ReviewStats {
  void deposits;
  const closed = closedTrades(trades);
  const wins = closed.filter((t) => t.realizedPnl > 0);
  const losses = closed.filter((t) => t.realizedPnl < 0);
  const grossWin = wins.reduce((s, t) => s + t.realizedPnl, 0);
  const grossLoss = losses.reduce((s, t) => s + t.realizedPnl, 0);
  const pnlSum = closed.reduce((s, t) => s + t.realizedPnl, 0);
  const dd = maxDrawdown(snapshots);

  const byReason: ReasonBucket[] = OPEN_REASONS.map((reason) => {
    const rows = closed.filter((t) => t.reason === reason);
    const w = rows.filter((t) => t.realizedPnl > 0).length;
    const pnl = rows.reduce((s, t) => s + t.realizedPnl, 0);
    return {
      reason,
      count: rows.length,
      wins: w,
      pnl,
      winRate: rows.length ? w / rows.length : 0,
    };
  });

  const revengeRows = closed.filter((t) => t.tags?.includes('REVENGE'));
  const revengeLose = revengeRows.filter((t) => t.realizedPnl < 0).length;
  const revengePnl = revengeRows.reduce((s, t) => s + t.realizedPnl, 0);

  const holdBuckets = HOLD_DEFS.map((d) => ({ label: d.label, count: 0 }));
  for (const t of closed) {
    const ms = t.holdMs ?? 0;
    const idx = HOLD_DEFS.findIndex((d) => ms < d.max);
    const i = idx >= 0 ? idx : HOLD_DEFS.length - 1;
    holdBuckets[i]!.count += 1;
  }

  const hourlyPnl = Array.from({ length: 24 }, (_, hour) => ({ hour, pnl: 0, count: 0 }));
  for (const t of closed) {
    const hour = new Date(t.time).getHours();
    const b = hourlyPnl[hour]!;
    b.pnl += t.realizedPnl;
    b.count += 1;
  }

  const totalFee = trades.reduce((s, t) => s + (t.fee ?? 0), 0);
  const totalFundingPaid = trades
    .filter((t) => t.type === 'FUNDING')
    .reduce((s, t) => s + (t.funding ?? 0), 0);
  const liquidationCount = trades.filter((t) => t.type === 'LIQUIDATION').length;

  return {
    tradeCount: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length ? wins.length / closed.length : 0,
    grossWin,
    grossLoss,
    profitFactor: grossLoss !== 0 ? grossWin / Math.abs(grossLoss) : null,
    expectancy: closed.length ? pnlSum / closed.length : 0,
    maxDrawdown: dd.abs,
    maxDrawdownPct: dd.pct,
    liquidationCount,
    totalFee,
    totalFundingPaid,
    byReason,
    revenge: {
      count: revengeRows.length,
      loseCount: revengeLose,
      pnl: revengePnl,
      sentence: revengeSentence(revengeRows.length, revengeLose, revengePnl),
    },
    holdBuckets,
    hourlyPnl,
  };
}
