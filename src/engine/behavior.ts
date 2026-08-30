/**
 * 自动标签（引擎判定，无需用户参与）
 *
 * REVENGE 回血单：距上一笔亏损平仓 < 10 分钟，且本笔保证金 ≥ 上一笔的 1.5 倍
 * OVERSIZE：本笔保证金 > 权益 × 20%
 * HIGH_LEV：杠杆 > 20x
 * CHASE 追涨杀跌：开仓时该 symbol 近 1 分钟涨跌幅 > 1% 且开仓方向与之同向
 *
 * TILT_SCORE 0–100，由四项加权后钳位到 [0, 100]：
 *
 *   TILT_SCORE = clamp(0, 100,
 *     0.30 × sizeDeviationScore
 *   + 0.25 × recencyScore
 *   + 0.25 × streakScore
 *   + 0.20 × leverageScore
 *   )
 *
 * 仓位偏离度 sizeDeviationScore（相对「正常仓位 = 权益的 10%」）：
 *   score = clamp(0, 100, (margin / equity) / 0.10 × 50)
 *   占用 10% 权益 → 50；占用 20% 权益 → 100。
 *
 * 距上次平仓间隔 recencyScore：
 *   无上次平仓 → 0；
 *   score = clamp(0, 100, 100 × (1 − minutesSinceClose / 30))
 *   刚平完立刻再开 → 100；间隔 ≥ 30 分钟 → 0。
 *
 * 当前连亏次数 streakScore：
 *   score = clamp(0, 100, consecutiveLosses × 25)
 *   4 连亏 → 100。
 *
 * 杠杆偏离度 leverageScore（相对风控默认 20x）：
 *   score = clamp(0, 100, max(0, leverage − 20) / 20 × 100)
 *   20x → 0；40x 及以上 → 100。
 */
import type { AutoTag, LastLossClose, PositionSide } from './types';

const TEN_MIN_MS = 10 * 60 * 1000;

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export interface TagInput {
  margin: number;
  equity: number;
  leverage: number;
  side: PositionSide;
  change1mPct: number;
  now: number;
  lastLossClose: LastLossClose | null;
  lastCloseTime: number | null;
  consecutiveLosses: number;
}

export function isRevenge(margin: number, now: number, lastLossClose: LastLossClose | null): boolean {
  if (!lastLossClose) return false;
  if (now - lastLossClose.time >= TEN_MIN_MS) return false;
  if (lastLossClose.pnl >= 0) return false;
  return margin >= lastLossClose.margin * 1.5;
}

export function computeTags(input: TagInput): AutoTag[] {
  const tags: AutoTag[] = [];
  if (isRevenge(input.margin, input.now, input.lastLossClose)) tags.push('REVENGE');
  if (input.equity > 0 && input.margin > input.equity * 0.2) tags.push('OVERSIZE');
  if (input.leverage > 20) tags.push('HIGH_LEV');
  const ch = input.change1mPct;
  if (ch > 1 && input.side === 'LONG') tags.push('CHASE');
  if (ch < -1 && input.side === 'SHORT') tags.push('CHASE');
  return tags;
}

export function computeTiltScore(input: TagInput): number {
  const equity = Math.max(input.equity, 0);
  const sizeRatio = equity > 0 ? input.margin / equity : 1;
  const sizeDeviationScore = clamp((sizeRatio / 0.1) * 50, 0, 100);

  let recencyScore = 0;
  if (input.lastCloseTime != null) {
    const minutes = (input.now - input.lastCloseTime) / 60000;
    recencyScore = clamp(100 * (1 - minutes / 30), 0, 100);
  }

  const streakScore = clamp(input.consecutiveLosses * 25, 0, 100);
  const leverageScore = clamp((Math.max(0, input.leverage - 20) / 20) * 100, 0, 100);

  const tilt =
    0.3 * sizeDeviationScore + 0.25 * recencyScore + 0.25 * streakScore + 0.2 * leverageScore;
  return Math.round(clamp(tilt, 0, 100));
}
