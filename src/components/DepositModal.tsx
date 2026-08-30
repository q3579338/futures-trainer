import { useState } from 'react';
import BottomSheet from './BottomSheet';

const QUICK = [100, 1000, 5000, 10000];

export default function DepositModal({
  open,
  title = '模拟入金',
  onClose,
  onConfirm,
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
  onConfirm: (amount: number) => string | undefined;
}) {
  const [val, setVal] = useState('1000');
  const [err, setErr] = useState('');
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className="px-4 pb-4">
        <input
          type="number"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="h-12 w-full rounded border border-bn-line bg-bn-input px-3 text-[18px] outline-none tn focus:border-bn-yellow"
          placeholder="10 ~ 10,000,000"
        />
        <div className="mt-2 grid grid-cols-4 gap-2">
          {QUICK.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setVal(String(n))}
              className="h-8 rounded bg-bn-input text-[12px]"
            >
              {n}
            </button>
          ))}
        </div>
        {err && <div className="mt-2 text-[12px] text-bn-red">{err}</div>}
        <button
          type="button"
          onClick={() => {
            const n = Number(val);
            const e = onConfirm(n);
            if (e) setErr(e);
            else onClose();
          }}
          className="mt-4 h-10 w-full rounded bg-bn-yellow text-[14px] font-semibold text-black"
        >
          确认入金
        </button>
      </div>
    </BottomSheet>
  );
}
