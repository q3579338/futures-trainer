import { useMemo, useState } from 'react';
import { availableBalance, equity, totalUnrealizedPnl } from '../engine/account';
import { fmtNum, fmtPnl, pnlClass } from '../lib/format';
import { startOfLocalDay, sumRealized } from '../lib/pnlAnalysis';
import { useMarketStore } from '../store/marketStore';
import { useSimStore } from '../store/simStore';
import DashLabel from '../components/DashLabel';

export default function AssetPage({
  now,
  onTrade,
  onReview,
  onDeposit,
}: {
  now: number;
  onTrade: () => void;
  onReview: () => void;
  onDeposit: () => void;
}) {
  const sim = useSimStore();
  const market = useMarketStore();
  const [hide, setHide] = useState(false);
  const marks = useMemo(
    () => ({ ...market.markPrices, [market.symbol]: market.markPrice || market.lastPrice }),
    [market.markPrices, market.symbol, market.markPrice, market.lastPrice],
  );
  const eq = equity(sim.state, marks);
  const avail = availableBalance(sim.state, marks);
  const upnl = totalUnrealizedPnl(sim.state, marks);
  const todayFrom = startOfLocalDay(now);
  const today = sumRealized(sim.state.trades, todayFrom, now);
  const startEq = eq - today.net - upnl + upnl;
  const todayPct = startEq > 0 ? (today.net / Math.max(1e-9, eq - today.net)) * 100 : 0;
  const mask = (s: string) => (hide ? '****' : s);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-white no-scrollbar">
      <div className="flex items-center px-4 pt-3">
        <span className="text-[18px] font-bold">U本位</span>
        <span className="ml-4 text-[14px] text-bn-muted">币本位</span>
        <span className="ml-4 text-[14px] text-bn-muted">期权</span>
      </div>
      <div className="mt-4 px-4">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => setHide((v) => !v)} className="flex items-center gap-1 text-[12px] text-bn-muted">
            保证金余额 {hide ? '🙈' : '👁'}
          </button>
          <div className="flex gap-2 text-[16px]">
            <span>🎁</span>
            <span className="text-bn-hint">⇄</span>
            <span>🕘</span>
          </div>
        </div>
        <div className="mt-1 text-[32px] font-bold leading-tight tn">
          {mask(`${fmtNum(eq)} USDT`)} ▼
        </div>
        <div className="text-[13px] text-bn-muted tn">{mask(`≈ $${fmtNum(eq)}`)}</div>
        <button type="button" onClick={onReview} className="mt-2 flex items-center text-[13px]">
          <span className="text-bn-muted">今日已实现盈亏</span>
          <span className={`ml-2 tn ${pnlClass(today.net)}`}>
            {mask(`${fmtPnl(today.net)}(${todayPct.toFixed(2)}%)`)}
          </span>
          <span className="ml-1 text-bn-muted">›</span>
        </button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 px-4">
        <div>
          <DashLabel className="text-[11px]">钱包余额 (USDT)</DashLabel>
          <div className="mt-1 text-[15px] tn">{mask(fmtNum(sim.state.walletBalance))}</div>
        </div>
        <div>
          <DashLabel className="text-[11px]">未实现盈亏 (USDT)</DashLabel>
          <div className={`mt-1 text-[15px] tn ${pnlClass(upnl)}`}>{mask(fmtPnl(upnl))}</div>
        </div>
      </div>
      <div className="mt-4 flex gap-2 px-4">
        <button type="button" onClick={onTrade} className="h-10 flex-1 rounded-lg bg-bn-yellow text-[14px] font-semibold text-black">
          交易
        </button>
        <button type="button" disabled className="h-10 flex-1 rounded-lg bg-bn-input text-[14px] text-bn-hint">
          兑换
        </button>
        <button type="button" disabled className="h-10 flex-1 rounded-lg bg-bn-input text-[14px] text-bn-hint">
          划转
        </button>
      </div>
      <div className="mt-5 flex gap-4 border-b border-bn-line px-4 text-[14px]">
        <span className="border-b-2 border-bn-yellow py-2 font-semibold">持有仓位</span>
        <span className="py-2 text-bn-muted">资产</span>
      </div>
      <div className="px-4 py-3 text-[13px] text-bn-muted">
        <div className="flex justify-between py-1">
          <span>可用</span>
          <span className="tn text-bn-text">{mask(`${fmtNum(avail)} USDT`)}</span>
        </div>
        <div className="flex justify-between py-1">
          <span>累计入金</span>
          <span className="tn text-bn-text">{mask(`${fmtNum(sim.state.totalDeposited)} USDT`)}</span>
        </div>
        <button type="button" onClick={onDeposit} className="mt-3 h-10 w-full rounded-lg bg-bn-input text-[14px] text-bn-text">
          入金
        </button>
      </div>
    </div>
  );
}
