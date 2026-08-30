import type { EngineState, LedgerKind, Order, TradeRecord } from './types';

const HISTORY_CAP = 2000;

export function archiveOrder(state: EngineState, order: Order): void {
  if (order.status === 'NEW') return;
  if (!state.orderHistory) state.orderHistory = [];
  state.orderHistory.push({ ...order });
  if (state.orderHistory.length > HISTORY_CAP) {
    state.orderHistory.splice(0, state.orderHistory.length - HISTORY_CAP);
  }
}

export function pruneLiveOrders(state: EngineState): void {
  const live: Order[] = [];
  for (const o of state.orders) {
    if (o.status === 'NEW') live.push(o);
    else archiveOrder(state, o);
  }
  state.orders = live;
}

export function allOrders(state: EngineState): Order[] {
  return [...(state.orderHistory ?? []), ...state.orders.filter((o) => o.status === 'NEW')];
}

export function ledgerKindOf(t: TradeRecord): LedgerKind | null {
  if (t.type === 'DEPOSIT') return 'DEPOSIT';
  if (t.type === 'FUNDING') return 'FUNDING';
  if (t.type === 'CLOSE' || t.type === 'LIQUIDATION') return 'REALIZED_PNL';
  if (t.fee > 0 && (t.type === 'OPEN' || t.type === 'CLOSE' || t.type === 'LIQUIDATION')) return 'FEE';
  return null;
}

export function ledgerRows(
  trades: TradeRecord[],
  kind?: LedgerKind,
): Array<{ time: number; kind: LedgerKind; symbol: string; amount: number; note: string }> {
  const rows: Array<{ time: number; kind: LedgerKind; symbol: string; amount: number; note: string }> = [];
  for (const t of trades) {
    if (t.type === 'DEPOSIT') {
      rows.push({ time: t.time, kind: 'DEPOSIT', symbol: t.symbol, amount: t.amount ?? t.qty, note: '入金' });
      continue;
    }
    if (t.type === 'FUNDING') {
      rows.push({
        time: t.time,
        kind: 'FUNDING',
        symbol: t.symbol,
        amount: -(t.funding ?? -t.realizedPnl),
        note: '资金费',
      });
      continue;
    }
    if ((t.type === 'CLOSE' || t.type === 'LIQUIDATION') && t.realizedPnl !== 0) {
      rows.push({
        time: t.time,
        kind: 'REALIZED_PNL',
        symbol: t.symbol,
        amount: t.realizedPnl,
        note: t.type === 'LIQUIDATION' ? '强平已实现盈亏' : '已实现盈亏',
      });
    }
    if (t.fee > 0) {
      rows.push({
        time: t.time,
        kind: 'FEE',
        symbol: t.symbol,
        amount: -t.fee,
        note: t.isMaker ? 'Maker 手续费' : 'Taker 手续费',
      });
    }
  }
  return kind ? rows.filter((r) => r.kind === kind) : rows;
}
