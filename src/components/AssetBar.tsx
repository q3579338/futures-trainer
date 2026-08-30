import { fmtNum, fmtPnl, pnlClass } from '../lib/format';

export default function AssetBar({
  marginBalance,
  upnl,
  totalDeposited,
  equity,
  available,
  expanded,
  onToggle,
  onDeposit,
}: {
  marginBalance: number;
  upnl: number;
  totalDeposited: number;
  equity: number;
  available: number;
  expanded: boolean;
  onToggle: () => void;
  onDeposit: () => void;
}) {
  const totalPnl = equity - totalDeposited;
  return (
    <button type="button" onClick={onToggle} className="w-full border-y border-bn-line px-3 py-1.5 text-left">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] text-bn-muted">保证金余额</div>
          <div className="text-[13px] text-bn-text tn">{fmtNum(marginBalance)} USDT</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-bn-muted">未实现盈亏</div>
          <div className={`text-[13px] tn ${pnlClass(upnl)}`}>{fmtPnl(upnl)} USDT</div>
        </div>
      </div>
      {expanded && (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]" onClick={(e) => e.stopPropagation()}>
          <Row k="累计入金" v={`${fmtNum(totalDeposited)} USDT`} />
          <Row k="当前权益" v={`${fmtNum(equity)} USDT`} />
          <Row k="总盈亏" v={fmtPnl(totalPnl)} tone={totalPnl} />
          <Row k="可用" v={`${fmtNum(available)} USDT`} />
          <div className="col-span-2 mt-1">
            <button
              type="button"
              onClick={onDeposit}
              className="w-full rounded bg-bn-yellow py-2 text-[13px] font-medium text-black"
            >
              入金
            </button>
          </div>
        </div>
      )}
    </button>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-bn-muted">{k}</span>
      <span className={`tn text-[12px] ${tone != null ? (tone > 0 ? 'text-bn-green' : tone < 0 ? 'text-bn-red' : 'text-bn-text') : 'text-bn-text'}`}>
        {v}
      </span>
    </div>
  );
}
