import type { Order, OrderType } from './types';

export function isLimitConditional(type: OrderType): boolean {
  return type === 'STOP' || type === 'TAKE_PROFIT';
}

export function isMarketConditional(type: OrderType): boolean {
  return type === 'STOP_MARKET' || type === 'TAKE_PROFIT_MARKET';
}

/**
 * 四类条件单触发（币安规则）：
 * STOP / STOP_MARKET：买入 px≥触发价，卖出 px≤触发价
 * TAKE_PROFIT / TAKE_PROFIT_MARKET：买入 px≤触发价，卖出 px≥触发价
 */
export function isConditionalTriggered(order: Order, px: number): boolean {
  const sp = order.stopPrice ?? 0;
  if (!(px > 0) || !(sp > 0)) return false;
  const t = order.type;
  if (t === 'STOP' || t === 'STOP_MARKET') {
    return order.side === 'BUY' ? px >= sp : px <= sp;
  }
  if (t === 'TAKE_PROFIT' || t === 'TAKE_PROFIT_MARKET') {
    return order.side === 'BUY' ? px <= sp : px >= sp;
  }
  return false;
}
