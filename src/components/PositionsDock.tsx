import { useMemo, useState } from 'react';
import { ledgerRows } from '../engine/history';
import type { EngineState, LedgerKind, Order, Position, TradeRecord } from '../engine/types';
import { downloadCsv, toCsv } from '../lib/csv';
import { fmtNum, fmtPnl, fmtTime, pnlClass } from '../lib/format';
import KlineChart from './KlineChart';
import type { Kline } from '../market/rest';
import PositionCard from './PositionCard';

type DockTab = 'pos' | 'open' | 'robot';
type HistTab = 'history' | 'fills' | 'ledger' | null;
type SortKey = 'pnl' | 'margin' | 'symbol';

export default function PositionsDock({
  state,
  marks,
  filters,
  currentSymbol,
  klines,
  onCancel,
  onAmend,
  onTpsl,
  onClosePos,
  onLeverage,
  onCloseAll,
}: {
  state: EngineState;
  marks: Record<string, number>;
  filters: Record<string, { pricePrecision: number; quantityPrecision: number } | undefined>;
  currentSymbol: string;
  klines?: Kline[];
  onCancel: (id: string) => void;
  onAmend: (o: Order) => void;
  onTpsl: (p: Position) => void;
  onClosePos: (p: Position) => void;
  onLeverage: (p: Position) => void;
  onReverse?: (p: Position) => void;
  onMargin?: (p: Position) => void;
  onCloseAll: () => void;
}) {
  const [tab, setTab] = useState<DockTab>('pos');
  const [hist, setHist] = useState<HistTab>(null);
  const [histFilter, setHistFilter] = useState<'ALL' | Order['status']>('ALL');
  const [ledgerKind, setLedgerKind] = useState<LedgerKind | 'ALL'>('ALL');
  const [hideOther, setHideOther] = useState(false);
  const [sort, setSort] = useState<SortKey>('pnl');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [kOpen, setKOpen] = useState(false);
  const [realizedPos, setRealizedPos] = useState<Position | null>(null);

  const openOrders = state.orders.filter((o) => o.status === 'NEW');
  const histOrders = (state.orderHistory ?? []).filter((o) => o.status !== 'NEW');
  const fills = state.trades.filter((t) => t.type === 'OPEN' || t.type === 'CLOSE' || t.type === 'LIQUIDATION');
  const shownHist = histFilter === 'ALL' ? histOrders : histOrders.filter((o) => o.status === histFilter);
  const ledger = useMemo(
    () => ledgerRows(state.trades, ledgerKind === 'ALL' ? undefined : ledgerKind),
    [state.trades, ledgerKind],
  );

  const positions = useMemo(() => {
    let list = hideOther ? state.positions.filter((p) => p.symbol === currentSymbol) : state.positions.slice();
    list.sort((a, b) => {
      const ma = marks[a.symbol] ?? a.entryPrice;
      const mb = marks[b.symbol] ?? b.entryPrice;
      const pa = (ma - a.entryPrice) * a.qty * (a.side === 'LONG' ? 1 : -1);
      const pb = (mb - b.entryPrice) * b.qty * (b.side === 'LONG' ? 1 : -1);
      if (sort === 'pnl') return (pa - pb) * sortDir;
      if (sort === 'margin') return (a.isolatedWallet - b.isolatedWallet) * sortDir;
      return a.symbol.localeCompare(b.symbol) * sortDir;
    });
    return list;
  }, [state.positions, hideOther, currentSymbol, marks, sort, sortDir]);

  function exportCurrent() {
    if (hist === 'history') {
      downloadCsv(
        'order-history.csv',
        toCsv(
          ['id', 'symbol', 'side', 'type', 'qty', 'price', 'status', 'time'],
          shownHist.map((o) => [o.id, o.symbol, o.side, o.type, o.qty, o.price ?? '', o.status, fmtTime(o.createdAt)]),
        ),
      );
    } else if (hist === 'fills') {
      downloadCsv(
        'trades.csv',
        toCsv(
          ['id', 'symbol', 'side', 'qty', 'price', 'fee', 'role', 'pnl', 'time'],
          fills.map((t) => [t.id, t.symbol, t.side, t.qty, t.price, t.fee, t.isMaker ? 'maker' : 'taker', t.realizedPnl, fmtTime(t.time)]),
        ),
      );
    } else if (hist === 'ledger') {
      downloadCsv(
        'ledger.csv',
        toCsv(
          ['time', 'kind', 'symbol', 'amount', 'note'],
          ledger.map((r) => [fmtTime(r.time), r.kind, r.symbol, r.amount, r.note]),
        ),
      );
    } else if (tab === 'open') {
      downloadCsv(
        'open-orders.csv',
        toCsv(
          ['id', 'symbol', 'side', 'type', 'qty', 'price', 'status', 'time'],
          openOrders.map((o) => [o.id, o.symbol, o.side, o.type, o.qty, o.price ?? '', o.status, fmtTime(o.createdAt)]),
        ),
      );
    }
  }

  const view = hist ?? tab;

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-bn-line">
      <div className="flex shrink-0 items-center gap-3 overflow-x-auto px-3 no-scrollbar">
        <TabBtn id="pos" tab={tab} hist={hist} on={() => { setHist(null); setTab('pos'); }} label={`持有仓位 (${state.positions.length})`} />
        <TabBtn id="open" tab={tab} hist={hist} on={() => { setHist(null); setTab('open'); }} label={`当前委托 (${openOrders.length})`} />
        <span className="shrink-0 py-2 text-[13px] text-bn-hint">交易机器人</span>
        <button
          type="button"
          onClick={() => setHist((h) => (h ? null : 'history'))}
          className="ml-auto shrink-0 py-2 text-[13px] text-bn-muted"
          aria-label="历史记录"
        >
          🕘
        </button>
      </div>

      {hist && (
        <div className="flex items-center gap-3 px-3 text-[12px]">
          <button type="button" className={hist === 'history' ? 'text-bn-text' : 'text-bn-muted'} onClick={() => setHist('history')}>
            历史委托
          </button>
          <button type="button" className={hist === 'fills' ? 'text-bn-text' : 'text-bn-muted'} onClick={() => setHist('fills')}>
            成交
          </button>
          <button type="button" className={hist === 'ledger' ? 'text-bn-text' : 'text-bn-muted'} onClick={() => setHist('ledger')}>
            资金流水
          </button>
          <button type="button" onClick={exportCurrent} className="ml-auto py-1 text-[12px] text-bn-yellow">
            导出CSV
          </button>
        </div>
      )}

      {tab === 'open' && !hist && (
        <div className="flex justify-end px-3">
          <button type="button" onClick={exportCurrent} className="py-1 text-[12px] text-bn-yellow">
            导出CSV
          </button>
        </div>
      )}

      {view === 'pos' && (
        <div className="flex items-center px-3 py-1 text-[12px]">
          <label className="flex items-center gap-1 text-bn-muted">
            <input type="checkbox" checked={hideOther} onChange={(e) => setHideOther(e.target.checked)} className="accent-bn-yellow" />
            隐藏其他交易对
          </label>
          <button
            type="button"
            onClick={onCloseAll}
            className="ml-auto h-7 rounded-lg bg-bn-input px-2 text-[12px] text-bn-text"
          >
            全部平仓
          </button>
          <button
            type="button"
            onClick={() => {
              if (sort === 'pnl') setSortDir((d) => (d === 1 ? -1 : 1));
              else setSort('pnl');
            }}
            className="ml-1 px-1 text-bn-muted"
            aria-label="排序"
          >
            ↕
          </button>
        </div>
      )}

      {view === 'pos' && (
        <button
          type="button"
          onClick={() => setKOpen((v) => !v)}
          className="flex items-center justify-between px-3 py-1.5 text-[12px] text-bn-muted"
        >
          <span>{currentSymbol} 永续K线图表</span>
          <span>{kOpen ? '▲' : '▼'}</span>
        </button>
      )}
      {view === 'pos' && kOpen && (
        <div className="h-40 border-b border-bn-line">
          <KlineChart klines={klines ?? []} />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
        {view === 'pos' && (
          <>
            {positions.length === 0 && <Empty>暂无持仓</Empty>}
            {positions.map((p) => {
              const f = filters[p.symbol];
              return (
                <PositionCard
                  key={p.id}
                  pos={p}
                  state={state}
                  marks={marks}
                  pricePrecision={f?.pricePrecision ?? 2}
                  qtyPrecision={f?.quantityPrecision ?? 3}
                  onTpsl={() => onTpsl(p)}
                  onClose={() => onClosePos(p)}
                  onLeverage={() => onLeverage(p)}
                  onRealized={() => setRealizedPos(p)}
                />
              );
            })}
          </>
        )}
        {view === 'open' && (
          <>
            {openOrders.length === 0 && <Empty>暂无委托</Empty>}
            {openOrders.map((o) => (
              <div key={o.id} className="flex items-center justify-between border-b border-bn-line px-3 py-2 text-[12px]">
                <div>
                  <div>
                    {o.symbol} {o.side === 'BUY' ? '买入' : '卖出'} {typeLabel(o.type)}
                    {o.positionSide ? ` · ${o.positionSide === 'LONG' ? '多' : '空'}` : ''}
                  </div>
                  <div className="text-[11px] text-bn-muted">
                    {o.qty} @ {o.price ?? o.stopPrice ?? '市价'}
                    {o.reduceOnly ? ' · 只减仓' : ''}
                    {o.timeInForce !== 'GTC' ? ` · ${o.timeInForce}` : ''}
                  </div>
                </div>
                <div className="flex gap-2">
                  {(o.type === 'LIMIT' || o.type === 'STOP' || o.type === 'TAKE_PROFIT') && (
                    <button type="button" onClick={() => onAmend(o)} className="text-bn-text">
                      改单
                    </button>
                  )}
                  <button type="button" onClick={() => onCancel(o.id)} className="text-bn-yellow">
                    撤单
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
        {view === 'history' && (
          <>
            <div className="flex gap-1 overflow-x-auto px-3 py-1 no-scrollbar">
              {(['ALL', 'FILLED', 'CANCELED', 'EXPIRED', 'REJECTED'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setHistFilter(s)}
                  className={`rounded px-2 py-0.5 text-[11px] ${histFilter === s ? 'bg-bn-input text-bn-yellow' : 'text-bn-muted'}`}
                >
                  {s === 'ALL' ? '全部' : statusLabel(s)}
                </button>
              ))}
            </div>
            {shownHist.length === 0 && <Empty>暂无历史委托</Empty>}
            {shownHist
              .slice()
              .reverse()
              .map((o) => (
                <div key={o.id} className="border-b border-bn-line px-3 py-2 text-[12px]">
                  <div className="flex justify-between">
                    <span>
                      {o.symbol} {o.side === 'BUY' ? '买入' : '卖出'} {typeLabel(o.type)}
                    </span>
                    <span className="text-bn-muted">{statusLabel(o.status)}</span>
                  </div>
                  <div className="text-[11px] text-bn-muted">
                    {o.qty} @ {o.price ?? o.stopPrice ?? '市价'} · {fmtTime(o.createdAt)}
                    {o.rejectReason ? ` · ${o.rejectReason}` : ''}
                  </div>
                </div>
              ))}
          </>
        )}
        {view === 'fills' && (
          <>
            {fills.length === 0 && <Empty>暂无成交</Empty>}
            {fills
              .slice()
              .reverse()
              .map((t) => (
                <FillRow key={t.id} t={t} />
              ))}
          </>
        )}
        {view === 'ledger' && (
          <>
            <div className="flex gap-1 overflow-x-auto px-3 py-1 no-scrollbar">
              {(['ALL', 'REALIZED_PNL', 'FEE', 'FUNDING', 'DEPOSIT'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setLedgerKind(k)}
                  className={`rounded px-2 py-0.5 text-[11px] ${ledgerKind === k ? 'bg-bn-input text-bn-yellow' : 'text-bn-muted'}`}
                >
                  {k === 'ALL' ? '全部' : ledgerLabel(k)}
                </button>
              ))}
            </div>
            {ledger.length === 0 && <Empty>暂无流水</Empty>}
            {ledger
              .slice()
              .reverse()
              .map((r, i) => (
                <div key={`${r.time}-${i}`} className="flex items-center justify-between border-b border-bn-line px-3 py-2 text-[12px]">
                  <div>
                    <div>
                      {ledgerLabel(r.kind)} · {r.symbol}
                    </div>
                    <div className="text-[11px] text-bn-muted">
                      {r.note} · {fmtTime(r.time)}
                    </div>
                  </div>
                  <span className={`tn ${pnlClass(r.amount)}`}>{fmtPnl(r.amount)}</span>
                </div>
              ))}
          </>
        )}
        {view === 'robot' && <Empty>交易机器人未开放</Empty>}
      </div>

      {realizedPos && (
        <div className="fixed inset-0 z-40 flex items-end justify-center">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setRealizedPos(null)} />
          <div className="relative w-full max-w-lg rounded-t-sheet bg-white p-4">
            <div className="mb-2 text-center text-[16px] font-semibold">实现盈亏</div>
            <div className="text-[13px] text-bn-muted">{realizedPos.symbol}</div>
            {state.trades
              .filter((t) => t.positionId === realizedPos.id && (t.type === 'CLOSE' || t.type === 'FUNDING'))
              .map((t) => (
                <div key={t.id} className="flex justify-between py-1 text-[13px]">
                  <span className="text-bn-muted">{t.type === 'FUNDING' ? '资金费' : '平仓'}</span>
                  <span className={pnlClass(t.type === 'CLOSE' ? t.realizedPnl : -(t.funding ?? 0))}>
                    {fmtPnl(t.type === 'CLOSE' ? t.realizedPnl : -(t.funding ?? 0))}
                  </span>
                </div>
              ))}
            <button type="button" onClick={() => setRealizedPos(null)} className="mt-3 h-10 w-full rounded-lg bg-bn-input">
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FillRow({ t }: { t: TradeRecord }) {
  return (
    <div className="border-b border-bn-line px-3 py-2 text-[12px]">
      <div className="flex justify-between">
        <span>
          {t.symbol} {t.type === 'OPEN' ? '开仓' : t.type === 'LIQUIDATION' ? '强平' : '平仓'} {t.side === 'BUY' ? '买' : '卖'}
        </span>
        <span className={pnlClass(t.realizedPnl)}>{fmtPnl(t.realizedPnl)}</span>
      </div>
      <div className="text-[11px] text-bn-muted">
        {t.qty} @ {t.price} · {t.isMaker ? 'Maker' : 'Taker'} · 手续费 {fmtNum(t.fee, 4)} · {fmtTime(t.time)}
      </div>
    </div>
  );
}

function typeLabel(t: Order['type']): string {
  const map: Record<Order['type'], string> = {
    MARKET: '市价',
    LIMIT: '限价',
    STOP: '止损限价',
    TAKE_PROFIT: '止盈限价',
    STOP_MARKET: '止损市价',
    TAKE_PROFIT_MARKET: '止盈市价',
    TRAILING_STOP_MARKET: '追踪委托',
  };
  return map[t] ?? t;
}

function statusLabel(s: Order['status']): string {
  const map: Record<Order['status'], string> = {
    NEW: '未成交',
    FILLED: '已成交',
    CANCELED: '已撤销',
    EXPIRED: '已过期',
    REJECTED: '已拒绝',
  };
  return map[s] ?? s;
}

function ledgerLabel(k: LedgerKind): string {
  const map: Record<LedgerKind, string> = {
    REALIZED_PNL: '已实现盈亏',
    FEE: '手续费',
    FUNDING: '资金费',
    DEPOSIT: '入金',
  };
  return map[k];
}

function TabBtn({
  id,
  tab,
  hist,
  on,
  label,
}: {
  id: DockTab;
  tab: DockTab;
  hist: HistTab;
  on: () => void;
  label: string;
}) {
  const active = !hist && tab === id;
  return (
    <button
      type="button"
      onClick={on}
      className={`shrink-0 py-2 text-[13px] ${active ? 'border-b-2 border-bn-yellow font-semibold text-bn-text' : 'text-bn-muted'}`}
    >
      {label}
    </button>
  );
}

function Empty({ children }: { children: string }) {
  return <div className="py-10 text-center text-[13px] text-bn-muted">{children}</div>;
}
