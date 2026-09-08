import { create } from 'zustand';
import type { EngineEvent, PlaceOrderInput } from '../engine/engine';
import {
  applyAmendOrder,
  applyAmendTpsl,
  applyCancelOrder,
  applyCloseAll,
  applyClosePosition,
  applyDeposit,
  applyIsolatedMargin,
  applyLeverage,
  applyMarkTick,
  applyPendingRisk,
  applyPlaceOrder,
  applyPositionMode,
  applyReset,
  applyTradeTick,
  createInitialState,
} from '../engine/engine';
import { equity } from '../engine/account';
import type { EngineState, OpenReason, Position, PositionMode, RiskConfig, WorkingType } from '../engine/types';
import { DEFAULT_RISK_CONFIG } from '../engine/types';
import { clearEngineState, loadEngineState, saveEngineState } from '../db';
import { normalizeFeeTier } from '../engine/fees';
import { currentMarketCtxNow } from './marketStore';
import { vibrateFill } from '../lib/haptics';

export interface LiqFlash {
  pnl: number;
  holdMs: number;
  reason?: OpenReason;
  tiltScore: number;
  symbol: string;
  time: number;
}

interface SimStore {
  state: EngineState;
  hydrated: boolean;
  events: EngineEvent[];
  liqFlash: LiqFlash | null;
  pendingReason: null | { input: PlaceOrderInput; resolve: (r: OpenReason | null) => void };
  hydrate: () => Promise<void>;
  persist: () => void;
  deposit: (amount: number) => string | undefined;
  reset: () => Promise<void>;
  place: (input: PlaceOrderInput) => Promise<string | undefined>;
  cancel: (id: string) => void;
  amendOrder: (id: string, patch: { price?: number; qty?: number }) => string | undefined;
  closeSymbol: (symbol: string | null) => string | undefined;
  closePosition: (id: string, qty?: number) => string | undefined;
  amendTpsl: (
    positionId: string,
    patch: {
      takeProfit?: number | null;
      stopLoss?: number | null;
      takeProfitWorkingType?: WorkingType;
      stopLossWorkingType?: WorkingType;
    },
  ) => void;
  adjustIsolated: (positionId: string, delta: number) => string | undefined;
  changeLeverage: (symbol: string, leverage: number) => string | undefined;
  setPositionMode: (mode: PositionMode) => string | undefined;
  setFeeTier: (level: number) => void;
  setPendingRisk: (cfg: RiskConfig) => void;
  onMarkTick: () => void;
  onTradeTick: () => void;
  clearLiq: () => void;
  consumeEvents: () => EngineEvent[];
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(get: () => SimStore): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void saveEngineState(get().state);
  }, 200);
}

function applyEvents(set: (p: Partial<SimStore>) => void, get: () => SimStore, events: EngineEvent[]): void {
  if (events.length === 0) return;
  const liq = events.find((e) => e.type === 'LIQUIDATION');
  if (liq) {
    set({
      liqFlash: {
        pnl: liq.pnl ?? liq.trade?.realizedPnl ?? 0,
        holdMs: liq.holdMs ?? 0,
        reason: liq.reason,
        tiltScore: liq.tiltScore ?? 0,
        symbol: liq.position?.symbol ?? liq.trade?.symbol ?? '',
        time: Date.now(),
      },
    });
  }
  if (events.some((e) => e.type === 'FILL')) void vibrateFill();
  set({ events: [...get().events, ...events].slice(-50) });
}

