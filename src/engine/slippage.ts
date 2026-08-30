/**
 * 市价单用 depth20 逐档吃单模拟滑点，累积算加权成交均价。
 * 深度不足时用最后一档外推并标注「滑点严重」。
 */
import type { DepthBook, EatResult, OrderSide } from './types';

export function eatBook(side: OrderSide, qty: number, book: DepthBook | undefined): EatResult {
  if (!book || qty <= 0) {
    return { avgPrice: 0, filledQty: 0, notional: 0, severeSlippage: false, levelsUsed: 0 };
  }
  // 买单吃卖盘（asks 升序），卖单吃买盘（bids 降序）
  const levels = side === 'BUY' ? [...book.asks] : [...book.bids];
  if (side === 'BUY') levels.sort((a, b) => a[0] - b[0]);
  else levels.sort((a, b) => b[0] - a[0]);

  let remain = qty;
  let notional = 0;
  let levelsUsed = 0;
  let lastPrice = 0;

  for (const [price, avail] of levels) {
    if (remain <= 0) break;
    if (price <= 0 || avail <= 0) continue;
    const take = Math.min(remain, avail);
    notional += take * price;
    remain -= take;
    lastPrice = price;
    levelsUsed += 1;
  }

  let severeSlippage = false;
  if (remain > 0) {
    if (lastPrice > 0) {
      notional += remain * lastPrice;
      remain = 0;
      severeSlippage = true;
    } else {
      return { avgPrice: 0, filledQty: 0, notional: 0, severeSlippage: true, levelsUsed: 0 };
    }
  }

  const filledQty = qty - remain;
  const avgPrice = filledQty > 0 ? notional / filledQty : 0;
  return { avgPrice, filledQty, notional, severeSlippage, levelsUsed };
}

/** 限价单吃单：只吃优于或等于限价的档位，不外推 */
export function eatBookToLimit(
  side: OrderSide,
  qty: number,
  limitPrice: number,
  book: DepthBook | undefined,
): EatResult {
  if (!book || qty <= 0) {
    return { avgPrice: 0, filledQty: 0, notional: 0, severeSlippage: false, levelsUsed: 0 };
  }
  const levels = side === 'BUY' ? [...book.asks] : [...book.bids];
  if (side === 'BUY') levels.sort((a, b) => a[0] - b[0]);
  else levels.sort((a, b) => b[0] - a[0]);

  let remain = qty;
  let notional = 0;
  let levelsUsed = 0;
  for (const [price, avail] of levels) {
    if (remain <= 0) break;
    if (side === 'BUY' && price > limitPrice) break;
    if (side === 'SELL' && price < limitPrice) break;
    if (price <= 0 || avail <= 0) continue;
    const take = Math.min(remain, avail);
    notional += take * price;
    remain -= take;
    levelsUsed += 1;
  }
  const filledQty = qty - remain;
  const avgPrice = filledQty > 0 ? notional / filledQty : 0;
  return { avgPrice, filledQty, notional, severeSlippage: false, levelsUsed };
}
