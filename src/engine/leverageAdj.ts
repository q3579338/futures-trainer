import { availableBalance } from './account';
import { maxLeverageForNotional } from './brackets';
import { positionLiquidationPrice, shouldLiquidate } from './liquidation';
import { initialMargin } from './position';
import type { EngineState, MarketCtx, Position } from './types';

export function applyChangeLeverage(
  state: EngineState,
  symbol: string,
  leverage: number,
  ctx: MarketCtx,
): { state: EngineState; error?: string } {
  const lev = Math.round(leverage);
  if (lev < 1 || lev > 125) return { state, error: '杠杆须在 1 ~ 125' };
  if (lev > state.riskConfig.maxLeverage) {
    return { state, error: `超过风控最大杠杆 ${state.riskConfig.maxLeverage}x` };
  }

  const targets = state.positions.filter((p) => p.symbol === symbol);
  if (targets.length === 0) return { state };

  const marks = ctx.markPrice;
  const draftPositions = state.positions.map((p) => ({ ...p }));
  let occupiedDelta = 0;

  for (const pos of draftPositions) {
    if (pos.symbol !== symbol) continue;
    const mark = marks[pos.symbol] ?? ctx.lastPrice[pos.symbol] ?? pos.entryPrice;
    const notional = pos.qty * mark;
    const cap = maxLeverageForNotional(pos.symbol, notional);
    if (lev > cap) return { state, error: `超过档位最大杠杆 ${cap}x` };
    const newIm = initialMargin(pos.qty, mark, lev);
    const oldIm = pos.initialMargin;
    if (pos.marginMode === 'ISOLATED') {
      const need = newIm - pos.isolatedWallet;
      if (need > 0) occupiedDelta += need;
      pos.isolatedWallet = newIm;
    } else {
      occupiedDelta += newIm - oldIm;
    }
    pos.leverage = lev;
    pos.initialMargin = newIm;
  }

  const avail = availableBalance(state, marks);
  if (occupiedDelta > 0 && avail + 1e-8 < occupiedDelta) {
    return { state, error: '可用余额不足，无法降低杠杆' };
  }

  const next: EngineState = {
    ...state,
    positions: draftPositions,
  };

  for (const pos of next.positions) {
    if (pos.symbol !== symbol) continue;
    const mark = marks[pos.symbol] ?? ctx.lastPrice[pos.symbol] ?? pos.entryPrice;
    const lp = positionLiquidationPrice(next, pos, mark, marks);
    if (lp != null && shouldLiquidate(pos.side, mark, lp)) {
      return { state, error: '调整杠杆将立即触发强平' };
    }
  }
  return { state: next };
}

export function wouldLeverageLiquidate(
  state: EngineState,
  pos: Position,
  leverage: number,
  ctx: MarketCtx,
): boolean {
  const r = applyChangeLeverage(state, pos.symbol, leverage, ctx);
  return Boolean(r.error && r.error.includes('强平'));
}
