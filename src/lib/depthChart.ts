import type { BookLevel } from './orderbook';

export interface DepthPoint {
  price: number;
  cum: number;
}

export function cumulativeSide(levels: BookLevel[], side: 'bid' | 'ask'): DepthPoint[] {
  const sorted = levels
    .filter(([p, q]) => p > 0 && q > 0)
    .slice()
    .sort((a, b) => (side === 'bid' ? b[0] - a[0] : a[0] - b[0]));
  const out: DepthPoint[] = [];
  let cum = 0;
  for (const [price, qty] of sorted) {
    cum += qty;
    out.push({ price, cum });
  }
  return out;
}

export function depthChartSeries(
  bids: BookLevel[],
  asks: BookLevel[],
): { bids: DepthPoint[]; asks: DepthPoint[]; maxCum: number } {
  const b = cumulativeSide(bids, 'bid');
  const a = cumulativeSide(asks, 'ask');
  const maxCum = Math.max(b[b.length - 1]?.cum ?? 0, a[a.length - 1]?.cum ?? 0, 0);
  return { bids: b, asks: a, maxCum };
}
