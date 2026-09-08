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

/**
 * 把 REST 深盘（几百档、两三秒刷一次）接到 WS 前 20 档后面：
 * 只取价格在 WS 覆盖范围之外的档（卖盘更高、买盘更低），保证不会出现交叉或重复档位。
 * WS 为空时直接用深盘；深盘为空时原样返回 WS。
 */
export function mergeDeepBook(
  top: { asks: BookLevel[]; bids: BookLevel[] },
  deep: { asks: BookLevel[]; bids: BookLevel[] } | null | undefined,
  cap = 400,
): { asks: BookLevel[]; bids: BookLevel[] } {
  if (!deep || (deep.asks.length === 0 && deep.bids.length === 0)) return top;
  const asks = top.asks.filter(([p, q]) => p > 0 && q > 0).slice().sort((a, b) => a[0] - b[0]);
  const bids = top.bids.filter(([p, q]) => p > 0 && q > 0).slice().sort((a, b) => b[0] - a[0]);
  const askEdge = asks.length > 0 ? asks[asks.length - 1]![0] : bids.length > 0 ? bids[0]![0] : 0;
  const bidEdge = bids.length > 0 ? bids[bids.length - 1]![0] : asks.length > 0 ? asks[0]![0] : Infinity;
  const extraAsks = deep.asks
    .filter(([p, q]) => p > askEdge && q > 0)
    .sort((a, b) => a[0] - b[0]);
  const extraBids = deep.bids
    .filter(([p, q]) => p < bidEdge && q > 0)
    .sort((a, b) => b[0] - a[0]);
  return {
    asks: [...asks, ...extraAsks].slice(0, cap),
    bids: [...bids, ...extraBids].slice(0, cap),
  };
}
