import type { DepthBook } from '../engine/types';

/**
 * aggTrade 哑、盘口活着时：用买一/卖一中间价当「最新价」。
 * REST ticker 只负责 24h 涨跌幅，不再覆盖最新价。
 */
export function midLastPrice(book: DepthBook | undefined | null): number | null {
  if (!book) return null;
  const bid = book.bids[0]?.[0];
  const ask = book.asks[0]?.[0];
  const bidOk = bid != null && bid > 0;
  const askOk = ask != null && ask > 0;
  if (bidOk && askOk) return (bid + ask) / 2;
  if (bidOk) return bid!;
  if (askOk) return ask!;
  return null;
}

export function shouldDeriveLastFromDepth(aggTradeMuted: boolean): boolean {
  return aggTradeMuted;
}

/** ticker 轮询：aggTrade 哑时返回 null，调用方不得用它覆盖 lastPrice */
export function tickerLastOverride(aggTradeMuted: boolean, tickerLast: number): number | null {
  if (aggTradeMuted) return null;
  if (!(tickerLast > 0)) return null;
  return tickerLast;
}
