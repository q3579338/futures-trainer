import { SLIDER_NODES } from '../lib/tradeUi';

const DOTS = [25, 50, 75, 100];

export default function PercentSlider({
  value,
  onChange,
  nodes = SLIDER_NODES as unknown as number[],
}: {
  value: number;
  onChange: (n: number) => void;
  nodes?: number[];
}) {
  const pct = Math.max(0, Math.min(100, value));
  const min = nodes[0] ?? 0;
  const max = nodes[nodes.length - 1] ?? 100;
  const span = Math.max(1, max - min);
  const x = (n: number) => `calc(8px + (100% - 16px) * ${(n - min) / span})`;
  return (
    <div className="relative h-8 px-1">
      <div className="absolute left-2 right-2 top-1/2 h-[2px] -translate-y-1/2 bg-bn-line" />
      <div
        className="absolute left-2 top-1/2 h-[2px] -translate-y-1/2 bg-bn-yellow"
        style={{ width: `calc((100% - 16px) * ${(pct - min) / span})` }}
      />
      {DOTS.filter((n) => n >= min && n <= max).map((n) => {
        const filled = pct + 0.01 >= n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`absolute top-1/2 z-[1] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border ${
              filled ? 'border-bn-yellow bg-white' : 'border-bn-line bg-white'
            }`}
            style={{ left: x(n) }}
            aria-label={`${n}%`}
          />
        );
      })}
      <div
        className="pointer-events-none absolute top-1/2 z-[2] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-[1.5px] border-bn-yellow bg-white"
        style={{ left: x(pct) }}
        aria-hidden
      />
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={pct}
        onChange={(e) => onChange(Number(e.target.value))}
        className="absolute inset-0 z-10 w-full cursor-pointer opacity-0"
        aria-label="0%"
      />
    </div>
  );
}
