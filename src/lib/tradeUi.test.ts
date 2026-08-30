import { describe, expect, it } from 'vitest';
import { OPEN_REASONS } from '../engine/types';
import {
  BUY_LABEL,
  SELL_LABEL,
  REASON_PILLS,
  allReasonsCovered,
  canOpenQty,
  confirmReady,
  convertQtyOnUnitSwitch,
  directionLabel,
  engineOrderType,
  percentFromQty,
  priceMove,
  priceMoveColor,
  qtyFromPercent,
  reasonLabel,
  tickOptions,
} from './tradeUi';

describe('下单按钮文案', () => {
  it('必须是「开多」「开空」，不是「买入/做多」', () => {
    expect(BUY_LABEL).toBe('开多');
    expect(SELL_LABEL).toBe('开空');
    expect(BUY_LABEL).not.toBe('买入/做多');
    expect(SELL_LABEL).not.toBe('卖出/做空');
  });
});

describe('开仓理由六选一', () => {
  it('六个引擎理由都有对应胶囊，回血用短标签', () => {
    expect(allReasonsCovered()).toBe(true);
    expect(REASON_PILLS).toHaveLength(6);
    expect(REASON_PILLS.map((p) => p.value)).toEqual([...OPEN_REASONS]);
    expect(reasonLabel('回血（刚亏完想赚回来）')).toBe('回血');
    expect(REASON_PILLS.find((p) => p.label === '回血')?.danger).toBe(true);
  });
});

describe('最新价颜色跟上一笔比较', () => {
  it('上涨绿色、下跌红色、持平中性', () => {
    expect(priceMove(101, 100)).toBe('up');
    expect(priceMove(99, 100)).toBe('down');
    expect(priceMove(100, 100)).toBe('flat');
    expect(priceMove(100, 0)).toBe('flat');
    expect(priceMoveColor('up')).toBe('#2EBD85');
    expect(priceMoveColor('down')).toBe('#F6465D');
  });
});

describe('可开与百分比', () => {
  it('可开 = 可用 × 杠杆 / 价格，按 step 向下取整', () => {
    expect(canOpenQty(2000, 20, 80000, 0.001)).toBe(0.5);
  });

  it('百分比滑块换算币量和 USDT', () => {
    expect(qtyFromPercent({ percent: 50, available: 2000, leverage: 20, price: 80000, stepSize: 0.001, unit: 'coin' })).toBe(
      0.25,
    );
    expect(qtyFromPercent({ percent: 100, available: 2000, leverage: 20, price: 80000, stepSize: 0.001, unit: 'usdt' })).toBe(
      40000,
    );
    expect(percentFromQty({ qtyCoin: 0.25, available: 2000, leverage: 20, price: 80000, stepSize: 0.001 })).toBe(50);
  });

  it('BTC/USDT 单位切换按当前价换算', () => {
    expect(convertQtyOnUnitSwitch({ from: 'coin', to: 'usdt', value: 0.01, price: 80000, stepSize: 0.001 })).toBe(800);
    expect(convertQtyOnUnitSwitch({ from: 'usdt', to: 'coin', value: 800, price: 80000, stepSize: 0.001 })).toBe(0.01);
  });
});

describe('委托类型映射', () => {
  it('止盈止损按触发价相对最新价选择 STOP / TAKE_PROFIT', () => {
    expect(engineOrderType('STOP', 'BUY', 81000, 80000)).toBe('STOP_MARKET');
    expect(engineOrderType('STOP', 'BUY', 79000, 80000)).toBe('TAKE_PROFIT_MARKET');
    expect(engineOrderType('STOP', 'SELL', 79000, 80000)).toBe('STOP_MARKET');
    expect(engineOrderType('STOP', 'SELL', 81000, 80000)).toBe('TAKE_PROFIT_MARKET');
    expect(engineOrderType('STOP_LIMIT', 'BUY', 81000, 80000)).toBe('STOP');
    expect(engineOrderType('STOP_LIMIT', 'SELL', 81000, 80000)).toBe('TAKE_PROFIT');
    expect(engineOrderType('TRAILING', 'BUY', 0, 80000)).toBe('TRAILING_STOP_MARKET');
  });

  it('方向文案', () => {
    expect(directionLabel('BUY', false)).toBe('开多');
    expect(directionLabel('SELL', false)).toBe('开空');
    expect(directionLabel('BUY', true)).toBe('平空');
    expect(directionLabel('SELL', true)).toBe('平多');
  });
});

describe('确认下单按钮', () => {
  it('未选理由时不可确认，只减仓不需要理由', () => {
    expect(confirmReady(false, null)).toBe(false);
    expect(confirmReady(false, '计划内')).toBe(true);
    expect(confirmReady(true, null)).toBe(true);
  });
});

describe('档位选项', () => {
  it('从 tickSize 起连续 ×10', () => {
    expect(tickOptions(0.1)).toEqual([0.1, 1, 10, 100, 1000]);
  });
});
