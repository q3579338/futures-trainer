import { useEffect, useMemo, useState } from 'react';
import FullScreen from '../components/FullScreen';
import KlineChart from '../components/KlineChart';
import MiniBars from '../components/MiniBars';
import { computeReviewStats } from '../engine/stats';
import type { TradeRecord } from '../engine/types';
import { fmtCompact, fmtDuration, fmtNum, fmtPct, fmtPnl, fmtTime, pnlClass } from '../lib/format';
import {
  dailyPnlSeries,
  equityAt,
  pnlPct,
  rangeStart,
  startOfLocalDay,
  sumRealized,
  type PnlRangeKey,
} from '../lib/pnlAnalysis';
import { fetchKlines, type Kline } from '../market/rest';
import { useSimStore } from '../store/simStore';

type ReviewTab = 'overview' | 'detail' | 'analysis' | 'fees';
type ChartKind = 'bar' | 'cal';

const RANGE_PILLS: { id: PnlRangeKey; label: string }[] = [
  { id: '7d', label: '7日' },
  { id: '1m', label: '近1个月' },
  { id: '3m', label: '近3个月' },
  { id: '1y', label: '近1年' },
];

export default function ReviewPage({ onBack }: { onBack: () => void }) {
  const sim = useSimStore();
  const now = Date.now();
  const stats = useMemo(
    () => computeReviewStats(sim.state.trades, sim.state.deposits, sim.state.snapshots),
    [sim.state.trades, sim.state.deposits, sim.state.snapshots],
  );
  const [detail, setDetail] = useState<TradeRecord | null>(null);
  const [detailK, setDetailK] = useState<Kline[]>([]);
  const [hide, setHide] = useState(false);
  const [range, setRange] = useState<PnlRangeKey>('7d');
  const [tab, setTab] = useState<ReviewTab>('overview');
  const [chart, setChart] = useState<ChartKind>('bar');

  useEffect(() => {
    if (!detail || detail.type === 'DEPOSIT') return;
    const openMs = detail.time - (detail.holdMs ?? 0);
    const start = openMs - 30 * 60 * 1000;
    const end = detail.time + 30 * 60 * 1000;
    void fetchKlines(detail.symbol, '1m', 500, start, end).then(setDetailK);
  }, [detail]);

  const closed = sim.state.trades.filter((t) => t.type === 'CLOSE' || t.type === 'LIQUIDATION');
  const fallbackEq = sim.state.totalDeposited || 1;
  const todayFrom = startOfLocalDay(now);
  const d7 = todayFrom - 6 * 86400_000;
  const d30 = todayFrom - 29 * 86400_000;
  const today = sumRealized(sim.state.trades, todayFrom, now);
  const week = sumRealized(sim.state.trades, d7, now);
  const month = sumRealized(sim.state.trades, d30, now);
  const all = sumRealized(sim.state.trades, 0, now);
  const todayStart = equityAt(sim.state.snapshots, todayFrom, fallbackEq);
  const weekStart = equityAt(sim.state.snapshots, d7, fallbackEq);
  const monthStart = equityAt(sim.state.snapshots, d30, fallbackEq);
  const from = rangeStart(range, now);
  const period = sumRealized(sim.state.trades, from, now);
  const days = dailyPnlSeries(sim.state.trades, from, now);
  const lastDay = days[days.length - 1];
  const mask = (s: string) => (hide ? '****' : s);
  const tiltBuckets = [0, 1, 2, 3, 4, 5].map((n) => ({
    label: String(n),
    value: closed.filter((t) => Math.round(t.tiltScore ?? 0) === n).length,
  }));

  return (
    <FullScreen
      title="合约盈亏分析 ▼"
      onBack={onBack}
      extra={
        <button type="button" className="px-2 text-bn-muted" aria-label="分享">
          ⤴
        </button>
      }
    >
      <div className="px-3 pb-6">
        <div className="flex gap-4 pt-1 text-[14px]">
          <span className="border-b-2 border-bn-text pb-1 font-semibold">U本位</span>
          <span className="text-bn-muted">币本位</span>
        </div>

        <button type="button" onClick={() => setHide((v) => !v)} className="mt-3 flex items-center gap-1 text-[12px] text-bn-muted">
          今日盈亏 {hide ? '🙈' : '👁'}
        </button>
        <div className="mt-1 flex items-baseline gap-2">
          <span className={`text-[32px] font-bold tn ${pnlClass(today.net)}`}>{mask(fmtPct(pnlPct(today.net, todayStart)))}</span>
          <span className="text-[15px] text-bn-muted tn">{mask(`≈ ${fmtPnl(today.net)} USD`)}</span>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 border-b border-bn-line pb-3">
          <MiniStat label="7天盈亏" pct={pnlPct(week.net, weekStart)} usd={week.net} hide={hide} />
          <MiniStat label="30日盈亏" pct={pnlPct(month.net, monthStart)} usd={month.net} hide={hide} />
          <MiniStat label="累计盈亏" pct={null} usd={all.net} hide={hide} usdOnly />
        </div>

        <div className="mt-3 flex gap-1.5 overflow-x-auto no-scrollbar">
          {RANGE_PILLS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setRange(p.id)}
              className={`h-7 shrink-0 rounded-full px-3 text-[12px] ${range === p.id ? 'bg-bn-input text-bn-text' : 'text-bn-muted'}`}
            >
              {p.label}
            </button>
          ))}
          <button type="button" disabled className="h-7 shrink-0 rounded-full px-3 text-[12px] text-bn-hint">
            自定义
          </button>
        </div>

        <div className="mt-3 space-y-1.5 text-[13px]">
          <div className="flex justify-between">
            <span className="text-bn-muted">总盈利</span>
            <span className="tn text-bn-green">{mask(fmtNum(period.win)) } USD</span>
          </div>
          <div className="flex justify-between">
            <span className="text-bn-muted">总亏损</span>
            <span className="tn text-bn-red">{mask(fmtNum(Math.abs(period.loss)))} USD</span>
          </div>
          <div className="flex justify-between">
            <span className="text-bn-muted">净盈利/亏损</span>
            <span className={`tn ${pnlClass(period.net)}`}>{mask(fmtPnl(period.net))} USD</span>
          </div>
        </div>

        <div className="mt-4 flex gap-3 overflow-x-auto border-b border-bn-line text-[13px] no-scrollbar">
          <RTab id="overview" tab={tab} on={setTab} label="总览" />
          <RTab id="detail" tab={tab} on={setTab} label="详情" />
          <RTab id="analysis" tab={tab} on={setTab} label="合约分析" />
          <RTab id="fees" tab={tab} on={setTab} label="资金费用与交易手续费" />
        </div>

        {tab === 'overview' && (
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[13px] text-bn-muted">单日盈亏</div>
                <div className="text-[12px] text-bn-hint">{lastDay?.date}</div>
                <div className={`text-[15px] tn ${pnlClass(lastDay?.pnl ?? 0)}`}>
                  {mask(fmtPnl(lastDay?.pnl ?? 0))} USD
                </div>
              </div>
              <button
                type="button"
                onClick={() => setChart((c) => (c === 'bar' ? 'cal' : 'bar'))}
                className="rounded-lg bg-bn-input px-2 py-1 text-[11px] text-bn-text"
              >
                {chart === 'bar' ? '柱状图' : '日历'}
              </button>
            </div>
            {chart === 'bar' ? <PnlBars days={days} /> : <CalHeat days={days} />}
          </div>
        )}

        {tab === 'detail' && (
          <div className="mt-3">
            {closed.length === 0 && <div className="text-sm text-bn-muted">还没有平仓记录</div>}
            {closed
              .slice()
              .reverse()
              .map((t) => (
                <button
                  key={t.id}
                  onClick={() => setDetail(t)}
                  className="mb-2 w-full rounded-xl bg-bn-faint p-3 text-left"
                >
                  <div className="flex justify-between text-sm">
                    <span>
                      {t.symbol} {t.positionSide === 'LONG' ? '多' : '空'} {t.type === 'LIQUIDATION' ? '爆仓' : '平仓'}
                    </span>
                    <span className={pnlClass(t.realizedPnl)}>{fmtPnl(t.realizedPnl)}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-bn-muted">
                    {fmtTime(t.time)} · {t.reason} · TILT {t.tiltScore ?? '—'} ·{' '}
                    {(t.tags ?? []).join(' ') || '无标签'} · 持仓 {fmtDuration(t.holdMs ?? 0)}
                  </div>
                </button>
              ))}
          </div>
        )}

        {tab === 'analysis' && (
          <div className="mt-3">
            <div className="mb-2 text-sm font-medium">按开仓理由</div>
            <div className="mb-3 overflow-hidden rounded-xl bg-bn-faint">
              {stats.byReason.map((r) => {
                const revenge = r.reason.startsWith('回血');
                return (
                  <div
                    key={r.reason}
                    className={`flex items-center justify-between border-b border-bn-line px-3 py-2 last:border-0 ${
                      revenge ? 'bg-bn-red/10' : ''
                    }`}
                  >
                    <div className={revenge ? 'text-lg font-semibold text-bn-red' : 'text-sm'}>{r.reason}</div>
                    <div className={`text-right font-mono ${revenge ? 'text-lg font-semibold text-bn-red' : 'text-xs'}`}>
                      {r.count} 笔 · 胜率 {fmtPct(r.winRate * 100, 0)} ·{' '}
                      <span className={pnlClass(r.pnl)}>{fmtPnl(r.pnl)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mb-3 rounded-xl bg-bn-red/10 p-3">
              <div className="text-xs text-bn-muted">REVENGE 回血单专项</div>
              <div className="mt-1 text-base font-medium leading-relaxed text-bn-red">{stats.revenge.sentence}</div>
            </div>
            <div className="mb-2 text-sm font-medium">按小时盈亏（本地时区）</div>
            <div className="mb-3 rounded-xl bg-bn-faint p-3">
              <MiniBars
                items={stats.hourlyPnl.map((h) => ({
                  label: `${String(h.hour).padStart(2, '0')}时`,
                  value: Number(h.pnl.toFixed(2)),
                }))}
                colorFor={(v) => (v >= 0 ? '#2EBD85' : '#F6465D')}
              />
            </div>
            <div className="mb-3 grid grid-cols-3 gap-2 text-center text-[11px]">
              <Stat label="爆仓次数" value={String(stats.liquidationCount)} />
              <Stat label="连亏" value={String(sim.state.consecutiveLosses)} />
              <Stat label="交易笔数" value={String(stats.tradeCount)} />
            </div>
            <div className="mb-2 text-sm font-medium">TILT_SCORE 分布</div>
            <div className="mb-3 rounded-xl bg-bn-faint p-3">
              <MiniBars items={tiltBuckets} />
            </div>
          </div>
        )}

        {tab === 'fees' && (
          <div className="mt-3 space-y-2 text-[13px]">
            <div className="flex justify-between">
              <span className="text-bn-muted">总手续费</span>
              <span className="tn">{fmtNum(stats.totalFee, 4)} USDT</span>
            </div>
            <div className="flex justify-between">
              <span className="text-bn-muted">总资金费</span>
              <span className="tn">{fmtNum(stats.totalFundingPaid, 4)} USDT</span>
            </div>
          </div>
        )}
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center justify-between px-3 py-2">
            <div className="text-sm">{detail.symbol} 开平打点</div>
            <button onClick={() => setDetail(null)} className="text-bn-yellow">
              关闭
            </button>
          </div>
          <div className="h-64">
            <KlineChart
              klines={detailK}
              markers={[
                {
                  time: Math.floor((detail.time - (detail.holdMs ?? 0)) / 1000),
                  position: 'belowBar',
                  color: '#FCD535',
                  shape: 'arrowUp',
                  text: '开',
                },
                {
                  time: Math.floor(detail.time / 1000),
                  position: 'aboveBar',
                  color: '#F6465D',
                  shape: 'arrowDown',
                  text: detail.type === 'LIQUIDATION' ? '爆' : '平',
                },
              ]}
            />
          </div>
          <div className="p-3 text-xs text-bn-muted">
            {fmtTime(detail.time)} 平仓价 {fmtNum(detail.price, 4)} 盈亏 {fmtPnl(detail.realizedPnl)}
            <br />
            理由 {detail.reason} · 标签 {(detail.tags ?? []).join(', ') || '无'} · TILT {detail.tiltScore}
          </div>
        </div>
      )}
    </FullScreen>
  );
}

function MiniStat({
  label,
  pct,
  usd,
  hide,
  usdOnly,
}: {
  label: string;
  pct: number | null;
  usd: number;
  hide: boolean;
  usdOnly?: boolean;
}) {
  const mask = (s: string) => (hide ? '****' : s);
  return (
    <div>
      <div className="text-[11px] text-bn-muted">{label}</div>
      {!usdOnly && pct != null && (
        <div className={`text-[15px] font-semibold tn ${pnlClass(usd)}`}>{mask(fmtPct(pct))}</div>
      )}
      <div className={`text-[12px] tn ${usdOnly ? `text-[15px] font-semibold ${pnlClass(usd)}` : 'text-bn-muted'}`}>
        {mask(`${fmtPnl(usd)} USD`)}
      </div>
    </div>
  );
}

function RTab({
  id,
  tab,
  on,
  label,
}: {
  id: ReviewTab;
  tab: ReviewTab;
  on: (t: ReviewTab) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => on(id)}
      className={`shrink-0 py-2 ${tab === id ? 'border-b-2 border-bn-yellow font-semibold text-bn-text' : 'text-bn-muted'}`}
    >
      {label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-bn-faint py-2">
      <div className="text-bn-muted">{label}</div>
      <div className="mt-1 font-mono text-sm">{value}</div>
    </div>
  );
}

function PnlBars({ days }: { days: { date: string; pnl: number }[] }) {
  if (days.length === 0) return <div className="py-8 text-center text-[12px] text-bn-muted">暂无数据</div>;
  const max = Math.max(...days.map((d) => Math.abs(d.pnl)), 1);
  const w = 320;
  const h = 140;
  const pad = 28;
  const barW = Math.max(2, (w - pad * 2) / days.length - 1);
  const y0 = h / 2;
  const ticks = [max, 0, -max];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-40 w-full">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad} x2={w - 8} y1={y0 - (t / max) * (h / 2 - 8)} y2={y0 - (t / max) * (h / 2 - 8)} stroke="#EAECEF" />
          <text x={0} y={y0 - (t / max) * (h / 2 - 8) + 3} fill="#929AA5" fontSize="8">
            {fmtCompact(t)}
          </text>
        </g>
      ))}
      {days.map((d, i) => {
        const x = pad + i * ((w - pad * 2) / days.length);
        const bh = (Math.abs(d.pnl) / max) * (h / 2 - 10);
        const y = d.pnl >= 0 ? y0 - bh : y0;
        return <rect key={d.date} x={x} y={y} width={barW} height={Math.max(1, bh)} fill={d.pnl >= 0 ? '#2EBD85' : '#F6465D'} />;
      })}
      <text x={pad} y={h - 2} fill="#929AA5" fontSize="8">
        {days[0]?.date.slice(5)}
      </text>
      <text x={w - 40} y={h - 2} fill="#929AA5" fontSize="8">
        {days[days.length - 1]?.date.slice(5)}
      </text>
    </svg>
  );
}

function CalHeat({ days }: { days: { date: string; pnl: number }[] }) {
  const max = Math.max(...days.map((d) => Math.abs(d.pnl)), 1);
  return (
    <div className="mt-2 grid grid-cols-7 gap-1">
      {days.map((d) => {
        const a = Math.min(1, Math.abs(d.pnl) / max);
        const bg = d.pnl > 0 ? `rgba(46,189,133,${0.15 + a * 0.85})` : d.pnl < 0 ? `rgba(246,70,93,${0.15 + a * 0.85})` : '#F5F5F5';
        return (
          <div key={d.date} className="rounded p-1 text-center text-[9px]" style={{ background: bg }}>
            <div className="text-bn-hint">{d.date.slice(8)}</div>
            <div className="tn">{fmtCompact(d.pnl)}</div>
          </div>
        );
      })}
    </div>
  );
}
