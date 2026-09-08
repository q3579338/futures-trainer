import { useEffect, useState } from 'react';
import { unrealizedPnl } from '../engine/account';
import { positionRealized } from '../engine/realized';
import { adlLights } from '../engine/adl';
import { maintenanceMargin } from '../engine/brackets';
import { distToLiqPct, positionLiquidationPrice } from '../engine/liquidation';
import type { EngineState, Position } from '../engine/types';
import { vibrateLiqWarn } from '../lib/haptics';
import { fmtNum, fmtPct, fmtPnl, pnlClass } from '../lib/format';
import DashLabel from './DashLabel';

const ADL_COLORS = ['#2EBD85', '#8ED9B6', '#FCD535', '#F0B90B', '#F6465D'];

export default function PositionCard({
  pos,
  state,
  marks,
  pricePrecision,
  onTpsl,
  onClose,
  onLeverage,
  onRealized,
}: {
  pos: Position;
  state: EngineState;
  marks: Record<string, number>;
  pricePrecision: number;
  qtyPrecision?: number;
  onTpsl: () => void;
  onClose: () => void;
  onLeverage: () => void;
  onReverse?: () => void;
  onMargin?: () => void;
  onRealized?: () => void;
}) {
  const mark = marks[pos.symbol] ?? pos.entryPrice;
  const upnl = unrealizedPnl(pos, mark);
  const lp = positionLiquidationPrice(state, pos, mark, marks);
  const roe = pos.initialMargin > 0 ? (upnl / pos.initialMargin) * 100 : 0;
  const notional = pos.qty * mark;
  const maint = maintenanceMargin(pos.symbol, notional);
  const marginBal =
    pos.marginMode === 'ISOLATED' ? pos.isolatedWallet + upnl : state.walletBalance + upnl;
  const marginRatio = marginBal > 0 ? (maint / marginBal) * 100 : 100;
  const dist = lp != null ? distToLiqPct(pos.side, mark, lp) : 100;
  const danger = dist < 20;
  const critical = dist < 10;
  const lights = adlLights(pos, mark);
  const realized = positionRealized(state.trades, pos.id).total;
  const showLp = !(pos.marginMode === 'CROSSED' && dist > 40);
  const [shareHint, setShareHint] = useState(false);

  useEffect(() => {
    if (critical) void vibrateLiqWarn();
  }, [critical, mark]);

  return (
    <div className={`border-b border-bn-line px-3 py-3 ${danger ? 'animate-pulseRed' : ''}`}>
      <div className="flex items-center gap-1.5 text-[13px]">
        <span
          className={`flex h-4 w-4 items-center justify-center text-[10px] font-semibold text-white ${
            pos.side === 'LONG' ? 'bg-bn-green' : 'bg-bn-red'
          }`}
        >
          {pos.side === 'LONG' ? '多' : '空'}
        </span>
        <span className="font-medium">{pos.symbol}</span>
        <span className="rounded bg-bn-input px-1 py-px text-[10px] text-bn-muted">永续</span>
        <span className="rounded bg-bn-input px-1 py-px text-[10px] text-bn-muted">
          {pos.marginMode === 'ISOLATED' ? '逐仓' : '全仓'}
          {pos.leverage}x
        </span>
        <span className="ml-auto flex items-end gap-[2px]" title="ADL">
          {Array.from({ length: 5 }).map((_, i) => (
            <span
              key={i}
              className="w-[3px] rounded-sm"
              style={{
                height: 8 + i * 2,
                background: i < lights ? ADL_COLORS[i] : '#EAECEF',
              }}
            />
          ))}
        </span>
      </div>

      <div className="mt-2 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1">
            <DashLabel className="text-[11px]">盈亏 (USDT)</DashLabel>
            <button
              type="button"
              aria-label="分享"
              onClick={() => {
                setShareHint(true);
                setTimeout(() => setShareHint(false), 800);
              }}
              className="text-bn-muted"
            >
              ⤴
            </button>
            {shareHint && <span className="text-[10px] text-bn-hint">已保存</span>}
          </div>
          <div className={`text-[26px] font-bold leading-tight tn ${pnlClass(upnl)}`}>{fmtPnl(upnl)}</div>
        </div>
        <div className="text-right">
          <DashLabel className="text-[11px]">回报率</DashLabel>
          <div className={`text-[26px] font-bold leading-tight tn ${pnlClass(roe)}`}>{fmtPct(roe)}</div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-x-2 gap-y-2 text-[12px]">
        <Cell label="持仓数量 (USDT)" value={fmtNum(notional, 2)} />
        <Cell label="保证金 (USDT)" value={fmtNum(pos.isolatedWallet, 2)} />
        <Cell label="保证金比率" value={`${fmtNum(marginRatio, 2)}%`} />
        <Cell label="开仓价格 (USDT)" value={fmtNum(pos.entryPrice, pricePrecision)} />
        <Cell label="标记价格 (USDT)" value={fmtNum(mark, pricePrecision)} />
        <Cell label="强平价格 (USDT)" value={showLp && lp != null ? fmtNum(lp, pricePrecision) : '--'} />
      </div>

      <div className="mt-2">
        <div className="mb-1 text-[10px] text-bn-muted">距强平 {fmtNum(dist, 2)}%</div>
        <div className="h-1 overflow-hidden rounded bg-bn-input">
          <div
            className="h-full"
            style={{
              width: `${Math.max(2, Math.min(100, dist))}%`,
              background: dist < 10 ? '#F6465D' : dist < 20 ? '#FCD535' : '#2EBD85',
            }}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onRealized}
        className="mt-2 flex h-9 w-full items-center justify-between rounded-lg border border-bn-line px-3 text-[13px]"
      >
        <DashLabel>实现盈亏 (USDT)</DashLabel>
        <span className={`tn ${pnlClass(realized)}`}>
          {fmtPnl(realized)} <span className="text-bn-muted">›</span>
        </span>
      </button>

      <div className="mt-3 flex gap-2">
        <Op onClick={onLeverage}>杠杆</Op>
        <Op onClick={onTpsl}>止盈/止损</Op>
        <Op onClick={onClose}>平仓</Op>
      </div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <DashLabel className="text-[11px]">{label}</DashLabel>
      <div className="mt-0.5 text-[15px] text-bn-text tn">{value}</div>
    </div>
  );
}

function Op({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 flex-1 rounded-lg bg-bn-input text-[12px] text-bn-text"
    >
      {children}
    </button>
  );
}
