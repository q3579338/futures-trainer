import type { TradeRecord } from '../engine/types';
import { fmtNum, fmtPnl, fmtTime, pnlClass } from '../lib/format';
import BottomSheet from './BottomSheet';

export default function FundingHistorySheet({
  open,
  trades,
  onClose,
}: {
  open: boolean;
  trades: TradeRecord[];
  onClose: () => void;
}) {
  const rows = trades.filter((t) => t.type === 'FUNDING').slice().reverse();
  return (
    <BottomSheet open={open} onClose={onClose} title="资金费历史">
      <div className="px-4 pb-4">
        {rows.length === 0 && <div className="py-8 text-center text-[13px] text-bn-muted">暂无资金费记录</div>}
        {rows.map((t) => (
          <div key={t.id} className="flex items-center justify-between border-b border-bn-line py-2 text-[12px]">
            <div>
              <div>{t.symbol}</div>
              <div className="text-[11px] text-bn-muted">{fmtTime(t.time)}</div>
            </div>
            <div className="text-right">
              <div className={pnlClass(-(t.funding ?? -t.realizedPnl))}>{fmtPnl(-(t.funding ?? -t.realizedPnl))}</div>
              <div className="text-[11px] text-bn-muted">标记 {fmtNum(t.price, 2)}</div>
            </div>
          </div>
        ))}
      </div>
    </BottomSheet>
  );
}
