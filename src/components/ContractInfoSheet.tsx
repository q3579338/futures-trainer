import { getBrackets } from '../engine/brackets';
import { fmtNum, fmtPct, fmtTime } from '../lib/format';
import type { SymbolFilter } from '../market/rest';
import BottomSheet from './BottomSheet';

export default function ContractInfoSheet({
  open,
  symbol,
  filter,
  fundingRate,
  nextFundingTime,
  onClose,
}: {
  open: boolean;
  symbol: string;
  filter?: SymbolFilter;
  fundingRate: number;
  nextFundingTime: number;
  onClose: () => void;
}) {
  const rows = getBrackets(symbol);
  return (
    <BottomSheet open={open} onClose={onClose} title="合约信息">
      <div className="px-4 pb-4 text-[13px]">
        <Row k="合约类型" v="永续" />
        <Row k="标的" v={symbol.replace(/USDT$/i, '')} />
        <Row k="结算币种" v="USDT" />
        <Row k="tickSize" v={String(filter?.tickSize ?? '—')} />
        <Row k="stepSize" v={String(filter?.stepSize ?? '—')} />
        <Row k="最小下单量" v={String(filter?.minQty ?? '—')} />
        <Row k="当前资金费率" v={fmtPct(fundingRate * 100, 4)} />
        <Row k="下次资金费" v={nextFundingTime ? fmtTime(nextFundingTime) : '—'} />
        <Row k="资金费上下限" v="±2.00% / 8h（币安默认封顶）" />
        <div className="mt-3 text-[12px] text-bn-muted">杠杆与维持保证金档位</div>
        <div className="mt-1 overflow-hidden rounded border border-bn-line text-[11px]">
          <div className="grid grid-cols-3 bg-bn-input px-2 py-1 text-bn-muted">
            <span>名义价值</span>
            <span className="text-right">最高杠杆</span>
            <span className="text-right">维持保证金率</span>
          </div>
          {rows.map((b) => (
            <div key={b.notionalFloor} className="grid grid-cols-3 border-t border-bn-line px-2 py-1 tn">
              <span>
                {fmtNum(b.notionalFloor, 0)}-{fmtNum(b.notionalCap, 0)}
              </span>
              <span className="text-right">{b.maxLeverage}x</span>
              <span className="text-right">{(b.maintMarginRatio * 100).toFixed(2)}%</span>
            </div>
          ))}
        </div>
      </div>
    </BottomSheet>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between py-1.5">
      <span className="text-bn-muted">{k}</span>
      <span className="tn text-bn-text">{v}</span>
    </div>
  );
}
