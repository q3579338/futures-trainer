/**
 * 加减仓：同向加仓 → 按数量加权算开仓均价；反向下单先平后开。
 * 新均价 = (旧数量 × 旧均价 + 加仓数量 × 成交价) / (旧数量 + 加仓数量)
 */
export function addPositionAvgPrice(
  qty: number,
  entryPrice: number,
  addQty: number,
  addPrice: number,
): number {
  const total = qty + addQty;
  if (total === 0) return 0;
  return (qty * entryPrice + addQty * addPrice) / total;
}

export function realizedPnl(
  side: 'LONG' | 'SHORT',
  qty: number,
  entryPrice: number,
  exitPrice: number,
): number {
  if (side === 'LONG') return (exitPrice - entryPrice) * qty;
  return (entryPrice - exitPrice) * qty;
}

export function initialMargin(qty: number, price: number, leverage: number): number {
  if (leverage <= 0) return qty * price;
  return (qty * price) / leverage;
}
