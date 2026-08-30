import { describe, expect, it } from 'vitest';
import {
  STREAM_SILENCE_MS,
  applyWsDown,
  applyWsOpen,
  applyWsStreamMessage,
  createHybridState,
  enabledPollKinds,
  evaluateSilence,
  hasValidMarkPrice,
  muteKinds,
  statusBarText,
  statusBarTone,
  streamKindFromName,
  transportOf,
} from './fallback';

describe('子流哑判定阈值', () => {
  it('各流静默阈值：markPrice 5s / depth 3s / aggTrade 10s / kline 90s', () => {
    expect(STREAM_SILENCE_MS.markPrice).toBe(5_000);
    expect(STREAM_SILENCE_MS.depth).toBe(3_000);
    expect(STREAM_SILENCE_MS.aggTrade).toBe(10_000);
    expect(STREAM_SILENCE_MS.kline).toBe(90_000);
  });

  it('从未收到的流：到达阈值才算哑，未到阈值仍走 WS', () => {
    let s = applyWsOpen(createHybridState(0), 0);
    s = evaluateSilence(s, STREAM_SILENCE_MS.markPrice - 1);
    expect(s.streams.markPrice.source).toBe('ws');

    s = evaluateSilence(s, STREAM_SILENCE_MS.markPrice);
    expect(s.streams.markPrice.source).toBe('poll');
    expect(muteKinds(s)).toContain('markPrice');
  });

  it('depth 3s 哑、aggTrade 10s 哑、kline 90s 哑', () => {
    let s = applyWsOpen(createHybridState(0), 0);
    s = evaluateSilence(s, 3_000);
    expect(s.streams.depth.source).toBe('poll');
    expect(s.streams.aggTrade.source).toBe('ws');
    expect(s.streams.kline.source).toBe('ws');

    s = evaluateSilence(s, 10_000);
    expect(s.streams.aggTrade.source).toBe('poll');
    expect(s.streams.kline.source).toBe('ws');

    s = evaluateSilence(s, 90_000);
    expect(s.streams.kline.source).toBe('poll');
    expect(transportOf(s)).toBe('polling');
  });

  it('depth 一直在推不会把 markPrice 当活：12s 后 markPrice/aggTrade 哑、kline 仍等', () => {
    let s = applyWsOpen(createHybridState(0), 0);
    s = applyWsStreamMessage(s, 'depth', 100);
    s = applyWsStreamMessage(s, 'depth', 11_900);
    s = evaluateSilence(s, 12_000);
    expect(s.streams.depth.source).toBe('ws');
    expect(s.streams.markPrice.source).toBe('poll');
    expect(s.streams.aggTrade.source).toBe('poll');
    expect(s.streams.kline.source).toBe('ws');
    expect(transportOf(s)).toBe('hybrid');
    expect(enabledPollKinds(s).sort()).toEqual(['premiumIndex', 'ticker24h'].sort());
  });
});

