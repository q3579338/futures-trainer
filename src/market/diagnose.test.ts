import { describe, expect, it } from 'vitest';
import {
  ALL_STREAMS_OK_HINT,
  DIAGNOSE_STREAMS,
  PARTIAL_MUTE_HINT,
  REST_FAIL_HINT,
  WS_FAIL_HINT,
  diagnoseConnection,
  streamLine,
  streamShortName,
  summarize,
} from './diagnose';

class FakeWS {
  static mode: 'open' | 'error' | 'hang' = 'open';
  static lastUrl = '';
  static messages: Array<{ stream: string; data: unknown }> = [];
  onopen: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  constructor(url: string) {
    FakeWS.lastUrl = url;
    if (FakeWS.mode === 'open') {
      queueMicrotask(() => {
        this.onopen?.({});
        for (const m of FakeWS.messages) {
          this.onmessage?.({ data: JSON.stringify(m) });
        }
      });
    } else if (FakeWS.mode === 'error') {
      queueMicrotask(() => this.onerror?.({}));
    }
  }
  close(): void {
    /* noop */
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function depthBurst(n: number): Array<{ stream: string; data: unknown }> {
  return Array.from({ length: n }, () => ({
    stream: 'btcusdt@depth20@100ms',
    data: { lastUpdateId: 1, bids: [['1', '1']], asks: [['2', '1']] },
  }));
}

describe('连接诊断（逐条子流 + REST 直连）', () => {
  it('REST 直连打 fapi.binance.com/fapi/v1/time，不走相对 /fapi', async () => {
    FakeWS.mode = 'open';
    FakeWS.messages = depthBurst(1);
    let restUrl = '';
    await diagnoseConnection({
      restBase: 'https://fapi.binance.com',
      wsBase: 'wss://fstream.binance.com',
      timeoutMs: 200,
      windowMs: 30,
      fetchImpl: async (url) => {
        restUrl = String(url);
        return jsonResponse({ serverTime: 1_700_000_000_000 });
      },
      WebSocketImpl: FakeWS,
    });
    expect(restUrl).toBe('https://fapi.binance.com/fapi/v1/time');
    expect(restUrl.startsWith('/')).toBe(false);
  });

  it('组合流 12s 窗口按子流计数：depth 有数据、其余 0 → 混合结论', async () => {
    FakeWS.mode = 'open';
    FakeWS.messages = depthBurst(108);
    const seen: string[] = [];
    const report = await diagnoseConnection({
      restBase: 'https://fapi.binance.com',
      wsBase: 'wss://fstream.binance.com',
      timeoutMs: 200,
      windowMs: 30,
      fetchImpl: async () => jsonResponse({ serverTime: 1 }),
      WebSocketImpl: FakeWS,
      onItem: (item) => seen.push(item.id),
    });
    expect(FakeWS.lastUrl).toContain('btcusdt@markPrice@1s');
    expect(FakeWS.lastUrl).toContain('btcusdt@depth20@100ms');
    expect(FakeWS.lastUrl).toContain('btcusdt@aggTrade');
    expect(FakeWS.lastUrl).toContain('btcusdt@kline_1m');

    const byId = Object.fromEntries(report.items.map((it) => [it.id, it]));
    expect(byId['rest']).toMatchObject({ ok: true, name: 'REST 直连' });
    expect(byId['ws']?.ok).toBe(true);
    expect(byId['stream:depth20@100ms']).toMatchObject({ ok: true, detail: '108 条' });
    expect(byId['stream:markPrice@1s']).toMatchObject({ ok: false, detail: '0 条' });
    expect(byId['stream:aggTrade']).toMatchObject({ ok: false, detail: '0 条' });
    expect(byId['stream:kline_1m']).toMatchObject({ ok: false, detail: '0 条' });
    expect(report.summary).toContain(PARTIAL_MUTE_HINT);
    expect(report.summary).toContain('markPrice@1s');
    expect(report.summary).toContain('depth20@100ms');
    expect(seen[0]).toBe('rest');
    expect(seen).toContain('stream:markPrice@1s');
  });

  it('全部子流都有消息 → 全部正常文案', async () => {
    FakeWS.mode = 'open';
    FakeWS.messages = DIAGNOSE_STREAMS.map((stream) => ({ stream, data: { ok: true } }));
    const report = await diagnoseConnection({
      restBase: 'https://fapi.binance.com',
      timeoutMs: 200,
      windowMs: 30,
      fetchImpl: async () => jsonResponse({ serverTime: 2 }),
      WebSocketImpl: FakeWS,
    });
    const streams = report.items.filter((it) => it.id.startsWith('stream:'));
    expect(streams.every((s) => s.ok && s.detail === '1 条')).toBe(true);
    expect(report.summary).toContain(ALL_STREAMS_OK_HINT);
  });

  it('WS 握手失败：子流全 0 + DNS/代理文案，不装通过', async () => {
    FakeWS.mode = 'error';
    FakeWS.messages = [];
    const report = await diagnoseConnection({
      restBase: 'https://fapi.binance.com',
      timeoutMs: 200,
      windowMs: 30,
      fetchImpl: async () => jsonResponse({ serverTime: 1 }),
      WebSocketImpl: FakeWS,
    });
    expect(report.items.find((it) => it.id === 'ws')?.ok).toBe(false);
    expect(report.items.filter((it) => it.id.startsWith('stream:')).every((it) => it.detail === '0 条')).toBe(
      true,
    );
    expect(report.summary).toBe(WS_FAIL_HINT);
  });

  it('WS 握手超时计为失败', async () => {
    FakeWS.mode = 'hang';
    const report = await diagnoseConnection({
      restBase: 'https://fapi.binance.com',
      timeoutMs: 40,
      windowMs: 200,
      fetchImpl: async () => jsonResponse({ serverTime: 2 }),
      WebSocketImpl: FakeWS,
    });
    expect(report.items.find((it) => it.id === 'ws')?.ok).toBe(false);
    expect(report.items.find((it) => it.id === 'ws')?.detail).toContain('超时');
  });

  it('REST HTTP 错误为失败', async () => {
    FakeWS.mode = 'open';
    FakeWS.messages = depthBurst(1);
    const report = await diagnoseConnection({
      restBase: 'https://example.invalid',
      timeoutMs: 200,
      windowMs: 30,
      fetchImpl: async () => jsonResponse({ msg: 'no' }, 502),
      WebSocketImpl: FakeWS,
    });
    expect(report.items[0]!.ok).toBe(false);
    expect(report.items[0]!.detail).toContain('502');
    expect(report.summary).toContain('REST 直连不可用');
  });

  it('streamLine / summarize 文案', () => {
    expect(streamShortName('btcusdt@markPrice@1s')).toBe('markPrice@1s');
    expect(streamLine('markPrice@1s', 0)).toBe('markPrice@1s：0 条 ❌');
    expect(streamLine('depth20@100ms', 108)).toBe('depth20@100ms：108 条 ✅');
    expect(
      summarize({
        restOk: true,
        wsOpen: true,
        streams: DIAGNOSE_STREAMS.map((s) => ({ name: streamShortName(s), count: 1 })),
      }),
    ).toContain(ALL_STREAMS_OK_HINT);
    expect(
      summarize({
        restOk: true,
        wsOpen: false,
        streams: DIAGNOSE_STREAMS.map((s) => ({ name: streamShortName(s), count: 0 })),
      }),
    ).toBe(WS_FAIL_HINT);
    expect(
      summarize({
        restOk: false,
        wsOpen: false,
        streams: [],
      }),
    ).toContain(REST_FAIL_HINT);
  });
});
