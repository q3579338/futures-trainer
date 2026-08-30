import { useEffect, useMemo, useState } from 'react';
import { previewIsolatedAdjust } from '../engine/isolatedAdj';
import type { Position } from '../engine/types';
import { fmtNum } from '../lib/format';
import BottomSheet from './BottomSheet';

export default function IsolatedMarginSheet({
  open,
  pos,
  mark,
  available,
  pricePrecision,
  onClose,
  onConfirm,
}: {
  open: boolean;
  pos: Position | null;
  mark: number;
  available: number;
  pricePrecision: number;
  onClose: () => void;
  onConfirm: (delta: number) => string | undefined;
}) {
  const [dir, setDir] = useState<'add' | 'remove'>('add');
  const [amt, setAmt] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    if (open) {
      setDir('add');
      setAmt('');
      setErr('');
    }
  }, [open, pos?.id]);
  const delta = (Number(amt) || 0) * (dir === 'add' ? 1 : -1);
  const preview = useMemo(() => {
    if (!pos || !(Number(amt) > 0)) return null;
    return previewIsolatedAdjust(pos, delta, mark);
  }, [pos, amt, delta, mark]);

  return (
    <BottomSheet open={open} onClose={onClose} title="调整保证金">
      <div className="px-4 pb-4">
        <div className="mb-3 flex rounded bg-bn-input p-0.5">
          <button
            type="button"
            onClick={() => setDir('add')}
            className={`h-8 flex-1 rounded text-[13px] ${dir === 'add' ? 'bg-bn-card text-bn-text' : 'text-bn-muted'}`}
          >
            增加
          </button>
          <button
            type="button"
            onClick={() => setDir('remove')}
            className={`h-8 flex-1 rounded text-[13px] ${dir === 'remove' ? 'bg-bn-card text-bn-text' : 'text-bn-muted'}`}
          >
            减少
          </button>
        </div>
        <input
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
          inputMode="decimal"
          placeholder="金额 USDT"
          className="h-10 w-full rounded border border-bn-line bg-bn-input px-3 text-[13px] outline-none tn focus:border-bn-yellow"
        />
        <div className="mt-2 space-y-1 text-[12px] text-bn-muted">
          <div className="flex justify-between">
            <span>当前保证金</span>
            <span className="tn text-bn-text">{pos ? fmtNum(pos.isolatedWallet, 2) : '—'} USDT</span>
          </div>
          <div className="flex justify-between">
            <span>起始保证金</span>
            <span className="tn text-bn-text">{pos ? fmtNum(pos.initialMargin, 2) : '—'} USDT</span>
          </div>
          <div className="flex justify-between">
            <span>可用</span>
            <span className="tn text-bn-text">{fmtNum(available, 2)} USDT</span>
          </div>
          <div className="flex justify-between">
            <span>调整后强平价</span>
            <span className="tn text-bn-text">
              {preview && !('error' in preview) && preview.liqPrice != null
                ? fmtNum(preview.liqPrice, pricePrecision)
                : '—'}
            </span>
          </div>
        </div>
        {((preview && 'error' in preview && preview.error) || err) && (
          <div className="mt-2 text-[12px] text-bn-red">{err || (preview && 'error' in preview ? preview.error : '')}</div>
        )}
        <button
          type="button"
          disabled={!(Number(amt) > 0) || !pos}
          onClick={() => {
            if (!pos) return;
            const e = onConfirm(delta);
            if (e) setErr(e);
            else onClose();
          }}
          className="mt-4 h-10 w-full rounded bg-bn-yellow text-[14px] font-semibold text-black disabled:opacity-40"
        >
          确认
        </button>
      </div>
    </BottomSheet>
  );
}