describe('混合模式进入与退出', () => {
  it('部分子流哑 → hybrid；只对哑流派发轮询 kind', () => {
    let s = applyWsOpen(createHybridState(0), 0);
    s = applyWsStreamMessage(s, 'depth', 11_900);
    s = evaluateSilence(s, 12_000);
    expect(transportOf(s)).toBe('hybrid');
    expect(muteKinds(s)).toEqual(['markPrice', 'aggTrade']);
    expect(enabledPollKinds(s)).toEqual(['premiumIndex', 'ticker24h']);
  });

  it('四条子流全哑 → polling', () => {
    let s = applyWsOpen(createHybridState(0), 0);
    s = evaluateSilence(s, 90_000);
    expect(transportOf(s)).toBe('polling');
    expect(enabledPollKinds(s).sort()).toEqual(['depth', 'klines', 'premiumIndex', 'ticker24h'].sort());
  });

  it('全部子流都在推 → ws，不派发任何轮询', () => {
    let s = applyWsOpen(createHybridState(0), 0);
    s = applyWsStreamMessage(s, 'markPrice', 1_000);
    s = applyWsStreamMessage(s, 'aggTrade', 1_000);
    s = applyWsStreamMessage(s, 'depth', 1_000);
    s = applyWsStreamMessage(s, 'kline', 1_000);
    s = evaluateSilence(s, 2_000);
    expect(transportOf(s)).toBe('ws');
    expect(enabledPollKinds(s)).toEqual([]);
  });

  it('某条流恢复推送后切回 WS 并停掉对应轮询', () => {
    let s = applyWsOpen(createHybridState(0), 0);
    s = applyWsStreamMessage(s, 'depth', 11_900);
    s = evaluateSilence(s, 12_000);
    expect(enabledPollKinds(s)).toContain('premiumIndex');
    expect(s.streams.markPrice.source).toBe('poll');

    s = applyWsStreamMessage(s, 'markPrice', 12_500);
    expect(s.streams.markPrice.source).toBe('ws');
    expect(enabledPollKinds(s)).not.toContain('premiumIndex');
    expect(enabledPollKinds(s)).toEqual(['ticker24h']);
    expect(transportOf(s)).toBe('hybrid');

    s = applyWsStreamMessage(s, 'aggTrade', 12_600);
    expect(enabledPollKinds(s)).toEqual([]);
    expect(transportOf(s)).toBe('ws');
  });

  it('WS 断开不把已恢复的判定改回；静默超时后才哑', () => {
    let s = applyWsOpen(createHybridState(0), 0);
    s = applyWsStreamMessage(s, 'markPrice', 1_000);
    s = applyWsDown(s);
    expect(s.wsOpen).toBe(false);
    expect(s.streams.markPrice.source).toBe('ws');
    s = evaluateSilence(s, 1_000 + STREAM_SILENCE_MS.markPrice);
    expect(s.streams.markPrice.source).toBe('poll');
  });

  it('重连 open 不把已哑的流假装成 WS，要等真正收到该流', () => {
    let s = applyWsOpen(createHybridState(0), 0);
    s = evaluateSilence(s, 12_000);
    expect(s.streams.markPrice.source).toBe('poll');
    s = applyWsOpen(s, 20_000);
    expect(s.streams.markPrice.source).toBe('poll');
    expect(s.wsOpen).toBe(true);
    s = applyWsStreamMessage(s, 'markPrice', 20_100);
    expect(s.streams.markPrice.source).toBe('ws');
  });
});

describe('状态栏文案映射', () => {
  it('全部子流正常且有标记价 → 实时 · {延迟}ms，绝不写「已连接」', () => {
    const text = statusBarText({
      transport: 'ws',
      mute: [],
      latencyMs: 42.8,
      hasMarkPrice: true,
      wsOpen: true,
    });
    expect(text).toBe('实时 · 43ms');
    expect(text).not.toContain('已连接');
    expect(statusBarTone({ transport: 'ws', hasMarkPrice: true })).toBe('live');
  });

  it('部分子流走轮询 → 混合模式并列哑流名', () => {
    expect(
      statusBarText({
        transport: 'hybrid',
        mute: ['markPrice'],
        latencyMs: 0,
        hasMarkPrice: true,
        wsOpen: true,
      }),
    ).toBe('混合模式 · 标记价轮询');
    expect(
      statusBarText({
        transport: 'hybrid',
        mute: ['markPrice', 'aggTrade'],
        latencyMs: 0,
        hasMarkPrice: true,
        wsOpen: true,
      }),
    ).toBe('混合模式 · 标记价轮询 · 成交轮询');
    expect(statusBarTone({ transport: 'hybrid', hasMarkPrice: true })).toBe('hybrid');
  });

  it('全部走轮询 → 轮询模式 · 1s', () => {
    expect(
      statusBarText({
        transport: 'polling',
        mute: ['markPrice', 'aggTrade', 'depth', 'kline'],
        latencyMs: 0,
        hasMarkPrice: true,
        wsOpen: false,
      }),
    ).toBe('轮询模式 · 1s');
  });

  it('markPrice 还没有有效值时不显示已连接/实时', () => {
    expect(
      statusBarText({
        transport: 'ws',
        mute: [],
        latencyMs: 0,
        hasMarkPrice: false,
        wsOpen: true,
      }),
    ).toBe('等待标记价');
    expect(
      statusBarText({
        transport: 'ws',
        mute: [],
        latencyMs: 0,
        hasMarkPrice: false,
        wsOpen: false,
      }),
    ).toBe('重连中');
    expect(hasValidMarkPrice(0)).toBe(false);
    expect(hasValidMarkPrice(77_253)).toBe(true);
  });
});

describe('streamKindFromName', () => {
  it('从组合流名解析子流 kind', () => {
    expect(streamKindFromName('btcusdt@markPrice@1s')).toBe('markPrice');
    expect(streamKindFromName('BTCUSDT@aggTrade')).toBe('aggTrade');
    expect(streamKindFromName('btcusdt@depth20@100ms')).toBe('depth');
    expect(streamKindFromName('btcusdt@kline_1m')).toBe('kline');
    expect(streamKindFromName('btcusdt@forceOrder')).toBeNull();
  });
});
