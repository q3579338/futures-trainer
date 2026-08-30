import { useEffect, useRef, useState } from 'react';
import { fmtCompact, fmtCountdown, fmtPrice, fmtTime } from '../lib/format';
import { fundingIntervalLabel } from '../lib/fundingInterval';
import { buildDisplayBook, type DisplayLevel } from '../lib/orderbook';
import { priceMove, priceMoveColor, tickOptions } from '../lib/tradeUi';
import type { DepthBook } from '../engine/types';
import type { RecentTrade } from '../store/marketStore';
import DashLabel from './DashLabel';
import DepthChartView from './DepthChartView';

type BookView = 'all' | 'bid' | 'ask' | 'depth' | 'trades';

export default function OrderBook({
  book,
  last,
  mark,
  precision,
  qtyPrecision,
  tickSize,
  symbol,
  recentTrades,
  fundingRate = 0,
  nextFundingTime = 0,
  fundingIntervalHours = 8,
  now = Date.now(),
  onPickPrice,
}: {
  book: DepthBook;
  last: number;
  mark: number;
  precision: number;
  qtyPrecision: number;
  tickSize: number;
  symbol: string;
  recentTrades?: RecentTrade[];
  fundingRate?: number;
  nextFundingTime?: number;
  fundingIntervalHours?: number;
  now?: number;
  onPickPrice: (price: number) => void;
}) {
  const [tick, setTick] = useState(tickSize > 0 ? tickSize : 0.1);
  const [tickOpen, setTickOpen] = useState(false);
  const [view, setView] = useState<BookView>('all');
  const prevLast = useRef(0);
  const [move, setMove] = useState<'up' | 'down' | 'flat'>('flat');
  const opts = tickOptions(tickSize > 0 ? tickSize : 0.1);
  void symbol;

  useEffect(() => {
    if (tickSize > 0 && !opts.includes(tick)) setTick(tickSize);
  }, [tickSize, tick, opts]);

  useEffect(() => {
    if (last > 0) {
      setMove(priceMove(last, prevLast.current));
      prevLast.current = last;
    }
  }, [last]);

  const rows = view === 'bid' || view === 'ask' ? 12 : 6;
  const { asks, bids } = buildDisplayBook(book.asks, book.bids, tick, rows);
  const color = priceMoveColor(move);
  const showAsks = view === 'all' || view === 'ask';
  const showBids = view === 'all' || view === 'bid';
  const askNotional = asks.reduce((s, r) => s + r.price * r.qty, 0);
  const bidNotional = bids.reduce((s, r) => s + r.price * r.qty, 0);
  const tot = askNotional + bidNotional;
  const bidPct = tot > 0 ? (bidNotional / tot) * 100 : 50;
  const askPct = 100 - bidPct;
  const ratePct = fundingRate * 100;
  const rateCls = ratePct < 0 ? 'text-bn-green' : ratePct > 0 ? 'text-bn-red' : 'text-bn-muted';
  const hours = fundingIntervalHours > 0 ? fundingIntervalHours : 8;

  function cycleView() {
    setView((v) => {
      if (v === 'all') return 'bid';
      if (v === 'bid') return 'ask';
      if (v === 'ask') return 'depth';
      if (v === 'depth') return 'trades';
      return 'all';
    });
  }

  return (
    <div className="flex h-full flex-col px-1 pt-1 text-[10px]">
      <div className="mb-1 px-0.5 text-right">
        <DashLabel className="text-[11px]">资金费率 ({fundingIntervalLabel(hours)})/倒计时</DashLabel>
        <div className={`mt-0.5 text-[13px] tn ${rateCls}`}>
          {ratePct.toFixed(5)}%/{fmtCountdown(Math.max(0, nextFundingTime - now))}
        </div>
      </div>
      <div className="mb-0.5 flex justify-between px-0.5 text-bn-muted">
        <span>委托价格 (USDT)</span>
        <span>总额 (USDT)</span>
      </div>
      {view === 'depth' ? (
        <div className="min-h-0">
          <DepthChartView book={book} />
        </div>
      ) : view === 'trades' ? (
        <div className="min-h-0 overflow-y-auto no-scrollbar">
          {(recentTrades ?? []).length === 0 && <div className="py-6 text-center text-bn-muted">暂无成交</div>}
          {[...(recentTrades ?? [])].reverse().map((t, i) => (
            <button
              key={`${t.time}-${i}`}
              type="button"
              onClick={() => onPickPrice(t.price)}
              className="flex h-[18px] w-full items-center px-0.5 tn"
            >
              <span className={`text-[12px] ${t.isBuyerMaker ? 'text-bn-red' : 'text-bn-green'}`}>
                {fmtPrice(t.price, precision)}
              </span>
              <span className="ml-auto text-[11px] text-bn-muted">{t.qty.toFixed(Math.min(qtyPrecision, 4))}</span>
              <span className="ml-1 w-10 text-right text-[10px] text-bn-muted">
                {fmtTime(t.time).slice(11, 19)}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <>
          {showAsks && (
            <div className="flex flex-col">
              {asks.map((row, i) => (
                <BookRow key={`a${i}`} row={row} precision={precision} ask onPick={onPickPrice} />
              ))}
            </div>
          )}
          <div className="flex h-10 flex-col justify-center px-0.5">
            <div className="flex items-center text-[22px] font-bold leading-none tn" style={{ color }}>
              <span>{last > 0 ? fmtPrice(last, precision) : '—'}</span>
            </div>
            <div className="mt-0.5 text-[13px] text-bn-muted tn">{mark > 0 ? fmtPrice(mark, precision) : '—'}</div>
          </div>
          {showBids && (
            <div className="flex flex-col">
              {bids.map((row, i) => (
                <BookRow key={`b${i}`} row={row} precision={precision} ask={false} onPick={onPickPrice} />
              ))}
            </div>
          )}
          {view === 'all' && (
            <div className="mt-1 flex items-center gap-1 px-0.5 text-[11px]">
              <span className="tn text-bn-green">{bidPct.toFixed(2)}%</span>
              <div className="flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-sm">
                <div className="h-full bg-bn-green" style={{ width: `${bidPct}%` }} />
                <div className="h-full bg-bn-red" style={{ width: `${askPct}%` }} />
              </div>
              <span className="tn text-bn-red">{askPct.toFixed(2)}%</span>
            </div>
          )}
        </>
      )}
      <div className="relative flex items-center justify-between py-1">
        <button
          type="button"
          onClick={() => setTickOpen((v) => !v)}
          className="rounded bg-bn-input px-1.5 py-0.5 text-[11px] text-bn-text"
        >
          {tick} ▼
        </button>
        {tickOpen && (
          <div className="absolute bottom-7 left-0 z-10 overflow-hidden rounded border border-bn-line bg-white shadow">
            {opts.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTick(t);
                  setTickOpen(false);
                }}
                className={`block w-full px-3 py-1.5 text-left text-[12px] ${t === tick ? 'text-bn-yellow' : 'text-bn-text'}`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
        <button type="button" onClick={cycleView} className="flex items-center gap-0.5" aria-label="显示方式">
          <span className="h-3 w-3 bg-bn-red" />
          <span className="h-3 w-3 bg-bn-green" />
        </button>
      </div>
    </div>
  );
}

function BookRow({
  row,
  precision,
  ask,
  onPick,
}: {
  row: DisplayLevel;
  precision: number;
  ask: boolean;
  onPick: (p: number) => void;
}) {
  const empty = row.price <= 0;
  const notional = row.price * row.qty;
  return (
    <button
      type="button"
      disabled={empty}
      onClick={() => onPick(row.price)}
      className="relative flex h-[18px] w-full items-center px-0.5 tn"
    >
      <span
        className="absolute inset-y-0 right-0"
        style={{
          width: `${row.depth * 100}%`,
          background: ask ? '#FDEDF0' : '#EBF9F4',
        }}
      />
      <span className={`relative text-[14px] ${ask ? 'text-bn-red' : 'text-bn-green'}`}>
        {empty ? '' : fmtPrice(row.price, precision)}
      </span>
      <span className="relative ml-auto text-right text-[14px] text-bn-text">
        {empty ? '' : fmtCompact(notional)}
      </span>
    </button>
  );
}
