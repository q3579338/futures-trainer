import { useState } from 'react';
import { FEE_TIERS, feeTierLabel } from '../engine/fees';
import type { PositionMode } from '../engine/types';
import BottomSheet from './BottomSheet';

export default function PrefsSheet({
  open,
  mode,
  onClose,
  onMode,
  feeTier,
  onFeeTier,
}: {
  open: boolean;
  mode: PositionMode;
  onClose: () => void;
  onMode: (m: PositionMode) => string | undefined;
  feeTier: number;
  onFeeTier: (level: number) => void;
}) {
  const [err, setErr] = useState('');
  return (
    <BottomSheet open={open} onClose={onClose} title="偏好设置">
      <div className="px-4 pb-4">
        <div className="mb-2 text-[13px] text-bn-text">持仓模式</div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              const e = onMode('ONE_WAY');
              setErr(e ?? '');
            }}
            className={`h-10 flex-1 rounded border text-[13px] ${
              mode === 'ONE_WAY' ? 'border-bn-yellow text-bn-yellow' : 'border-bn-line text-bn-text'
            }`}
          >
            单向持仓
          </button>
          <button
            type="button"
            onClick={() => {
              const e = onMode('HEDGE');
              setErr(e ?? '');
            }}
            className={`h-10 flex-1 rounded border text-[13px] ${
              mode === 'HEDGE' ? 'border-bn-yellow text-bn-yellow' : 'border-bn-line text-bn-text'
            }`}
          >
            双向持仓
          </button>
        </div>
        <p className="mt-3 text-[12px] leading-5 text-bn-muted">
          单向：同一币对只有一个方向。双向：可同时持有多头与空头，下单变为开多/平多/开空/平空。切换要求当前无持仓且无挂单。
        </p>
        {err && <div className="mt-2 text-[12px] text-bn-red">{err}</div>}

        <div className="mb-2 mt-5 text-[13px] text-bn-text">手续费等级</div>
        <div className="grid grid-cols-5 gap-1.5">
          {FEE_TIERS.map((t) => (
            <button
              key={t.level}
              type="button"
              onClick={() => onFeeTier(t.level)}
              className={`h-9 rounded border text-[12px] ${
                feeTier === t.level ? 'border-bn-yellow text-bn-yellow' : 'border-bn-line text-bn-text'
              }`}
            >
              VIP{t.level}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12px] leading-5 text-bn-muted">
          当前 {feeTierLabel(feeTier)}。按币安 USDⓈ-M 合约标准费率表（不含 BNB 抵扣），只影响之后的成交，已成交记录不重算。
        </p>
      </div>
    </BottomSheet>
  );
}
