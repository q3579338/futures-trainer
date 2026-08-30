/** VIP0 手续费：maker 0.0200%，taker 0.0500% */
export const MAKER_RATE = 0.0002;
export const TAKER_RATE = 0.0005;

export function feeRate(isMaker: boolean): number {
  return isMaker ? MAKER_RATE : TAKER_RATE;
}

/** 手续费 = 成交名义价值 × 费率。市价/吃单=taker，挂单被动成交=maker。 */
export function calcFee(notional: number, isMaker: boolean): number {
  return Math.abs(notional) * feeRate(isMaker);
}
