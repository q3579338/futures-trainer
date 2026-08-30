import { useState } from 'react';
import type { Interval } from '../market/ws';
import { ALL_INTERVALS, INTERVAL_LABELS } from '../lib/tradeUi';
import FullScreen from './FullScreen';
import KlineChart, { type ChartKind, type OverlayId, type PaneId } from './KlineChart';
import type { Kline } from '../market/rest';

export default function KlinePage({
  symbol,
  klines,
  interval,
  onInterval,
  entry,
  liq,
  pending,
  tpsl,
  onBack,
}: {
  symbol: string;
  klines: Kline[];
  interval: Interval;
  onInterval: (i: Interval) => void;
  entry?: number;
  liq?: number;
  pending?: number[];
  tpsl?: number[];
  onBack: () => void;
}) {
  const [overlay, setOverlay] = useState<OverlayId>('MA');
  const [pane, setPane] = useState<PaneId>('VOL');
  const [kind, setKind] = useState<ChartKind>('candle');
  const [land, setLand] = useState(false);

  const body = (
    <>
      <div className="flex gap-1 overflow-x-auto px-2 py-1.5 no-scrollbar">
        {ALL_INTERVALS.map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => onInterval(i)}
            className={`shrink-0 rounded px-2 py-1 text-[12px] ${interval === i ? 'bg-bn-input text-bn-yellow' : 'text-bn-muted'}`}
          >
            {INTERVAL_LABELS[i] ?? i}
          </button>
        ))}
      </div>
      <div className="flex gap-1 overflow-x-auto px-2 pb-1 text-[11px] no-scrollbar">
        <Chip on={() => setKind(kind === 'candle' ? 'line' : 'candle')} active>
          {kind === 'candle' ? '蜡烛' : '分时'}
        </Chip>
        {(['MA', 'EMA', 'BOLL'] as OverlayId[]).map((id) => (
          <Chip key={id} on={() => setOverlay(id)} active={overlay === id}>
            {id === 'MA' ? 'MA(7,25,99)' : id}
          </Chip>
        ))}
        {(['VOL', 'MACD', 'RSI', 'KDJ'] as PaneId[]).map((id) => (
          <Chip key={id} on={() => setPane(id)} active={pane === id}>
            {id === 'VOL' ? '成交量' : id}
          </Chip>
        ))}
        <Chip on={() => setLand((v) => !v)} active={land}>
          {land ? '退出全屏' : '横屏全屏'}
        </Chip>
      </div>
      <div className={land ? 'h-full min-h-0 flex-1' : 'h-[70vh]'}>
        <KlineChart
          klines={klines}
          entry={entry}
          liq={liq}
          pending={pending}
          tpsl={tpsl}
          overlay={overlay}
          pane={pane}
          kind={kind}
        />
      </div>
    </>
  );

  if (land) {
    return (
      <div
        className="fixed z-[60] bg-bn-bg"
        style={{
          top: 0,
          left: '100vw',
          width: '100dvh',
          height: '100dvw',
          transform: 'rotate(90deg)',
          transformOrigin: 'top left',
        }}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-9 items-center justify-between px-2 text-[13px]">
            <span>
              {symbol} 永续
            </span>
            <button type="button" onClick={() => setLand(false)} className="text-bn-yellow">
              退出横屏
            </button>
          </div>
          {body}
        </div>
      </div>
    );
  }

  return (
    <FullScreen title={`${symbol} 永续`} onBack={onBack}>
      {body}
    </FullScreen>
  );
}

function Chip({ children, on, active }: { children: string; on: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={on}
      className={`shrink-0 rounded px-2 py-0.5 ${active ? 'bg-bn-input text-bn-yellow' : 'text-bn-muted'}`}
    >
      {children}
    </button>
  );
}
