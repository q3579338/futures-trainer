import { useEffect, useState } from 'react';
import type { Position, WorkingType } from '../engine/types';
import { triggerFromPnl, triggerFromRoe } from '../engine/tpslCalc';
import { fmtNum } from '../lib/format';
import BottomSheet from './BottomSheet';

type Mode = 'price' | 'amount' | 'roe';

export default function TpslSheet({
  open,
  pos,
  onClose,
  onConfirm,
}: {
  open: boolean;
  pos: Position | null;
  takeProfit?: number;
  stopLoss?: number;
  onClose: () => void;
  onConfirm: (patch: {
    takeProfit?: number | null;
    stopLoss?: number | null;
    takeProfitWorkingType?: WorkingType;
    stopLossWorkingType?: WorkingType;
  }) => void;
}) {
  const [tpMode, setTpMode] = useState<Mode>('price');
  const [slMode, setSlMode] = useState<Mode>('price');
  const [tp, setTp] = useState('');
  const [sl, setSl] = useState('');
  const [tpAmt, setTpAmt] = useState('');
  const [slAmt, setSlAmt] = useState('');
  const [tpRoe, setTpRoe] = useState('');
  const [slRoe, setSlRoe] = useState('');
  const [tpWt, setTpWt] = useState<WorkingType>('MARK_PRICE');
  const [slWt, setSlWt] = useState<WorkingType>('MARK_PRICE');

  useEffect(() => {
    if (!open || !pos) return;
    setTp(pos.takeProfit != null ? String(pos.takeProfit) : '');
    setSl(pos.stopLoss != null ? String(pos.stopLoss) : '');
    setTpWt(pos.takeProfitWorkingType ?? 'MARK_PRICE');
    setSlWt(pos.stopLossWorkingType ?? 'MARK_PRICE');
    setTpMode('price');
    setSlMode('price');
    setTpAmt('');
    setSlAmt('');
    setTpRoe('');
    setSlRoe('');
  }, [open, pos?.id, pos?.takeProfit, pos?.stopLoss]);

  function derivedTp(): number | null {
    if (!pos) return null;
    if (tpMode === 'amount' && Number(tpAmt)) return triggerFromPnl(pos.side, pos.entryPrice, pos.qty, Number(tpAmt));
    if (tpMode === 'roe' && Number(tpRoe)) {
      return triggerFromRoe(pos.side, pos.entryPrice, pos.qty, pos.initialMargin, Number(tpRoe));
    }
    return tp === '' ? null : Number(tp);
  }
  function derivedSl(): number | null {
    if (!pos) return null;
    if (slMode === 'amount' && Number(slAmt)) {
      return triggerFromPnl(pos.side, pos.entryPrice, pos.qty, -Math.abs(Number(slAmt)));
    }
    if (slMode === 'roe' && Number(slRoe)) {
      return triggerFromRoe(pos.side, pos.entryPrice, pos.qty, pos.initialMargin, -Math.abs(Number(slRoe)));
    }
    return sl === '' ? null : Number(sl);
  }

  const tpPx = derivedTp();
  const slPx = derivedSl();

  return (
    <BottomSheet open={open} onClose={onClose} title="止盈止损">
      <div className="px-4 pb-4">
        <Block
          title="止盈"
          mode={tpMode}
          onMode={setTpMode}
          price={tp}
          onPrice={setTp}
          amt={tpAmt}
          onAmt={setTpAmt}
          roe={tpRoe}
          onRoe={setTpRoe}
          wt={tpWt}
          onWt={setTpWt}
          derived={tpPx}
        />
        <Block
          title="止损"
          mode={slMode}
          onMode={setSlMode}
          price={sl}
          onPrice={setSl}
          amt={slAmt}
          onAmt={setSlAmt}
          roe={slRoe}
          onRoe={setSlRoe}
          wt={slWt}
          onWt={setSlWt}
          derived={slPx}
          loss
        />
        <div className="mt-2 text-[11px] text-bn-muted">
          可按价格、金额或回报率反推触发价。留空表示清除。触发默认标记价。
        </div>
        <button
          type="button"
          onClick={() =>
            onConfirm({
              takeProfit: tpPx != null && Number.isFinite(tpPx) ? tpPx : null,
              stopLoss: slPx != null && Number.isFinite(slPx) ? slPx : null,
              takeProfitWorkingType: tpWt,
              stopLossWorkingType: slWt,
            })
          }
          className="mt-4 h-10 w-full rounded bg-bn-yellow text-[14px] font-semibold text-black"
        >
          确认
        </button>
      </div>
    </BottomSheet>
  );
}

function Block({
  title,
  mode,
  onMode,
  price,
  onPrice,
  amt,
  onAmt,
  roe,
  onRoe,
  wt,
  onWt,
  derived,
  loss,
}: {
  title: string;
  mode: Mode;
  onMode: (m: Mode) => void;
  price: string;
  onPrice: (v: string) => void;
  amt: string;
  onAmt: (v: string) => void;
  roe: string;
  onRoe: (v: string) => void;
  wt: WorkingType;
  onWt: (w: WorkingType) => void;
  derived: number | null;
  loss?: boolean;
}) {
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between text-[12px] text-bn-muted">
        <span>{title}</span>
        <button
          type="button"
          onClick={() => onWt(wt === 'MARK_PRICE' ? 'CONTRACT_PRICE' : 'MARK_PRICE')}
          className="text-[11px] text-bn-text"
        >
          {wt === 'MARK_PRICE' ? '标记价' : '最新价'} ▾
        </button>
      </div>
      <div className="mb-1 flex gap-1 text-[11px]">
        {(['price', 'amount', 'roe'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onMode(m)}
            className={`rounded px-2 py-0.5 ${mode === m ? 'bg-bn-input text-bn-yellow' : 'bg-bn-input text-bn-muted'}`}
          >
            {m === 'price' ? '价格' : m === 'amount' ? '金额' : '回报率'}
          </button>
        ))}
      </div>
      {mode === 'price' && (
        <input
          value={price}
          onChange={(e) => onPrice(e.target.value)}
          inputMode="decimal"
          placeholder="触发价"
          className="h-10 w-full rounded border border-bn-line bg-bn-input px-3 text-[13px] outline-none tn focus:border-bn-yellow"
        />
      )}
      {mode === 'amount' && (
        <input
          value={amt}
          onChange={(e) => onAmt(e.target.value)}
          inputMode="decimal"
          placeholder={loss ? '亏损金额 USDT' : '盈利金额 USDT'}
          className="h-10 w-full rounded border border-bn-line bg-bn-input px-3 text-[13px] outline-none tn focus:border-bn-yellow"
        />
      )}
      {mode === 'roe' && (
        <input
          value={roe}
          onChange={(e) => onRoe(e.target.value)}
          inputMode="decimal"
          placeholder={loss ? '亏损回报率 %' : '盈利回报率 %'}
          className="h-10 w-full rounded border border-bn-line bg-bn-input px-3 text-[13px] outline-none tn focus:border-bn-yellow"
        />
      )}
      {mode !== 'price' && derived != null && Number.isFinite(derived) && (
        <div className="mt-1 text-[11px] text-bn-muted">
          触发价 <span className="tn text-bn-text">{fmtNum(derived, 2)}</span>
        </div>
      )}
    </div>
  );
}
