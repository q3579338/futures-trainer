import Dexie, { type Table } from 'dexie';
import { Preferences } from '@capacitor/preferences';
import type { EngineState, RiskLock } from '../engine/types';
import { createInitialState } from '../engine/engine';

const LOCK_KEY = 'futrainer.riskLock';
const STATE_KEY = 'engine';

class SimDB extends Dexie {
  kv!: Table<{ key: string; value: unknown }>;

  constructor() {
    super('futrainer-sim');
    this.version(1).stores({
      kv: 'key',
    });
  }
}

export const db = new SimDB();

export async function loadEngineState(): Promise<EngineState> {
  const row = await db.kv.get(STATE_KEY);
  let state: EngineState = row?.value
    ? ({ ...(row.value as EngineState) } as EngineState)
    : createInitialState(Date.now());
  if (!state.positionMode) state.positionMode = 'ONE_WAY';
  if (!state.orderHistory) state.orderHistory = [];

  // 启动时把 pending 风控配置生效
  if (state.pendingRiskConfig) {
    state = {
      ...state,
      riskConfig: { ...state.pendingRiskConfig },
    };
  }

  const pref = await Preferences.get({ key: LOCK_KEY });
  const prefLock: RiskLock | null = pref.value ? (JSON.parse(pref.value) as RiskLock) : null;
  const dbLock = state.lock;
  state.lock = mergeLocks(dbLock, prefLock);
  await persistLock(state.lock);
  return state;
}

function later(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}

/** 双写不一致时取更晚解锁的（更严） */
export function mergeLocks(a: RiskLock | undefined, b: RiskLock | null): RiskLock {
  const x = a ?? { dailyLossUntil: null, consecutiveUntil: null, liquidationUntil: null };
  if (!b) return { ...x };
  return {
    dailyLossUntil: later(x.dailyLossUntil, b.dailyLossUntil),
    consecutiveUntil: later(x.consecutiveUntil, b.consecutiveUntil),
    liquidationUntil: later(x.liquidationUntil, b.liquidationUntil),
  };
}

export async function persistLock(lock: RiskLock): Promise<void> {
  await Preferences.set({ key: LOCK_KEY, value: JSON.stringify(lock) });
}

export async function saveEngineState(state: EngineState): Promise<void> {
  await db.kv.put({ key: STATE_KEY, value: state });
  await persistLock(state.lock);
}

export async function clearEngineState(): Promise<void> {
  await db.kv.delete(STATE_KEY);
  await Preferences.remove({ key: LOCK_KEY });
}
