/**
 * 风控闸门（硬锁 + 冷静期，App 内不可绕过）
 * - 日亏损上限：默认权益 5% → 触发后当日禁止开新仓，UTC 00:00 解锁
 * - 连亏笔数：默认 3 笔 → 锁 4 小时
 * - 爆仓锁定：爆仓 1 次 → 锁 24 小时
 * - 单笔最大保证金占比：默认 20%，超出直接禁止下单
 * - 最大杠杆：默认 20x
 *
 * 锁定状态双写 IndexedDB + Capacitor Preferences。
 * 平仓、撤单、改止损永远可用。不提供「我确定要解锁」按钮。
 */
import type { EngineState, RiskConfig, RiskLock } from './types';
import { nextUtcMidnight, utcDayKey } from './account';

export const CONSECUTIVE_LOCK_MS = 4 * 60 * 60 * 1000;
export const LIQUIDATION_LOCK_MS = 24 * 60 * 60 * 1000;

export interface LockView {
  locked: boolean;
  until: number;
  reasons: string[];
}

export function activeLock(lock: RiskLock, now: number): LockView {
  const reasons: string[] = [];
  let until = 0;
  if (lock.dailyLossUntil != null && lock.dailyLossUntil > now) {
    reasons.push('日亏损上限');
    until = Math.max(until, lock.dailyLossUntil);
  }
  if (lock.consecutiveUntil != null && lock.consecutiveUntil > now) {
    reasons.push('连亏锁定');
    until = Math.max(until, lock.consecutiveUntil);
  }
  if (lock.liquidationUntil != null && lock.liquidationUntil > now) {
    reasons.push('爆仓锁定');
    until = Math.max(until, lock.liquidationUntil);
  }
  return { locked: reasons.length > 0, until, reasons };
}

export function dailyPnl(state: EngineState, equityNow: number): number {
  // 剔除当日入金：dailyPnl = (equity - deposited) - (dayStartEquity - dayStartDeposited)
  return (
    equityNow -
    state.dayStartEquity -
    (state.totalDeposited - state.dayStartDeposited)
  );
}

export function maybeRollUtcDay(state: EngineState, equityNow: number, now: number): void {
  const key = utcDayKey(now);
  if (key === state.dayKey) return;
  state.dayKey = key;
  state.dayStartEquity = equityNow;
  state.dayStartDeposited = state.totalDeposited;
  if (state.lock.dailyLossUntil != null && state.lock.dailyLossUntil <= now) {
    state.lock.dailyLossUntil = null;
  }
}

export function applyDailyLossLock(
  state: EngineState,
  equityNow: number,
  now: number,
): void {
  const start = state.dayStartEquity;
  if (start <= 0) return;
  const loss = -dailyPnl(state, equityNow);
  if (loss >= start * state.riskConfig.dailyLossPct) {
    state.lock.dailyLossUntil = nextUtcMidnight(now);
  }
}

export function applyConsecutiveLock(state: EngineState, now: number): void {
  if (state.consecutiveLosses >= state.riskConfig.consecutiveLossLimit) {
    state.lock.consecutiveUntil = now + CONSECUTIVE_LOCK_MS;
  }
}

export function applyLiquidationLock(state: EngineState, now: number): void {
  state.lock.liquidationUntil = now + LIQUIDATION_LOCK_MS;
}

export function canOpenNew(
  state: EngineState,
  now: number,
  margin: number,
  leverage: number,
  equityNow: number,
): { ok: boolean; reason: string } {
  const lock = activeLock(state.lock, now);
  if (lock.locked) {
    return { ok: false, reason: lock.reasons.join(' / ') };
  }
  if (leverage > state.riskConfig.maxLeverage) {
    return { ok: false, reason: `超过风控最大杠杆 ${state.riskConfig.maxLeverage}x` };
  }
  if (equityNow > 0 && margin > equityNow * state.riskConfig.maxMarginPct) {
    const pct = Math.round(state.riskConfig.maxMarginPct * 100);
    return { ok: false, reason: `超过单笔最大保证金占比 ${pct}%` };
  }
  return { ok: true, reason: '' };
}

export function isRelaxing(from: RiskConfig, to: RiskConfig): boolean {
  return (
    to.dailyLossPct > from.dailyLossPct ||
    to.consecutiveLossLimit > from.consecutiveLossLimit ||
    to.maxMarginPct > from.maxMarginPct ||
    to.maxLeverage > from.maxLeverage
  );
}

export function formatRemain(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}
