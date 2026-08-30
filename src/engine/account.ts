import type { EngineState, MarketCtx, Position } from './types';
import { maintenanceMargin } from './brackets';
import { initialMargin } from './position';

export function unrealizedPnl(pos: Position, markPrice: number): number {
  if (pos.side === 'LONG') return (markPrice - pos.entryPrice) * pos.qty;
  return (pos.entryPrice - markPrice) * pos.qty;
}

export function totalUnrealizedPnl(state: EngineState, marks: Record<string, number>): number {
  let s = 0;
  for (const p of state.positions) {
    const m = marks[p.symbol] ?? p.entryPrice;
    s += unrealizedPnl(p, m);
  }
  return s;
}

export function marginBalance(state: EngineState, marks: Record<string, number>): number {
  return state.walletBalance + totalUnrealizedPnl(state, marks);
}

export function occupiedInitialMargin(state: EngineState): number {
  let s = 0;
  for (const p of state.positions) {
    if (p.marginMode === 'ISOLATED') s += p.isolatedWallet;
    else s += p.initialMargin;
  }
  return s;
}

export function frozenOrderMargin(state: EngineState): number {
  let s = 0;
  for (const o of state.orders) {
    if (o.status !== 'NEW' || o.reduceOnly) continue;
    const px = o.price ?? o.stopPrice ?? o.activationPrice ?? 0;
    if (px <= 0) continue;
    s += initialMargin(o.qty, px, o.leverage);
  }
  return s;
}

export function availableBalance(state: EngineState, marks: Record<string, number>): number {
  return marginBalance(state, marks) - occupiedInitialMargin(state) - frozenOrderMargin(state);
}

export function equity(state: EngineState, marks: Record<string, number>): number {
  return marginBalance(state, marks);
}

export function totalMaintMargin(state: EngineState, marks: Record<string, number>): number {
  let s = 0;
  for (const p of state.positions) {
    const m = marks[p.symbol] ?? p.entryPrice;
    s += maintenanceMargin(p.symbol, p.qty * m);
  }
  return s;
}

export function utcDayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function nextUtcMidnight(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0);
}

export function markOf(ctx: MarketCtx, symbol: string, fallback = 0): number {
  return ctx.markPrice[symbol] ?? ctx.lastPrice[symbol] ?? fallback;
}
