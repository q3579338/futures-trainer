import type { TradeRecord } from './types';

/**
 * 一个仓位的「实现盈亏」拆分，口径对齐币安 App 持仓卡上的实现盈亏：
 *   合计 = 平仓盈亏 − 交易手续费（开仓 + 平仓 + 强平） − 资金费用（付出为正、收到为负）
 * 未平仓部分的浮动盈亏不算在内。
 */
export interface PositionRealized {
  /** 平仓/强平产生的已实现盈亏（不含手续费） */
  closedPnl: number;
  /** 交易手续费合计（正数） */
  fee: number;
  /** 资金费净支出（正=付出，负=收到） */
  funding: number;
  /** 合计 = closedPnl − fee − funding */
  total: number;
  /** 参与计算的记录，按时间升序 */
  records: TradeRecord[];
}

export function positionRealized(trades: TradeRecord[], positionId: string): PositionRealized {
  const records = trades
    .filter((t) => t.positionId === positionId && t.type !== 'DEPOSIT')
    .sort((a, b) => a.time - b.time);
  let closedPnl = 0;
  let fee = 0;
  let funding = 0;
  for (const t of records) {
    if (t.type === 'FUNDING') {
      funding += t.funding ?? -t.realizedPnl;
      continue;
    }
    if (t.type === 'CLOSE' || t.type === 'LIQUIDATION') closedPnl += t.realizedPnl;
    fee += t.fee;
  }
  return { closedPnl, fee, funding, total: closedPnl - fee - funding, records };
}

/** 单条记录在实现盈亏里的贡献（带符号，用于明细行） */
export function realizedAmountOf(t: TradeRecord): number {
  if (t.type === 'FUNDING') return -(t.funding ?? -t.realizedPnl);
  if (t.type === 'CLOSE' || t.type === 'LIQUIDATION') return t.realizedPnl - t.fee;
  if (t.type === 'OPEN') return -t.fee;
  return 0;
}
