import { depthChartSeries } from '../lib/depthChart';
import type { DepthBook } from '../engine/types';

export default function DepthChartView({ book }: { book: DepthBook }) {
  const { bids, asks, maxCum } = depthChartSeries(book.bids, book.asks);
  const prices = [...bids.map((p) => p.price), ...asks.map((p) => p.price)];
  const minP = prices.length ? Math.min(...prices) : 0;
  const maxP = prices.length ? Math.max(...prices) : 1;
  const span = Math.max(1e-9, maxP - minP);
  const W = 300;
  const H = 160;
  const x = (p: number) => ((p - minP) / span) * W;
  const y = (c: number) => H - (maxCum > 0 ? (c / maxCum) * (H - 8) : 0);

  function path(pts: { price: number; cum: number }[], side: 'bid' | 'ask'): string {
    if (pts.length === 0) return '';
    const ordered = side === 'bid' ? [...pts].sort((a, b) => a.price - b.price) : [...pts].sort((a, b) => a.price - b.price);
    let d = `M ${x(ordered[0]!.price)} ${H}`;
    d += ` L ${x(ordered[0]!.price)} ${y(ordered[0]!.cum)}`;
    for (const p of ordered.slice(1)) d += ` L ${x(p.price)} ${y(p.cum)}`;
    d += ` L ${x(ordered[ordered.length - 1]!.price)} ${H} Z`;
    return d;
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
      <path d={path(bids, 'bid')} fill="rgba(46,189,133,0.28)" stroke="#2EBD85" strokeWidth="1" />
      <path d={path(asks, 'ask')} fill="rgba(246,70,93,0.28)" stroke="#F6465D" strokeWidth="1" />
    </svg>
  );
}
