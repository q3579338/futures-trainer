import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createInitialState } from '../engine/engine';
import { BUY_LABEL, SELL_LABEL } from '../lib/tradeUi';
import BottomSheet from './BottomSheet';
import ConfirmOrderSheet, { type ConfirmDraft } from './ConfirmOrderSheet';
import OrderBook from './OrderBook';
import OrderForm from './OrderForm';
import PercentSlider from './PercentSlider';
import TopBar from './TopBar';

const draft: ConfirmDraft = {
  side: 'BUY',
  type: 'LIMIT',
  typeLabel: '限价',
  symbol: 'BTCUSDT',
  qty: 0.012,
  qtyUnit: 'BTC',
  price: 77301.5,
  priceLabel: '77,301.50 USDT',
  margin: 46.39,
  liq: 73748.9,
  fee: 0.46,
  reduceOnly: false,
  pricePrecision: 1,
  qtyPrecision: 3,
};

describe('BottomSheet 渲染', () => {
  it('关闭时不渲染', () => {
    const html = renderToStaticMarkup(
      React.createElement(BottomSheet, { open: false, onClose: () => undefined }, 'x'),
    );
    expect(html).toBe('');
  });

  it('打开时从底部滑出，遮罩半透明，顶部圆角 16px', () => {
    const html = renderToStaticMarkup(
      React.createElement(BottomSheet, { open: true, onClose: () => undefined, title: '确认下单' }, 'body'),
    );
    expect(html).toContain('bg-black/60');
    expect(html).toContain('rounded-t-sheet');
    expect(html).toContain('animate-sheetUp');
    expect(html).toContain('确认下单');
  });
});

describe('确认下单面板', () => {
  it('含开仓理由六选一，回血红色描边，未选中确认按钮置灰', () => {
    const html = renderToStaticMarkup(
      React.createElement(ConfirmOrderSheet, {
        open: true,
        draft,
        onClose: () => undefined,
        onConfirm: () => undefined,
      }),
    );
    expect(html).toContain('这笔为什么开？');
    expect(html).toContain('计划内');
    expect(html).toContain('追涨');
    expect(html).toContain('抄底');
    expect(html).toContain('回血');
    expect(html).toContain('突发消息');
    expect(html).toContain('无聊手痒');
    expect(html).toContain('border-bn-red');
    expect(html).toContain('disabled:bg-bn-input');
    expect(html).toContain(BUY_LABEL);
  });
});

describe('顶栏与按钮文案', () => {
  it('顶栏含永续标签与更多菜单', () => {
    const html = renderToStaticMarkup(
      React.createElement(TopBar, {
        symbol: 'BTCUSDT',
        changePct: -0.15,
        onPickSymbol: () => undefined,
        onKline: () => undefined,
        onMore: () => undefined,
      }),
    );
    expect(html).toContain('BTCUSDT');
    expect(html).toContain('永续');
    expect(html).toContain('U本位');
  });

  it('买卖按钮文案锁定为开多/开空', () => {
    expect(BUY_LABEL).toBe('开多');
    expect(SELL_LABEL).toBe('开空');
  });

  it('下单区渲染开仓/平仓、三胶囊与开多/开空', () => {
    const html = renderToStaticMarkup(
      React.createElement(OrderForm, {
        symbol: 'BTCUSDT',
        state: createInitialState(),
        mark: 80000,
        last: 80000,
        lockNow: Date.now(),
        tapPrice: null,
        tapSeq: 0,
        placedSeq: 0,
        onRequestConfirm: () => undefined,
      }),
    );
    expect(html).toContain('开仓');
    expect(html).toContain('平仓');
    expect(html).toContain('逐仓');
    expect(html).toContain('20x');
    expect(html).toContain('单');
    expect(html).toContain('市价单');
    expect(html).toContain(BUY_LABEL);
    expect(html).toContain(SELL_LABEL);
    expect(html).toContain('看涨');
    expect(html).toContain('看跌');
  });

  it('双向持仓下单按钮为开多/开空', () => {
    const st = createInitialState();
    st.positionMode = 'HEDGE';
    const html = renderToStaticMarkup(
      React.createElement(OrderForm, {
        symbol: 'BTCUSDT',
        state: st,
        mark: 80000,
        last: 80000,
        lockNow: Date.now(),
        tapPrice: null,
        tapSeq: 0,
        placedSeq: 0,
        positionMode: 'HEDGE',
        onRequestConfirm: () => undefined,
      }),
    );
    expect(html).toContain('开多');
    expect(html).toContain('开空');
    expect(html).toContain('双');
  });
});

describe('订单簿', () => {
  it('深度条从右向左，卖盘红色买盘绿色，含中间价区与总额', () => {
    const html = renderToStaticMarkup(
      React.createElement(OrderBook, {
        book: {
          asks: [[101, 1], [102, 2], [103, 3]],
          bids: [[99, 1], [98, 2], [97, 3]],
        },
        last: 100,
        mark: 100.1,
        precision: 1,
        qtyPrecision: 3,
        tickSize: 1,
        symbol: 'BTCUSDT',
        onPickPrice: () => undefined,
      }),
    );
    expect(html).toContain('right-0');
    expect(html).toContain('#FDEDF0');
    expect(html).toContain('#EBF9F4');
    expect(html).toContain('委托价格 (USDT)');
    expect(html).toContain('总额 (USDT)');
    expect(html).toContain('资金费率');
  });
});

describe('百分比滑块', () => {
  it('菱形手柄 + 四个空心圆点 25/50/75/100', () => {
    const html = renderToStaticMarkup(
      React.createElement(PercentSlider, { value: 50, onChange: () => undefined }),
    );
    expect(html).toContain('25%');
    expect(html).toContain('50%');
    expect(html).toContain('75%');
    expect(html).toContain('100%');
    expect(html).toContain('rotate-45');
    expect(html).toContain('rounded-full');
  });
});
