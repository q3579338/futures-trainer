import { db } from '../db';

export const DEFAULT_REST_BASE = 'https://fapi.binance.com';
export const DEFAULT_WS_BASE = 'wss://fstream.binance.com';

const ENDPOINTS_KEY = 'marketEndpoints';

export interface MarketEndpoints {
  restBase: string;
  wsBase: string;
}

let current: MarketEndpoints = {
  restBase: DEFAULT_REST_BASE,
  wsBase: DEFAULT_WS_BASE,
};

export function normalizeRestBase(url: string): string {
  const t = url.trim().replace(/\/+$/, '');
  return t || DEFAULT_REST_BASE;
}

export function normalizeWsBase(url: string): string {
  const t = url.trim().replace(/\/+$/, '');
  return t || DEFAULT_WS_BASE;
}

export function getEndpoints(): MarketEndpoints {
  return { ...current };
}

export function setEndpointsMemory(next: MarketEndpoints): void {
  current = {
    restBase: normalizeRestBase(next.restBase),
    wsBase: normalizeWsBase(next.wsBase),
  };
}

export function validateEndpoints(restBase: string, wsBase: string): string | null {
  const r = restBase.trim();
  const w = wsBase.trim();
  if (r && !/^https?:\/\//i.test(r)) return 'REST 基址需以 http:// 或 https:// 开头';
  if (w && !/^wss?:\/\//i.test(w)) return 'WS 基址需以 ws:// 或 wss:// 开头';
  return null;
}

export function wsStreamUrl(streams: string, base = current.wsBase): string {
  return `${normalizeWsBase(base)}/stream?streams=${streams}`;
}

export function wsHandshakeUrl(base = current.wsBase): string {
  return `${normalizeWsBase(base)}/stream?streams=btcusdt@markPrice@1s`;
}

export async function loadEndpoints(): Promise<MarketEndpoints> {
  try {
    const row = await db.kv.get(ENDPOINTS_KEY);
    const v = row?.value as Partial<MarketEndpoints> | undefined;
    if (v && typeof v === 'object') {
      setEndpointsMemory({
        restBase: typeof v.restBase === 'string' ? v.restBase : DEFAULT_REST_BASE,
        wsBase: typeof v.wsBase === 'string' ? v.wsBase : DEFAULT_WS_BASE,
      });
    }
  } catch {
    /* IndexedDB 不可用时保持默认 */
  }
  return getEndpoints();
}

export async function saveEndpoints(next: MarketEndpoints): Promise<void> {
  setEndpointsMemory(next);
  await db.kv.put({ key: ENDPOINTS_KEY, value: getEndpoints() });
}
