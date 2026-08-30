/**
 * 强平价公式（规格 3.4，必须按此实现，用标记价触发）
 *
 * 逐仓：
 *   多头 LP = (Qty×EP − IsolatedWallet − cum) / (Qty × (1 − MMR))
 *   空头 LP = (Qty×EP + IsolatedWallet + cum) / (Qty × (1 + MMR))
 * IsolatedWallet = 该仓位分配的逐仓保证金（含已结算资金费与已实现盈亏）
 *
 * 全仓：把 IsolatedWallet 换成
 *   walletBalance − 其他仓位维持保证金合计 + 其他仓位未实现盈亏合计
 *
 * EP = 开仓均价，Qty = 持仓数量，cum / MMR 取当前名义价值所在档位。
 */
import type { EngineState, MarketCtx, Position, PositionSide } from './types';
import { getBracket, maintenanceMargin } from './brackets';
import { unrealizedPnl } from './account';

export interface LiqPriceInput {
  side: PositionSide;
  qty: number;
  entryPrice: number;
  isolatedWallet: number;
  mmr: number;
  cum: number;
}

export function liquidationPrice(input: LiqPriceInput): number | null {
  const { side, qty, entryPrice, isolatedWallet, mmr, cum } = input;
  if (qty <= 0) return null;
  if (side === 'LONG') {
    const den = qty * (1 - mmr);
    if (den === 0) return null;
    return (qty * entryPrice - isolatedWallet - cum) / den;
  }
  const den = qty * (1 + mmr);
  if (den === 0) return null;
  return (qty * entryPrice + isolatedWallet + cum) / den;
}

/** 全仓时替代 IsolatedWallet 的有效保证金 */
export function crossedWalletEquiv(
  state: EngineState,
  self: Position,
  marks: Record<string, number>,
): number {
  let otherMaint = 0;
  let otherUpnl = 0;
  for (const p of state.positions) {
    if (p.id === self.id) continue;
    const mark = marks[p.symbol] ?? p.entryPrice;
    const notional = p.qty * mark;
    otherMaint += maintenanceMargin(p.symbol, notional);
    otherUpnl += unrealizedPnl(p, mark);
  }
  return state.walletBalance - otherMaint + otherUpnl;
}

export function positionLiquidationPrice(
  state: EngineState,
  pos: Position,
  markPrice: number,
  marks: Record<string, number>,
): number | null {
  const notional = pos.qty * markPrice;
  const br = getBracket(pos.symbol, notional);
  const wallet =
    pos.marginMode === 'ISOLATED'
      ? pos.isolatedWallet
      : crossedWalletEquiv(state, pos, marks);
  return liquidationPrice({
    side: pos.side,
    qty: pos.qty,
    entryPrice: pos.entryPrice,
    isolatedWallet: wallet,
    mmr: br.maintMarginRatio,
    cum: br.cum,
  });
}

export function previewLiquidationPrice(params: {
  symbol: string;
  side: PositionSide;
  qty: number;
  entryPrice: number;
  leverage: number;
  marginMode: 'ISOLATED' | 'CROSSED';
  walletBalance: number;
  isolatedWallet?: number;
}): number | null {
  const notional = params.qty * params.entryPrice;
  const br = getBracket(params.symbol, notional);
  const im = notional / params.leverage;
  const wallet =
    params.marginMode === 'ISOLATED' ? (params.isolatedWallet ?? im) : params.walletBalance;
  return liquidationPrice({
    side: params.side,
    qty: params.qty,
    entryPrice: params.entryPrice,
    isolatedWallet: wallet,
    mmr: br.maintMarginRatio,
    cum: br.cum,
  });
}

/** 多头 markPrice ≤ LP 触发；空头 markPrice ≥ LP 触发 */
export function shouldLiquidate(side: PositionSide, markPrice: number, lp: number): boolean {
  if (side === 'LONG') return markPrice <= lp;
  return markPrice >= lp;
}

export function distToLiqPct(side: PositionSide, markPrice: number, lp: number): number {
  if (markPrice <= 0) return 0;
  if (side === 'LONG') {
    if (markPrice <= lp) return 0;
    return ((markPrice - lp) / markPrice) * 100;
  }
  if (markPrice >= lp) return 0;
  return ((lp - markPrice) / markPrice) * 100;
}

export function collectLiquidations(
  state: EngineState,
  ctx: MarketCtx,
): Array<{ pos: Position; lp: number; mark: number }> {
  const hits: Array<{ pos: Position; lp: number; mark: number }> = [];
  const marks = ctx.markPrice;
  for (const pos of state.positions) {
    const mark = marks[pos.symbol];
    if (mark == null || mark <= 0) continue;
    const lp = positionLiquidationPrice(state, pos, mark, marks);
    if (lp == null) continue;
    if (shouldLiquidate(pos.side, mark, lp)) hits.push({ pos, lp, mark });
  }
  return hits;
}
