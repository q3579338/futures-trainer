import { availableBalance } from './account';
import { getBracket, maintenanceMargin } from './brackets';
import { distToLiqPct, liquidationPrice, shouldLiquidate } from './liquidation';
import type { EngineState, MarketCtx, Position } from './types';

const EPS = 1e-8;
/** 减少保证金后保证金率不得超过此值（危险区） */
export const MARGIN_RATIO_DANGER = 0.8;

export interface IsolatedPreview {
  nextWallet: number;
  liqPrice: number | null;
  marginRatio: number;
  maint: number;
}

export function previewIsolatedAdjust(
  pos: Position,
  delta: number,
  mark: number,
): IsolatedPreview | { error: string } {
  if (pos.marginMode !== 'ISOLATED') return { error: '仅逐仓仓位可调整保证金' };
  const nextWallet = pos.isolatedWallet + delta;
  if (nextWallet < -EPS) return { error: '保证金不能为负' };
  const notional = pos.qty * (mark > 0 ? mark : pos.entryPrice);
  const br = getBracket(pos.symbol, notional);
  const lp = liquidationPrice({
    side: pos.side,
    qty: pos.qty,
    entryPrice: pos.entryPrice,
    isolatedWallet: nextWallet,
    mmr: br.maintMarginRatio,
    cum: br.cum,
  });
  const upnl =
    pos.side === 'LONG'
      ? ((mark > 0 ? mark : pos.entryPrice) - pos.entryPrice) * pos.qty
      : (pos.entryPrice - (mark > 0 ? mark : pos.entryPrice)) * pos.qty;
  const marginBal = nextWallet + upnl;
  const maint = maintenanceMargin(pos.symbol, notional);
  const marginRatio = marginBal > 0 ? maint / marginBal : 1;
  return { nextWallet, liqPrice: lp, marginRatio, maint };
}

export function applyAdjustIsolatedMargin(
  state: EngineState,
  positionId: string,
  delta: number,
  ctx: MarketCtx,
): { state: EngineState; error?: string; liqPrice?: number | null } {
  if (!(delta !== 0) || !Number.isFinite(delta)) {
    return { state, error: '调整金额必须非 0' };
  }
  const pos = state.positions.find((p) => p.id === positionId);
  if (!pos) return { state, error: '仓位不存在' };
  if (pos.marginMode !== 'ISOLATED') return { state, error: '仅逐仓仓位可调整保证金' };

  const mark = ctx.markPrice[pos.symbol] ?? ctx.lastPrice[pos.symbol] ?? pos.entryPrice;
  const nextWallet = pos.isolatedWallet + delta;

  if (delta < 0 && nextWallet + EPS < pos.initialMargin) {
    return { state, error: '减少后不得低于起始保证金要求' };
  }

  const preview = previewIsolatedAdjust(pos, delta, mark);
  if ('error' in preview) return { state, error: preview.error };

  if (preview.liqPrice != null && shouldLiquidate(pos.side, mark, preview.liqPrice)) {
    return { state, error: '调整后将立即触发强平' };
  }
  if (delta < 0 && preview.marginRatio >= MARGIN_RATIO_DANGER) {
    return { state, error: '减少后保证金率进入危险区' };
  }
  if (delta < 0 && preview.liqPrice != null) {
    const dist = distToLiqPct(pos.side, mark, preview.liqPrice);
    if (dist < 10) return { state, error: '减少后距强平过近' };
  }

  // 钱包余额含逐仓占用；增加保证金只提高 isolatedWallet（占用↑、可用↓），不改 walletBalance
  if (delta > 0) {
    const avail = availableBalance(state, ctx.markPrice);
    if (avail + EPS < delta) return { state, error: '可用余额不足' };
  }
  const next: EngineState = {
    ...state,
    positions: state.positions.map((p) =>
      p.id === positionId ? { ...p, isolatedWallet: preview.nextWallet } : p,
    ),
  };
  return { state: next, liqPrice: preview.liqPrice };
}
