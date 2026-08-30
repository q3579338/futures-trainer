import type { PositionSide } from './types';

/** 按已实现盈亏金额反推触发价：多头 trigger = entry + pnl/qty；空头 trigger = entry − pnl/qty */
export function triggerFromPnl(
  side: PositionSide,
  entryPrice: number,
  qty: number,
  pnl: number,
): number | null {
  if (!(qty > 0) || !(entryPrice > 0) || !Number.isFinite(pnl)) return null;
  if (side === 'LONG') return entryPrice + pnl / qty;
  return entryPrice - pnl / qty;
}

/** 按回报率（%）反推触发价。roePct=10 表示 +10% */
export function triggerFromRoe(
  side: PositionSide,
  entryPrice: number,
  qty: number,
  initialMargin: number,
  roePct: number,
): number | null {
  if (!(initialMargin > 0) || !Number.isFinite(roePct)) return null;
  const pnl = (roePct / 100) * initialMargin;
  return triggerFromPnl(side, entryPrice, qty, pnl);
}

export function pnlAtTrigger(
  side: PositionSide,
  entryPrice: number,
  qty: number,
  trigger: number,
): number {
  if (side === 'LONG') return (trigger - entryPrice) * qty;
  return (entryPrice - trigger) * qty;
}

export function roeAtTrigger(
  side: PositionSide,
  entryPrice: number,
  qty: number,
  initialMargin: number,
  trigger: number,
): number {
  if (!(initialMargin > 0)) return 0;
  return (pnlAtTrigger(side, entryPrice, qty, trigger) / initialMargin) * 100;
}
