import type {
  EngineState,
  HedgeIntent,
  OrderSide,
  Position,
  PositionMode,
  PositionSide,
} from './types';

export function inferHedgePositionSide(
  side: OrderSide,
  reduceOnly: boolean,
  explicit?: PositionSide,
): PositionSide {
  if (explicit) return explicit;
  if (reduceOnly) return side === 'BUY' ? 'SHORT' : 'LONG';
  return side === 'BUY' ? 'LONG' : 'SHORT';
}

export function hedgeIntentOf(
  side: OrderSide,
  reduceOnly: boolean,
  explicit?: PositionSide,
): HedgeIntent {
  const ps = inferHedgePositionSide(side, reduceOnly, explicit);
  if (ps === 'LONG') return side === 'BUY' ? 'OPEN_LONG' : 'CLOSE_LONG';
  return side === 'SELL' ? 'OPEN_SHORT' : 'CLOSE_SHORT';
}

export function isHedgeClose(side: OrderSide, positionSide: PositionSide): boolean {
  return positionSide === 'LONG' ? side === 'SELL' : side === 'BUY';
}

export function findPosition(
  positions: Position[],
  symbol: string,
  mode: PositionMode,
  positionSide?: PositionSide,
): Position | undefined {
  if (mode === 'HEDGE') {
    if (!positionSide) return undefined;
    return positions.find((p) => p.symbol === symbol && p.side === positionSide);
  }
  return positions.find((p) => p.symbol === symbol);
}

export function findPositionIndex(
  positions: Position[],
  symbol: string,
  mode: PositionMode,
  positionSide?: PositionSide,
): number {
  if (mode === 'HEDGE') {
    if (!positionSide) return -1;
    return positions.findIndex((p) => p.symbol === symbol && p.side === positionSide);
  }
  return positions.findIndex((p) => p.symbol === symbol);
}

export function canSwitchPositionMode(state: EngineState): { ok: true } | { ok: false; error: string } {
  if (state.positions.length > 0) return { ok: false, error: '当前有持仓，无法切换持仓模式' };
  if (state.orders.some((o) => o.status === 'NEW')) return { ok: false, error: '当前有挂单，无法切换持仓模式' };
  return { ok: true };
}

export function applySwitchPositionMode(
  state: EngineState,
  mode: PositionMode,
): { state: EngineState; error?: string } {
  if (state.positionMode === mode) return { state };
  const gate = canSwitchPositionMode(state);
  if (!gate.ok) return { state, error: gate.error };
  return { state: { ...state, positionMode: mode } };
}
