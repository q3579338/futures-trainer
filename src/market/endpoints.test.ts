import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_REST_BASE,
  DEFAULT_WS_BASE,
  normalizeRestBase,
  normalizeWsBase,
  setEndpointsMemory,
  getEndpoints,
  validateEndpoints,
  wsStreamUrl,
} from './endpoints';
import { restFetchBase } from './rest';

afterEach(() => {
  setEndpointsMemory({ restBase: DEFAULT_REST_BASE, wsBase: DEFAULT_WS_BASE });
});

describe('行情源 URL', () => {
  it('默认基址', () => {
    expect(DEFAULT_REST_BASE).toBe('https://fapi.binance.com');
    expect(DEFAULT_WS_BASE).toBe('wss://fstream.binance.com');
  });

  it('normalize 去掉尾斜杠，空串回默认', () => {
    expect(normalizeRestBase('https://mirror.example/')).toBe('https://mirror.example');
    expect(normalizeRestBase('  ')).toBe(DEFAULT_REST_BASE);
    expect(normalizeWsBase('wss://proxy.local/fstream/')).toBe('wss://proxy.local/fstream');
  });

  it('非法 scheme 被拒绝', () => {
    expect(validateEndpoints('ftp://x', 'wss://fstream.binance.com')).toMatch(/REST/);
    expect(validateEndpoints('https://fapi.binance.com', 'http://x')).toMatch(/WS/);
    expect(validateEndpoints(DEFAULT_REST_BASE, DEFAULT_WS_BASE)).toBeNull();
  });

  it('wsStreamUrl 拼 combined stream', () => {
    setEndpointsMemory({ restBase: DEFAULT_REST_BASE, wsBase: 'wss://example.com/' });
    expect(wsStreamUrl('btcusdt@markPrice@1s')).toBe(
      'wss://example.com/stream?streams=btcusdt@markPrice@1s',
    );
    setEndpointsMemory({ restBase: DEFAULT_REST_BASE, wsBase: DEFAULT_WS_BASE });
    expect(getEndpoints().wsBase).toBe(DEFAULT_WS_BASE);
  });

  it('REST 默认直连 https://fapi.binance.com，不走 Vite /fapi 空基址', () => {
    setEndpointsMemory({ restBase: DEFAULT_REST_BASE, wsBase: DEFAULT_WS_BASE });
    expect(restFetchBase()).toBe(DEFAULT_REST_BASE);
    expect(restFetchBase()).not.toBe('');
  });

  it('自定义 REST 基址覆盖默认', () => {
    setEndpointsMemory({ restBase: 'https://mirror.example', wsBase: DEFAULT_WS_BASE });
    expect(restFetchBase()).toBe('https://mirror.example');
  });
});
