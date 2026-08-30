import { useEffect, useState } from 'react';
import type { MarginMode } from '../engine/types';
import BottomSheet from './BottomSheet';

export default function MarginModeSheet({
  open,
  value,
  disabled,
  onClose,
  onConfirm,
}: {
  open: boolean;
  value: MarginMode;
  disabled?: boolean;
  onClose: () => void;
  onConfirm: (m: MarginMode) => void;
}) {
  const [draft, setDraft] = useState<MarginMode>(value);
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);
  return (
    <BottomSheet open={open} onClose={onClose} title="保证金模式">
      <div className="px-4 pb-4">
        {disabled && (
          <div className="mb-3 text-[12px] text-bn-yellow">当前有持仓，无法切换保证金模式</div>
        )}
        <div className="flex gap-2">
          <ModeBtn
            active={draft === 'CROSSED'}
            label="全仓"
            onClick={() => setDraft('CROSSED')}
            disabled={disabled}
          />
          <ModeBtn
            active={draft === 'ISOLATED'}
            label="逐仓"
            onClick={() => setDraft('ISOLATED')}
            disabled={disabled}
          />
        </div>
        <p className="mt-3 text-[12px] leading-5 text-bn-muted">
          {draft === 'ISOLATED'
            ? '逐仓模式：保证金单独计算。若仓位被强平，你最多只损失该仓位保证金。'
            : '全仓模式：保证金在同一结算资产的所有全仓仓位之间共享。强平时可能损失钱包内全部该资产余额。'}
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onConfirm(draft);
            onClose();
          }}
          className="mt-4 h-10 w-full rounded bg-bn-yellow text-[14px] font-semibold text-black disabled:opacity-40"
        >
          确认
        </button>
      </div>
    </BottomSheet>
  );
}

function ModeBtn({
  active,
  label,
  onClick,
  disabled,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`h-10 flex-1 rounded border text-[13px] ${
        active ? 'border-bn-yellow text-bn-yellow' : 'border-bn-line text-bn-text'
      }`}
    >
      {label}
    </button>
  );
}
