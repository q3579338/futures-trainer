export function sma(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

export function ema(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = [];
  if (period <= 0) return values.map(() => null);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    if (prev == null) {
      let s = 0;
      for (let j = i - period + 1; j <= i; j++) s += values[j]!;
      prev = s / period;
    } else {
      prev = v * k + prev * (1 - k);
    }
    out.push(prev);
  }
  return out;
}

export function boll(
  values: number[],
  period = 20,
  k = 2,
): { mid: Array<number | null>; upper: Array<number | null>; lower: Array<number | null> } {
  const mid = sma(values, period);
  const upper: Array<number | null> = [];
  const lower: Array<number | null> = [];
  for (let i = 0; i < values.length; i++) {
    if (mid[i] == null) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    let ss = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = values[j]! - mid[i]!;
      ss += d * d;
    }
    const sd = Math.sqrt(ss / period);
    upper.push(mid[i]! + k * sd);
    lower.push(mid[i]! - k * sd);
  }
  return { mid, upper, lower };
}

export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signalP = 9,
): { dif: Array<number | null>; dea: Array<number | null>; hist: Array<number | null> } {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const dif: Array<number | null> = values.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? emaFast[i]! - emaSlow[i]! : null,
  );
  const difNums = dif.map((x) => x ?? 0);
  const deaRaw = ema(difNums, signalP);
  const dea: Array<number | null> = deaRaw.map((x, i) => (dif[i] == null ? null : x));
  const hist: Array<number | null> = dif.map((d, i) => (d != null && dea[i] != null ? d - dea[i]! : null));
  return { dif, dea, hist };
}

export function rsi(values: number[], period = 14): Array<number | null> {
  const out: Array<number | null> = [null];
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < values.length; i++) {
    const ch = values[i]! - values[i - 1]!;
    const gain = Math.max(0, ch);
    const loss = Math.max(0, -ch);
    if (i <= period) {
      avgGain += gain;
      avgLoss += loss;
      if (i < period) {
        out.push(null);
        continue;
      }
      avgGain /= period;
      avgLoss /= period;
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    if (avgLoss === 0) out.push(100);
    else {
      const rs = avgGain / avgLoss;
      out.push(100 - 100 / (1 + rs));
    }
  }
  return out;
}

export function kdj(
  highs: number[],
  lows: number[],
  closes: number[],
  n = 9,
  m1 = 3,
  m2 = 3,
): { k: Array<number | null>; d: Array<number | null>; j: Array<number | null> } {
  const rsv: Array<number | null> = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < n - 1) {
      rsv.push(null);
      continue;
    }
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - n + 1; j <= i; j++) {
      hh = Math.max(hh, highs[j]!);
      ll = Math.min(ll, lows[j]!);
    }
    const den = hh - ll;
    rsv.push(den === 0 ? 50 : ((closes[i]! - ll) / den) * 100);
  }
  const k: Array<number | null> = [];
  const d: Array<number | null> = [];
  const j: Array<number | null> = [];
  let prevK = 50;
  let prevD = 50;
  for (let i = 0; i < rsv.length; i++) {
    if (rsv[i] == null) {
      k.push(null);
      d.push(null);
      j.push(null);
      continue;
    }
    prevK = (rsv[i]! + (m1 - 1) * prevK) / m1;
    prevD = (prevK + (m2 - 1) * prevD) / m2;
    k.push(prevK);
    d.push(prevD);
    j.push(3 * prevK - 2 * prevD);
  }
  return { k, d, j };
}
