export function fmtNum(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtPnl(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—';
  const body = fmtNum(Math.abs(n), digits);
  if (n > 0) return `+${body}`;
  if (n < 0) return `-${body}`;
  return body;
}

export function fmtPct(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—';
  const body = Math.abs(n).toFixed(digits);
  if (n > 0) return `+${body}%`;
  if (n < 0) return `-${body}%`;
  return `${body}%`;
}

export function pnlClass(n: number): string {
  if (n > 0) return 'text-bn-green';
  if (n < 0) return 'text-bn-red';
  return 'text-bn-muted';
}

/** 订单簿总额：30.61K / 1.20M */
export function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(2)}K`;
  return `${sign}${abs.toFixed(2)}`;
}

/** 成交量中文 compact：927.60万 */
export function fmtVolCn(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(2)}亿`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(2)}万`;
  return fmtNum(n, 2);
}

export function fmtPrice(n: number, precision = 2): string {
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(precision);
}

export function fmtQty(n: number, precision = 4): string {
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(precision).replace(/\.?0+$/, (m) => (m.startsWith('.') ? m.replace(/0+$/, '').replace(/\.$/, '') : m));
}

export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (x: number) => x.toString().padStart(2, '0');
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms} 毫秒`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分 ${s % 60} 秒`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} 小时 ${m % 60} 分`;
  const d = Math.floor(h / 24);
  return `${d} 天 ${h % 24} 小时`;
}

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function floorToStep(value: number, step: number): number {
  if (step <= 0) return value;
  const precision = Math.max(0, Math.round(-Math.log10(step)));
  const rounded = Math.floor(value / step + 1e-12) * step;
  return Number(rounded.toFixed(precision));
}

export function roundToStep(value: number, step: number): number {
  if (step <= 0) return value;
  const precision = Math.max(0, Math.round(-Math.log10(step)));
  const rounded = Math.round(value / step) * step;
  return Number(rounded.toFixed(precision));
}
