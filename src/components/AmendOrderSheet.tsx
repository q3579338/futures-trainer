import { useEffect, useState } from 'react';
import type { Order } from '../engine/types';
import BottomSheet from './BottomSheet';

export default function AmendOrderSheet({
  open,
  order,
  onClose,
  onConfirm,
}: {
  open: boolean;
  order: Order | null;
  onClose: () => void;
  onConfirm: (patch: { price?: number; qty?: number }) => string | undefined;
}) {
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    if (open && order) {
      setPrice(order.price != null ? String(order.price) : '');
      setQty(String(order.qty));
      setErr('');
    }
  }, [open, order?.id]);
  return (
    <BottomSheet open={open} onClose={onClose} title="改单">
      <div className="px-4 pb-4">
        <div className="mb-2 text-[12px] text-bn-muted">
          {order?.symbol} {order?.side === 'BUY' ? '买入' : '卖出'}
        </div>
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          placeholder="价格"
          className="mb-2 h-10 w-full rounded border border-bn-line bg-bn-input px-3 text-[13px] outline-none tn focus:border-bn-yellow"
        />
        <input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          inputMode="decimal"
          placeholder="数量"
          className="h-10 w-full rounded border border-bn-line bg-bn-input px-3 text-[13px] outline-none tn focus:border-bn-yellow"
        />
        {err && <div className="mt-2 text-[12px] text-bn-red">{err}</div>}
        <button
          type="button"
          onClick={() => {
            const e = onConfirm({
              price: Number(price) || undefined,
              qty: Number(qty) || undefined,
            });
            if (e) setErr(e);
            else onClose();
          }}
          className="mt-4 h-10 w-full rounded bg-bn-yellow text-[14px] font-semibold text-black"
        >
          确认
        </button>
      </div>
    </BottomSheet>
  );
}
