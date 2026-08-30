import { unrealizedPnl } from './account';
import type { Position } from './types';

/**
 * ADL 五格指示灯（仅展示，不实际减仓）。
 * 分数 = max(0, ROE) × 杠杆；ROE 为未实现盈亏 / 起始保证金。
 * 0：无盈利；1:<2；2:<5；3:<10；4:<20；5:≥20
 */
export function adlLights(pos: Position, mark: number): number {
  const upnl = unrealizedPnl(pos, mark);
  if (upnl <= 0 || !(pos.initialMargin > 0)) return 0;
  const roe = upnl / pos.initialMargin;
  const score = roe * pos.leverage;
  if (score < 2) return 1;
  if (score < 5) return 2;
  if (score < 10) return 3;
  if (score < 20) return 4;
  return 5;
}
