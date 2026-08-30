import { ceilToTick, floorToTick } from './tradeUi';

export type BookLevel = [price: number, qty: number];

export interface DisplayLevel {
  price: number;
  qty: number;
  cum: number;
  /** 0~1，深度条宽度 = 该档累计量 / 本侧最大累计量 */
  depth: number;
}

const EMPTY: DisplayLevel = { price: 0, qty: 0, cum: 0, depth: 0 };

function groupSide(levels: BookLevel[], tick: number, side: 'ask' | 'bid'): BookLevel[] {
  const map = new Map<number, number>();
  for (const [p, q] of levels) {
    if (!(p > 0) || !(q > 0)) continue;
    const g = side === 'ask' ? ceilToTick(p, tick) : floorToTick(p, tick);
    map.set(g, (map.get(g) ?? 0) + q);
  }
  const arr = [...map.entries()] as BookLevel[];
  if (side === 'ask') arr.sort((a, b) => a[0] - b[0]);
  else arr.sort((a, b) => b[0] - a[0]);
  return arr;
}

function withDepth(bestFirst: BookLevel[], rows: number): DisplayLevel[] {
  const sliced = bestFirst.slice(0, rows);
  let cum = 0;
  const built: DisplayLevel[] = sliced.map(([price, qty]) => {
    cum += qty;
    return { price, qty, cum, depth: 0 };
  });
  const maxCum = built.length > 0 ? built[built.length - 1]!.cum : 0;
  for (const row of built) {
    row.depth = maxCum > 0 ? row.cum / maxCum : 0;
  }
  while (built.length < rows) built.push({ ...EMPTY });
  return built;
}

/**
 * 卖盘：返回从上到下价格递减（最优卖价在最下面）。
 * 买盘：返回从上到下价格递减（最优买价在最上面）。
 * 深度按「从最优档向外累计量 / 本侧最大累计量」。
 */
export function buildDisplayBook(
  asks: BookLevel[],
  bids: BookLevel[],
  tick: number,
  rows = 7,
): { asks: DisplayLevel[]; bids: DisplayLevel[] } {
  const t = tick > 0 ? tick : 0.1;
  const askBestFirst = groupSide(asks, t, 'ask');
  const bidBestFirst = groupSide(bids, t, 'bid');
  const askRows = withDepth(askBestFirst, rows);
  const bidRows = withDepth(bidBestFirst, rows);
  return {
    asks: [...askRows].reverse(),
    bids: bidRows,
  };
}
