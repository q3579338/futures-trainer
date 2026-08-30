import { useEffect, useState } from 'react';
import { floorToStep, fmtNum } from '../lib/format';
import { CLOSE_PCT_NODES } from '../lib/tradeUi';
import BottomSheet from './BottomSheet';
import PercentSlider from './PercentSlider';

export default function ClosePositionSheet({
  open,
  symbol,
  qty,
  last,
  stepSize,
  pricePrecision,
  qtyPrecision,
  onClose,
  onConfirm,
}: {
  open: boolean;
  symbol: string;
  qty: number;
  last: number;
  stepSize: number;
  pricePrecision: number;
  qtyPrecision: number;
  onClose: () => void;
  onConfirm: (opts: { type: 'MARKET' | 'LIMIT'; qty: number; price?: number }) => void;
}) {
  const [kind, setKind] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [pct, setPct] = useState(100);
  const [limit, setLimit] = useState(last > 0 ? String(last) : '');
  useEffect(() => {
    if (open) {
      setKind('MARKET');
      setPct(100);
      setLimit(last > 0 ? String(last) : '');
    }
  }, [open, last]);
  const closeQty = floorToStep((qty * pct) / 100, stepSize);
  return (
    <BottomSheet open={open} onClose={onClose} title="平仓">
      <div className="px-4 pb-4">
        <div className="mb-3 text-[12px] text-bn-muted">
          {symbol} 仓位 {fmtNum(qty, qtyPrecision)}
        </div>
        <div className="mb-3 flex rounded bg-bn-input p-0.5">
          <button
            type="button"
            onClick={() => setKind('MARKET')}
            className={`h-8 flex-1 rounded text-[13px] ${kind === 'MARKET' ? 'bg-bn-card text-bn-text' : 'text-bn-muted'}`}
          >
            市价
          </button>
          <button
            type="button"
            onClick={() => setKind('LIMIT')}
            className={`h-8 flex-1 rounded text-[13px] ${kind === 'LIMIT' ? 'bg-bn-card text-bn-text' : 'text-bn-muted'}`}
          >
            限价
          </button>
        </div>
        {kind === 'LIMIT' && (
          <input
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="mb-3 h-10 w-full rounded border border-bn-line bg-bn-input px-3 text-[13px] outline-none tn focus:border-bn-yellow"
            placeholder={`限价 ${fmtNum(last, pricePrecision)}`}
          />
        )}
        <PercentSlider value={pct} onChange={setPct} nodes={[0, ...CLOSE_PCT_NODES]} />
        <div className="mt-1 flex justify-between text-[11px] text-bn-muted">
          {CLOSE_PCT_NODES.map((n) => (
            <button key={n} type="button" onClick={() => setPct(n)}>
              {n}%
            </button>
          ))}
        </div>
        <div className="mt-3 text-[12px] text-bn-muted">
          平仓数量 <span className="text-bn-text tn">{fmtNum(closeQty, qtyPrecision)}</span>
        </div>
        <button
          type="button"
          disabled={closeQty <= 0}
          onClick={() =>
            onConfirm({
              type: kind,
              qty: closeQty,
              price: kind === 'LIMIT' ? Number(limit) : undefined,
            })
          }
          className="mt-4 h-10 w-full rounded bg-bn-yellow text-[14px] font-semibold text-black disabled:opacity-40"
        >
          确认
        </button>
      </div>
    </BottomSheet>
  );
}
