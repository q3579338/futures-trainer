import { useEffect, useState } from 'react';
import { getBrackets } from '../engine/brackets';
import { fmtNum } from '../lib/format';
import { LEV_TICKS } from '../lib/tradeUi';
import BottomSheet from './BottomSheet';

export default function LeverageSheet({
  open,
  value,
  max,
  symbol,
  error,
  onClose,
  onConfirm,
  onOpenIsolated,
}: {
  open: boolean;
  value: number;
  max: number;
  symbol?: string;
  error?: string;
  onClose: () => void;
  onConfirm: (n: number) => void;
  onOpenIsolated?: () => void;
}) {
  const cap = Math.max(1, Math.min(125, max));
  const [lev, setLev] = useState(Math.min(value, cap));
  useEffect(() => {
    if (open) setLev(Math.min(value, cap));
  }, [open, value, cap]);

  function clamp(n: number) {
    return Math.max(1, Math.min(cap, Math.round(n)));
  }

  const rows = symbol ? getBrackets(symbol) : [];

  return (
    <BottomSheet open={open} onClose={onClose} title="调整杠杆">
      <div className="px-4 pb-4">
        <div className="flex items-center justify-center gap-6 py-2">
          <button
            type="button"
            onClick={() => setLev((v) => clamp(v - 1))}
            className="flex h-9 w-9 items-center justify-center rounded bg-bn-input text-[18px] text-bn-text"
          >
            −
          </button>
          <div className="text-[32px] font-semibold tn">
            {lev}
            <span className="text-[18px]">x</span>
          </div>
          <button
            type="button"
            onClick={() => setLev((v) => clamp(v + 1))}
            className="flex h-9 w-9 items-center justify-center rounded bg-bn-input text-[18px] text-bn-text"
          >
            ＋
          </button>
        </div>
        <div className="relative mt-2 h-10">
          <input
            type="range"
            min={1}
            max={cap}
            value={lev}
            onChange={(e) => setLev(clamp(Number(e.target.value)))}
            className="w-full"
          />
          <div className="mt-1 flex justify-between text-[10px] text-bn-muted">
            {LEV_TICKS.filter((t) => t <= cap || t === 1).map((t) => (
              <button key={t} type="button" onClick={() => setLev(clamp(t))} className={lev === t ? 'text-bn-yellow' : ''}>
                {t}x
              </button>
            ))}
            {cap < 125 && cap !== 25 && cap !== 50 && cap !== 75 && (
              <button type="button" onClick={() => setLev(cap)} className={lev === cap ? 'text-bn-yellow' : ''}>
                {cap}x
              </button>
            )}
          </div>
        </div>
        {rows.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 text-[12px] text-bn-muted">杠杆档位</div>
            <div className="max-h-40 overflow-y-auto rounded border border-bn-line text-[11px]">
              <div className="grid grid-cols-2 bg-bn-input px-2 py-1 text-bn-muted">
                <span>名义价值 (USDT)</span>
                <span className="text-right">最高杠杆</span>
              </div>
              {rows.map((b) => (
                <div key={b.notionalFloor} className="grid grid-cols-2 border-t border-bn-line px-2 py-1 tn">
                  <span>
                    {fmtNum(b.notionalFloor, 0)} ~ {fmtNum(b.notionalCap, 0)}
                  </span>
                  <span className="text-right">{b.maxLeverage}x</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="mt-4 text-[12px] leading-5 text-bn-muted">
          选择过高杠杆会增加强平风险。当前上限 {cap}x（合约档位与风控取较小值）。降杠杆若会立即强平将被拒绝。
        </p>
        {error && <div className="mt-2 text-[12px] text-bn-red">{error}</div>}
        <button
          type="button"
          onClick={() => {
            onConfirm(lev);
            onClose();
          }}
          className="mt-4 h-10 w-full rounded bg-bn-yellow text-[14px] font-semibold text-black"
        >
          确认
        </button>
        {onOpenIsolated && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenIsolated();
            }}
            className="mt-2 h-10 w-full rounded-lg bg-bn-input text-[14px] text-bn-text"
          >
            调整保证金
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
