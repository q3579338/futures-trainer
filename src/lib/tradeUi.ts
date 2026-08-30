import type { OpenReason, OrderSide, OrderType } from '../engine/types';
import { OPEN_REASONS } from '../engine/types';
import { floorToStep, roundToStep } from './format';

export const BUY_LABEL = '开多';
export const SELL_LABEL = '开空';
export const BUY_SUB = '看涨';
export const SELL_SUB = '看跌';
export const OPEN_LONG_LABEL = '开多';
export const OPEN_SHORT_LABEL = '开空';
export const CLOSE_LONG_LABEL = '平多';
export const CLOSE_SHORT_LABEL = '平空';

export const REASON_PILLS: { value: OpenReason; label: string; danger: boolean }[] = [
  { value: '计划内', label: '计划内', danger: false },
  { value: '追涨', label: '追涨', danger: false },
  { value: '抄底', label: '抄底', danger: false },
  { value: '回血（刚亏完想赚回来）', label: '回血', danger: true },
  { value: '突发消息', label: '突发消息', danger: false },
  { value: '无聊手痒', label: '无聊手痒', danger: false },
];

export function reasonLabel(reason: OpenReason): string {
  return REASON_PILLS.find((p) => p.value === reason)?.label ?? reason;
}

export function allReasonsCovered(): boolean {
  return OPEN_REASONS.every((r) => REASON_PILLS.some((p) => p.value === r));
}

export type PriceMove = 'up' | 'down' | 'flat';

/** 最新价颜色：与上一笔成交价比较，不是跟涨跌幅。 */
export function priceMove(curr: number, prev: number): PriceMove {
  if (!Number.isFinite(curr) || curr <= 0) return 'flat';
  if (!Number.isFinite(prev) || prev <= 0) return 'flat';
  if (curr > prev) return 'up';
  if (curr < prev) return 'down';
  return 'flat';
}

export function priceMoveColor(move: PriceMove): string {
  if (move === 'up') return '#2EBD85';
  if (move === 'down') return '#F6465D';
  return '#1E2329';
}

export function tickOptions(tickSize: number): number[] {
  const tick = tickSize > 0 ? tickSize : 0.1;
  const opts: number[] = [];
  let t = tick;
  for (let i = 0; i < 5; i++) {
    opts.push(Number(t.toPrecision(12)));
    t *= 10;
  }
  return opts;
}

export function ceilToTick(price: number, tick: number): number {
  if (tick <= 0) return price;
  return roundToStep(Math.ceil(price / tick - 1e-12) * tick, tick);
}

export function floorToTick(price: number, tick: number): number {
  if (tick <= 0) return price;
  return roundToStep(Math.floor(price / tick + 1e-12) * tick, tick);
}

export function coinFromSymbol(symbol: string): string {
  return symbol.replace(/USDT$/i, '') || symbol;
}

export function qtyFromUsdt(usdt: number, price: number, stepSize: number): number {
  if (price <= 0 || usdt <= 0) return 0;
  return floorToStep(usdt / price, stepSize);
}

export function usdtFromQty(qty: number, price: number): number {
  if (price <= 0 || qty <= 0) return 0;
  return qty * price;
}

export function convertQtyOnUnitSwitch(opts: {
  from: 'coin' | 'usdt';
  to: 'coin' | 'usdt';
  value: number;
  price: number;
  stepSize: number;
}): number {
  if (opts.from === opts.to) return opts.value;
  if (opts.price <= 0) return opts.value;
  if (opts.to === 'usdt') return usdtFromQty(opts.value, opts.price);
  return qtyFromUsdt(opts.value, opts.price, opts.stepSize);
}

/** 可开 = 可用 × 杠杆 / 价格 */
export function canOpenQty(available: number, leverage: number, price: number, stepSize: number): number {
  if (available <= 0 || leverage <= 0 || price <= 0) return 0;
  return floorToStep((available * leverage) / price, stepSize);
}

export function qtyFromPercent(opts: {
  percent: number;
  available: number;
  leverage: number;
  price: number;
  stepSize: number;
  unit: 'coin' | 'usdt';
}): number {
  const p = Math.max(0, Math.min(100, opts.percent)) / 100;
  const maxCoin = canOpenQty(opts.available, opts.leverage, opts.price, opts.stepSize);
  if (opts.unit === 'coin') return floorToStep(maxCoin * p, opts.stepSize);
  return floorToStep(opts.available * opts.leverage * p, 0.01);
}

export function percentFromQty(opts: {
  qtyCoin: number;
  available: number;
  leverage: number;
  price: number;
  stepSize: number;
}): number {
  const maxCoin = canOpenQty(opts.available, opts.leverage, opts.price, opts.stepSize);
  if (maxCoin <= 0) return 0;
  return Math.max(0, Math.min(100, (opts.qtyCoin / maxCoin) * 100));
}

export type PanelOrderType = 'LIMIT' | 'MARKET' | 'STOP' | 'STOP_LIMIT' | 'TRAILING';

export const ORDER_TYPE_OPTIONS: { id: PanelOrderType; label: string }[] = [
  { id: 'MARKET', label: '市价单' },
  { id: 'LIMIT', label: '限价单' },
  { id: 'STOP_LIMIT', label: '止盈止损' },
  { id: 'STOP', label: '止盈止损市价' },
  { id: 'TRAILING', label: '追踪委托' },
];

export function engineOrderType(panel: PanelOrderType, side: OrderSide, trigger: number, last: number): OrderType {
  if (panel === 'MARKET') return 'MARKET';
  if (panel === 'LIMIT') return 'LIMIT';
  if (panel === 'TRAILING') return 'TRAILING_STOP_MARKET';
  const stopBuy = trigger >= last;
  const stopSell = trigger <= last;
  if (panel === 'STOP_LIMIT') {
    if (side === 'BUY') return stopBuy ? 'STOP' : 'TAKE_PROFIT';
    return stopSell ? 'STOP' : 'TAKE_PROFIT';
  }
  if (side === 'BUY') return stopBuy ? 'STOP_MARKET' : 'TAKE_PROFIT_MARKET';
  return stopSell ? 'STOP_MARKET' : 'TAKE_PROFIT_MARKET';
}

export function directionLabel(side: OrderSide, reduceOnly: boolean): string {
  if (reduceOnly) return side === 'BUY' ? '平空' : '平多';
  return side === 'BUY' ? '开多' : '开空';
}

export function confirmReady(reduceOnly: boolean, reason: OpenReason | null): boolean {
  return reduceOnly || reason != null;
}

export const INTERVAL_LABELS: Record<string, string> = {
  '1m': '1分',
  '3m': '3分',
  '5m': '5分',
  '15m': '15分',
  '30m': '30分',
  '1h': '1时',
  '2h': '2时',
  '4h': '4时',
  '6h': '6时',
  '12h': '12时',
  '1d': '1日',
  '1w': '1周',
  '1M': '1月',
};

export const ALL_INTERVALS = [
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '6h',
  '12h',
  '1d',
  '1w',
  '1M',
] as const;

export const SLIDER_NODES = [0, 25, 50, 75, 100] as const;
export const CLOSE_PCT_NODES = [25, 50, 75, 100] as const;
export const LEV_TICKS = [1, 25, 50, 75, 125] as const;
