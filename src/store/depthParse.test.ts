/**
 * 回归测试：币安合约 WS 盘口流用 b/a 字段，REST /fapi/v1/depth 用 bids/asks。
 * 曾经只解析 bids/asks，导致 WS 盘口静默变成空数组，市价单永远报「盘口不足，无法市价成交」。
 * 样本取自真实抓包。
 */
import { describe, it, expect } from 'vitest';
import { __parseDepthForTest as parseDepth } from './marketStore';

describe('盘口解析：WS(b/a) 与 REST(bids/asks) 两种字段名', () => {
  it('WS 合约盘口流（b/a）能解析出档位', () => {
    // 真实 depthUpdate 载荷形状
    const msg = {
      e: 'depthUpdate',
      E: 1787406105003,
      s: 'BTCUSDT',
      b: [['77307.50', '1.953'], ['77307.40', '0.500']],
      a: [['77307.60', '4.057'], ['77307.70', '2.100']],
    };
    const book = parseDepth(msg as never);
    expect(book.bids).toHaveLength(2);
    expect(book.asks).toHaveLength(2);
    expect(book.bids[0]).toEqual([77307.5, 1.953]);
    expect(book.asks[0]).toEqual([77307.6, 4.057]);
  });

  it('REST 盘口（bids/asks）同样能解析', () => {
    const msg = {
      lastUpdateId: 11356368132004,
      bids: [['77245.00', '2.000']],
      asks: [['77245.10', '1.200']],
    };
    const book = parseDepth(msg as never);
    expect(book.bids[0]).toEqual([77245, 2]);
    expect(book.asks[0]).toEqual([77245.1, 1.2]);
  });

  it('b/a 优先于 bids/asks（同时存在时取 WS 字段）', () => {
    const msg = {
      b: [['100', '1']],
      a: [['101', '1']],
      bids: [['999', '9']],
      asks: [['998', '9']],
    };
    const book = parseDepth(msg as never);
    expect(book.bids[0]).toEqual([100, 1]);
    expect(book.asks[0]).toEqual([101, 1]);
  });

  it('两种字段都没有时返回空档位而不抛异常', () => {
    const book = parseDepth({} as never);
    expect(book.bids).toEqual([]);
    expect(book.asks).toEqual([]);
  });
});
