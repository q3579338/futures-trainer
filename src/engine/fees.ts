/**
 * 币安 USDⓈ-M 合约手续费分层（不含 BNB 抵扣）。
 * 默认按 VIP2 计算（用户账户等级）；等级存在 EngineState.feeTier，可在偏好设置里改。
 */
export interface FeeTier {
  level: number;
  maker: number;
  taker: number;
}

export const FEE_TIERS: readonly FeeTier[] = [
  { level: 0, maker: 0.0002, taker: 0.0005 },
  { level: 1, maker: 0.00016, taker: 0.0004 },
  { level: 2, maker: 0.00014, taker: 0.00035 },
  { level: 3, maker: 0.00012, taker: 0.00032 },
  { level: 4, maker: 0.0001, taker: 0.0003 },
  { level: 5, maker: 0.00008, taker: 0.00027 },
  { level: 6, maker: 0.00006, taker: 0.00025 },
  { level: 7, maker: 0.00004, taker: 0.00022 },
  { level: 8, maker: 0.00002, taker: 0.0002 },
  { level: 9, maker: 0, taker: 0.00017 },
];

export const DEFAULT_FEE_TIER = 2;

/** VIP0 费率常量（保留给旧代码/测试引用） */
export const MAKER_RATE = FEE_TIERS[0]!.maker;
export const TAKER_RATE = FEE_TIERS[0]!.taker;

export function normalizeFeeTier(level: number | undefined | null): number {
  if (level == null || !Number.isFinite(level)) return DEFAULT_FEE_TIER;
  const n = Math.round(level);
  return Math.min(FEE_TIERS.length - 1, Math.max(0, n));
}

export function feeTierOf(level?: number | null): FeeTier {
  return FEE_TIERS[normalizeFeeTier(level)]!;
}

export function feeRate(isMaker: boolean, level?: number | null): number {
  const t = feeTierOf(level);
  return isMaker ? t.maker : t.taker;
}

/** 手续费 = 成交名义价值 × 费率。市价/吃单=taker，挂单被动成交=maker。 */
export function calcFee(notional: number, isMaker: boolean, level?: number | null): number {
  return Math.abs(notional) * feeRate(isMaker, level);
}

/** "0.0140%" 这种展示用的百分比字符串 */
export function fmtFeeRate(rate: number): string {
  return `${(rate * 100).toFixed(4)}%`;
}

export function feeTierLabel(level?: number | null): string {
  const t = feeTierOf(level);
  return `VIP${t.level} · Maker ${fmtFeeRate(t.maker)} / Taker ${fmtFeeRate(t.taker)}`;
}