export const useSimStore = create<SimStore>((set, get) => ({
  state: createInitialState(),
  hydrated: false,
  events: [],
  liqFlash: null,
  pendingReason: null,

  hydrate: async () => {
    const loaded = await loadEngineState();
    const booted = applyPendingRisk(loaded);
    set({ state: booted, hydrated: true });
    await saveEngineState(booted);
  },

  persist: () => {
    void saveEngineState(get().state);
  },

  deposit: (amount) => {
    const ctx = currentMarketCtxNow();
    const r = applyDeposit(get().state, amount, Date.now(), ctx);
    if (r.error) return r.error;
    set({ state: r.state });
    schedulePersist(get);
    return undefined;
  },

  reset: async () => {
    const next = applyReset(Date.now());
    next.riskConfig = { ...DEFAULT_RISK_CONFIG };
    next.pendingRiskConfig = { ...(get().state.pendingRiskConfig ?? DEFAULT_RISK_CONFIG) };
    set({ state: next, events: [], liqFlash: null });
    await clearEngineState();
    await saveEngineState(next);
  },

  place: async (input) => {
    const needsReason = !input.reduceOnly && !input.reason;
    if (needsReason) {
      const reason = await new Promise<OpenReason | null>((resolve) => {
        set({ pendingReason: { input, resolve } });
      });
      set({ pendingReason: null });
      if (!reason) return '已取消';
      input = { ...input, reason };
    }
    const ctx = currentMarketCtxNow();
    const r = applyPlaceOrder(get().state, input, ctx);
    if (r.error) return r.error;
    set({ state: r.state });
    applyEvents(set, get, r.events);
    schedulePersist(get);
    return undefined;
  },

  cancel: (id) => {
    const r = applyCancelOrder(get().state, id);
    set({ state: r.state });
    schedulePersist(get);
  },

  amendOrder: (id, patch) => {
    const ctx = currentMarketCtxNow();
    const r = applyAmendOrder(get().state, id, patch, ctx);
    if (r.error) return r.error;
    set({ state: r.state });
    applyEvents(set, get, r.events);
    schedulePersist(get);
    return undefined;
  },

  closeSymbol: (symbol) => {
    const ctx = currentMarketCtxNow();
    const r = applyCloseAll(get().state, symbol, ctx);
    if (r.error) return r.error;
    set({ state: r.state });
    applyEvents(set, get, r.events);
    schedulePersist(get);
    return undefined;
  },

  closePosition: (id, qty) => {
    const ctx = currentMarketCtxNow();
    const r = applyClosePosition(get().state, id, ctx, qty);
    if (r.error) return r.error;
    set({ state: r.state });
    applyEvents(set, get, r.events);
    schedulePersist(get);
    return undefined;
  },

  amendTpsl: (positionId, patch) => {
    const r = applyAmendTpsl(get().state, positionId, patch);
    set({ state: r.state });
    schedulePersist(get);
  },

  adjustIsolated: (positionId, delta) => {
    const ctx = currentMarketCtxNow();
    const r = applyIsolatedMargin(get().state, positionId, delta, ctx);
    if (r.error) return r.error;
    set({ state: r.state });
    schedulePersist(get);
    return undefined;
  },

  changeLeverage: (symbol, leverage) => {
    const ctx = currentMarketCtxNow();
    const r = applyLeverage(get().state, symbol, leverage, ctx);
    if (r.error) return r.error;
    set({ state: r.state });
    schedulePersist(get);
    return undefined;
  },

  setPositionMode: (mode) => {
    const r = applyPositionMode(get().state, mode);
    if (r.error) return r.error;
    set({ state: r.state });
    schedulePersist(get);
    return undefined;
  },

  setFeeTier: (level) => {
    const next: EngineState = { ...get().state, feeTier: normalizeFeeTier(level) };
    set({ state: next });
    schedulePersist(get);
  },

  setPendingRisk: (cfg) => {
    const next: EngineState = { ...get().state, pendingRiskConfig: { ...cfg } };
    set({ state: next });
    schedulePersist(get);
  },

  onMarkTick: () => {
    if (!get().hydrated) return;
    const ctx = currentMarketCtxNow();
    const r = applyMarkTick(get().state, ctx);
    if (r.events.length === 0) return;
    set({ state: r.state });
    applyEvents(set, get, r.events);
    schedulePersist(get);
  },

  onTradeTick: () => {
    if (!get().hydrated) return;
    const ctx = currentMarketCtxNow();
    const r = applyTradeTick(get().state, ctx);
    if (r.events.length === 0) return;
    set({ state: r.state });
    applyEvents(set, get, r.events);
    schedulePersist(get);
  },

  clearLiq: () => set({ liqFlash: null }),

  consumeEvents: () => {
    const ev = get().events;
    set({ events: [] });
    return ev;
  },
}));

export function currentEquity(): number {
  const st = useSimStore.getState().state;
  const ctx = currentMarketCtxNow();
  return equity(st, ctx.markPrice);
}

export function positionOf(symbol: string): Position | undefined {
  return useSimStore.getState().state.positions.find((p) => p.symbol === symbol);
}
