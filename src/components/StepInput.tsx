import { useRef, type ReactNode } from 'react';

function useHoldRepeat(fn: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  const start = () => {
    fn();
    const t0 = Date.now();
    const loop = () => {
      fn();
      const delay = Date.now() - t0 > 1400 ? 50 : 140;
      timer.current = setTimeout(loop, delay);
    };
    timer.current = setTimeout(loop, 380);
  };
  return {
    onPointerDown: start,
    onPointerUp: stop,
    onPointerCancel: stop,
    onPointerLeave: stop,
  };
}

export default function StepInput({
  label,
  value,
  onChange,
  onStep,
  unit,
  unitMenu,
  placeholder,
  disabled,
  showPlus = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onStep: (dir: 1 | -1) => void;
  unit?: string;
  unitMenu?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  showPlus?: boolean;
}) {
  const dec = useHoldRepeat(() => onStep(-1));
  const inc = useHoldRepeat(() => onStep(1));
  return (
    <div className={`flex h-11 items-center rounded-lg bg-bn-input ${disabled ? 'opacity-60' : ''}`}>
      <button
        type="button"
        disabled={disabled}
        className="flex h-full w-8 shrink-0 items-center justify-center text-[16px] text-bn-muted"
        {...dec}
      >
        −
      </button>
      <div className="relative min-w-0 flex-1">
        {!disabled && label ? (
          <span className="pointer-events-none absolute left-0 top-1 text-[10px] leading-none text-bn-muted">
            {label}
          </span>
        ) : null}
        {disabled ? (
          <div className="px-1 text-center text-[13px] text-bn-muted">{placeholder ?? '市价'}</div>
        ) : (
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            inputMode="decimal"
            className={`h-11 w-full bg-transparent text-center text-[13px] text-bn-text outline-none tn placeholder:text-bn-hint ${label ? 'pt-2' : ''}`}
          />
        )}
      </div>
      {unitMenu ?? (unit ? <span className="px-1 text-[11px] text-bn-text">{unit}</span> : null)}
      {showPlus && (
        <button
          type="button"
          disabled={disabled}
          className="flex h-full w-8 shrink-0 items-center justify-center text-[16px] text-bn-muted"
          {...inc}
        >
          ＋
        </button>
      )}
    </div>
  );
}
