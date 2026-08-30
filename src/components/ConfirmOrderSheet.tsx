import { useEffect, useState } from 'react';
import type { OpenReason, OrderSide, OrderType } from '../engine/types';
import { fmtNum } from '../lib/format';
import { REASON_PILLS, confirmReady, directionLabel } from '../lib/tradeUi';
import BottomSheet from './BottomSheet';

export interface ConfirmDraft {
  side: OrderSide;
  type: OrderType;
  typeLabel: string;
  symbol: string;
  qty: number;
  qtyUnit: string;
  /** 名义价值 USDT，用于在确认单上同时显示币量与 U 本位金额 */
  notional?: number;
  price?: number;
  priceLabel: string;
  margin: number;
  liq: number | null;
  fee: number;
  reduceOnly: boolean;
  pricePrecision: number;
  qtyPrecision: number;
}

export default function ConfirmOrderSheet({
  open,
  draft,
  onClose,
  onConfirm,
  busy,
  error,
}: {
  open: boolean;
  draft: ConfirmDraft | null;
  onClose: () => void;
  onConfirm: (reason: OpenReason | null) => void;
  busy?: boolean;
  error?: string;
}) {
  const [reason, setReason] = useState<OpenReason | null>(null);
  useEffect(() => {
    if (open) setReason(null);
  }, [open, draft?.side, draft?.qty, draft?.type]);
  if (!open || !draft) return null;
  const needReason = !draft.reduceOnly;
  const ready = confirmReady(draft.reduceOnly, reason);
  const dir = directionLabel(draft.side, draft.reduceOnly);
  const dirColor = draft.side === 'BUY' ? 'text-bn-green' : 'text-bn-red';

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        setReason(null);
        onClose();
      }}
      title="确认下单"
    >
      <div className="px-4 pb-4">
        <Row k="币对" v={`${draft.symbol} 永续`} />
        <Row k="方向" v={dir} valueClass={dirColor} />
        <Row k="类型" v={draft.typeLabel} />
        <Row k="价格" v={draft.priceLabel} />
        <Row
          k="数量"
          v={
            draft.notional != null && draft.notional > 0
              ? `${fmtNum(draft.qty, draft.qtyPrecision)} ${draft.qtyUnit} ≈ ${fmtNum(draft.notional, 2)} USDT`
              : `${fmtNum(draft.qty, draft.qtyPrecision)} ${draft.qtyUnit}`
          }
        />
        <Row k="保证金" v={`${fmtNum(draft.margin, 2)} USDT`} />
        <Row k="预估强平价" v={draft.liq != null ? `${fmtNum(draft.liq, draft.pricePrecision)} USDT` : '—'} />
        <Row k="手续费" v={`${fmtNum(draft.fee, 4)} USDT`} />

        {needReason && (
          <>
            <div className="mt-3 border-t border-bn-line pt-3 text-[13px] text-bn-text">这笔为什么开？（必选）</div>
            <div className="mt-2 grid grid-cols-3 gap-1.5 pb-1">
              {REASON_PILLS.map((p) => {
                const on = reason === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setReason(p.value)}
                    className={`rounded-full border px-1 py-1 text-[12px] ${
                      p.danger ? 'border-bn-red' : on ? 'border-bn-yellow' : 'border-bn-line'
                    } ${on ? (p.danger ? 'bg-bn-red/15 text-bn-red' : 'bg-bn-yellow/15 text-bn-yellow') : 'text-bn-text'}`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </>
        )}
        {error && <div className="mt-2 text-[12px] text-bn-red">{error}</div>}
        <button
          type="button"
          disabled={!ready || busy}
          onClick={() => onConfirm(reason)}
          className="mt-4 h-10 w-full rounded bg-bn-yellow text-[14px] font-semibold text-black disabled:bg-bn-input disabled:text-bn-muted"
        >
          {busy ? '提交中…' : '确认'}
        </button>
      </div>
    </BottomSheet>
  );
}

function Row({ k, v, valueClass }: { k: string; v: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-[13px]">
      <span className="text-bn-muted">{k}</span>
      <span className={`tn ${valueClass ?? 'text-bn-text'}`}>{v}</span>
    </div>
  );
}
