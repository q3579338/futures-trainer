import { useEffect, useRef, useState } from 'react';
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Kline } from '../market/rest';
import { boll, ema, kdj, macd, rsi, sma } from '../lib/indicators';

export type OverlayId = 'MA' | 'EMA' | 'BOLL';
export type PaneId = 'VOL' | 'MACD' | 'RSI' | 'KDJ';
export type ChartKind = 'candle' | 'line';

export default function KlineChart({
  klines,
  entry,
  liq,
  pending,
  tpsl,
  overlay = 'MA',
  pane = 'VOL',
  kind = 'candle',
  markers,
}: {
  klines: Kline[];
  entry?: number;
  liq?: number;
  pending?: number[];
  tpsl?: number[];
  overlay?: OverlayId;
  pane?: PaneId;
  kind?: ChartKind;
  markers?: Array<{ time: number; position: 'belowBar' | 'aboveBar'; color: string; shape: 'arrowUp' | 'arrowDown'; text: string }>;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const paneWrap = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const paneRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lineRef = useRef<ISeriesApi<'Line'> | null>(null);
  const lines = useRef<IPriceLine[]>([]);
  const [readout, setReadout] = useState<string>('');

  useEffect(() => {
    if (!wrap.current) return;
    const chart = createChart(wrap.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#FFFFFF' },
        textColor: '#707A8A',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#EAECEF' },
        horzLines: { color: '#EAECEF' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#EAECEF' },
      timeScale: { borderColor: '#EAECEF', timeVisible: true, secondsVisible: false },
      autoSize: true,
    });
    chartRef.current = chart;
    const ro = new ResizeObserver(() =>
      chart.applyOptions({ width: wrap.current?.clientWidth, height: wrap.current?.clientHeight }),
    );
    ro.observe(wrap.current);
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      lineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!paneWrap.current) return;
    const chart = createChart(paneWrap.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#FFFFFF' },
        textColor: '#707A8A',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: '#EAECEF' },
        horzLines: { color: '#EAECEF' },
      },
      rightPriceScale: { borderColor: '#EAECEF' },
      timeScale: { visible: false },
      autoSize: true,
    });
    paneRef.current = chart;
    const ro = new ResizeObserver(() =>
      chart.applyOptions({ width: paneWrap.current?.clientWidth, height: paneWrap.current?.clientHeight }),
    );
    ro.observe(paneWrap.current);
    return () => {
      ro.disconnect();
      chart.remove();
      paneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (candleRef.current) {
      chart.removeSeries(candleRef.current);
      candleRef.current = null;
    }
    if (lineRef.current) {
      chart.removeSeries(lineRef.current);
      lineRef.current = null;
    }
    if (kind === 'line') {
      const s = chart.addLineSeries({ color: '#FCD535', lineWidth: 2 });
      s.setData(klines.map((k) => ({ time: k.time as UTCTimestamp, value: k.close })));
      lineRef.current = s;
    } else {
      const s = chart.addCandlestickSeries({
        upColor: '#2EBD85',
        downColor: '#F6465D',
        borderVisible: false,
        wickUpColor: '#2EBD85',
        wickDownColor: '#F6465D',
      });
      s.setData(
        klines.map((k) => ({
          time: k.time as UTCTimestamp,
          open: k.open,
          high: k.high,
          low: k.low,
          close: k.close,
        })),
      );
      candleRef.current = s;
    }
    chart.timeScale().fitContent();
  }, [klines, kind]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const closes = klines.map((k) => k.close);
    const extra: ISeriesApi<'Line'>[] = [];
    if (overlay === 'MA') {
      for (const [p, color] of [
        [7, '#FCD535'],
        [25, '#00B4C9'],
        [99, '#B15CFF'],
      ] as const) {
        const arr = sma(closes, p);
        const s = chart.addLineSeries({ color, lineWidth: 1, priceLineVisible: false });
        s.setData(
          klines
            .map((k, i) => (arr[i] != null ? { time: k.time as UTCTimestamp, value: arr[i]! } : null))
            .filter((x): x is { time: UTCTimestamp; value: number } => x != null),
        );
        extra.push(s);
      }
    } else if (overlay === 'EMA') {
      const arr = ema(closes, 21);
      const s = chart.addLineSeries({ color: '#F0B90B', lineWidth: 1, priceLineVisible: false });
      s.setData(
        klines
          .map((k, i) => (arr[i] != null ? { time: k.time as UTCTimestamp, value: arr[i]! } : null))
          .filter((x): x is { time: UTCTimestamp; value: number } => x != null),
      );
      extra.push(s);
    } else if (overlay === 'BOLL') {
      const b = boll(closes, 20, 2);
      const cols = ['#707A8A', '#FCD535', '#707A8A'] as const;
      for (const [arr, color] of [
        [b.upper, cols[0]],
        [b.mid, cols[1]],
        [b.lower, cols[2]],
      ] as const) {
        const s = chart.addLineSeries({ color, lineWidth: 1, priceLineVisible: false });
        s.setData(
          klines
            .map((k, i) => (arr[i] != null ? { time: k.time as UTCTimestamp, value: arr[i]! } : null))
            .filter((x): x is { time: UTCTimestamp; value: number } => x != null),
        );
        extra.push(s);
      }
    }
    return () => {
      for (const s of extra) {
        try {
          chart.removeSeries(s);
        } catch {
          /* chart may be gone */
        }
      }
    };
  }, [klines, overlay, kind]);

  useEffect(() => {
    const host = candleRef.current ?? lineRef.current;
    if (!host) return;
    for (const l of lines.current) host.removePriceLine(l);
    lines.current = [];
    const add = (price: number, color: string, title: string, style: LineStyle, width: 1 | 2 = 1) => {
      if (!(price > 0)) return;
      lines.current.push(
        host.createPriceLine({
          price,
          color,
          lineWidth: width,
          lineStyle: style,
          axisLabelVisible: true,
          title,
        }),
      );
    };
    if (entry) add(entry, '#FCD535', '开仓均价', LineStyle.Dashed);
    if (liq) add(liq, '#F6465D', `强平 ${liq.toFixed(2)}`, LineStyle.Solid, 2);
    for (const p of pending ?? []) add(p, '#707A8A', '挂单', LineStyle.Dotted);
    for (const p of tpsl ?? []) add(p, '#F0B90B', '止盈止损', LineStyle.Dashed);
  }, [entry, liq, pending, tpsl, klines.length, kind]);

  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;
    if (!markers || markers.length === 0) {
      series.setMarkers([]);
      return;
    }
    series.setMarkers(
      markers.map((m) => ({
        time: m.time as UTCTimestamp,
        position: m.position,
        color: m.color,
        shape: m.shape,
        text: m.text,
      })),
    );
  }, [markers, kind]);

  useEffect(() => {
    const pchart = paneRef.current;
    if (!pchart) return;
    const times = klines.map((k) => k.time as UTCTimestamp);
    const created: Array<ISeriesApi<'Line'> | ISeriesApi<'Histogram'>> = [];
    if (pane === 'VOL') {
      const h = pchart.addHistogramSeries({
        priceFormat: { type: 'volume' },
      });
      h.setData(
        klines.map((k) => ({
          time: k.time as UTCTimestamp,
          value: k.volume,
          color: k.close >= k.open ? 'rgba(46,189,133,0.6)' : 'rgba(246,70,93,0.6)',
        })),
      );
      created.push(h);
    } else if (pane === 'MACD') {
      const m = macd(klines.map((k) => k.close));
      const hist = pchart.addHistogramSeries();
      hist.setData(
        times
          .map((t, i) => (m.hist[i] != null ? { time: t, value: m.hist[i]!, color: m.hist[i]! >= 0 ? '#2EBD85' : '#F6465D' } : null))
          .filter((x): x is { time: UTCTimestamp; value: number; color: string } => x != null),
      );
      const dif = pchart.addLineSeries({ color: '#FCD535', lineWidth: 1 });
      dif.setData(
        times
          .map((t, i) => (m.dif[i] != null ? { time: t, value: m.dif[i]! } : null))
          .filter((x): x is { time: UTCTimestamp; value: number } => x != null),
      );
      const dea = pchart.addLineSeries({ color: '#00B4C9', lineWidth: 1 });
      dea.setData(
        times
          .map((t, i) => (m.dea[i] != null ? { time: t, value: m.dea[i]! } : null))
          .filter((x): x is { time: UTCTimestamp; value: number } => x != null),
      );
      created.push(hist, dif, dea);
    } else if (pane === 'RSI') {
      const r = rsi(klines.map((k) => k.close));
      const s = pchart.addLineSeries({ color: '#F0B90B', lineWidth: 1 });
      s.setData(
        times
          .map((t, i) => (r[i] != null ? { time: t, value: r[i]! } : null))
          .filter((x): x is { time: UTCTimestamp; value: number } => x != null),
      );
      created.push(s);
    } else if (pane === 'KDJ') {
      const k = kdj(
        klines.map((x) => x.high),
        klines.map((x) => x.low),
        klines.map((x) => x.close),
      );
      const ks = pchart.addLineSeries({ color: '#FCD535', lineWidth: 1 });
      const ds = pchart.addLineSeries({ color: '#00B4C9', lineWidth: 1 });
      const js = pchart.addLineSeries({ color: '#B15CFF', lineWidth: 1 });
      ks.setData(times.map((t, i) => (k.k[i] != null ? { time: t, value: k.k[i]! } : null)).filter((x): x is { time: UTCTimestamp; value: number } => x != null));
      ds.setData(times.map((t, i) => (k.d[i] != null ? { time: t, value: k.d[i]! } : null)).filter((x): x is { time: UTCTimestamp; value: number } => x != null));
      js.setData(times.map((t, i) => (k.j[i] != null ? { time: t, value: k.j[i]! } : null)).filter((x): x is { time: UTCTimestamp; value: number } => x != null));
      created.push(ks, ds, js);
    }
    if (chartRef.current) {
      pchart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range) chartRef.current?.timeScale().setVisibleLogicalRange(range);
      });
    }
    return () => {
      for (const s of created) {
        try {
          pchart.removeSeries(s);
        } catch {
          /* ignore */
        }
      }
    };
  }, [klines, pane]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = candleRef.current ?? lineRef.current;
    if (!chart || !series) return;
    chart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        setReadout('');
        return;
      }
      const raw = param.seriesData.get(series) as
        | { open?: number; high?: number; low?: number; close?: number; value?: number }
        | undefined;
      if (!raw) {
        setReadout('');
        return;
      }
      if (raw.close != null) {
        setReadout(`O ${raw.open}  H ${raw.high}  L ${raw.low}  C ${raw.close}`);
      } else if (raw.value != null) {
        setReadout(`C ${raw.value}`);
      }
    });
  }, [klines, kind]);

  return (
    <div className="flex h-full w-full flex-col">
      {readout && <div className="px-2 py-0.5 text-[10px] text-bn-muted tn">{readout}</div>}
      <div ref={wrap} className="min-h-0 flex-[3]" />
      <div ref={paneWrap} className="min-h-0 flex-1 border-t border-bn-line" />
    </div>
  );
}
