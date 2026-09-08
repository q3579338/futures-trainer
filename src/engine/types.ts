/** 开仓理由：下单前强制六选一，不可跳过 */
export const OPEN_REASONS = [
  '计划内',
  '追涨',
  '抄底',
  '回血（刚亏完想赚回来）',
  '突发消息',
  '无聊手痒',
] as const;

export type OpenReason = (typeof OPEN_REASONS)[number];

export type AutoTag = 'REVENGE' | 'OVERSIZE' | 'HIGH_LEV' | 'CHASE';

export type MarginMode = 'ISOLATED' | 'CROSSED';
export type PositionMode = 'ONE_WAY' | 'HEDGE';
export type PositionSide = 'LONG' | 'SHORT';
export type OrderSide = 'BUY' | 'SELL';
export type HedgeIntent = 'OPEN_LONG' | 'OPEN_SHORT' | 'CLOSE_LONG' | 'CLOSE_SHORT';
export type OrderType =
  | 'MARKET'
  | 'LIMIT'
  | 'STOP'
  | 'TAKE_PROFIT'
  | 'TAKE_PROFIT_MARKET'
  | 'STOP_MARKET'
  | 'TRAILING_STOP_MARKET';
export type TimeInForce = 'GTC' | 'IOC' | 'FOK' | 'GTX';
export type WorkingType = 'MARK_PRICE' | 'CONTRACT_PRICE';
export type OrderStatus = 'NEW' | 'FILLED' | 'CANCELED' | 'EXPIRED' | 'REJECTED';
export type TradeType = 'OPEN' | 'CLOSE' | 'LIQUIDATION' | 'FUNDING' | 'DEPOSIT';
export type LedgerKind = 'REALIZED_PNL' | 'FEE' | 'FUNDING' | 'DEPOSIT';

export interface Bracket {
  notionalFloor: number;
  notionalCap: number;
  maintMarginRatio: number;
  cum: number;
  maxLeverage: number;
}

export interface Position {
  id: string;
  symbol: string;
  side: PositionSide;
  qty: number;
  entryPrice: number;
  leverage: number;
  marginMode: MarginMode;
  /** 逐仓保证金（含已结算资金费与已实现盈亏）；全仓仓位此字段仅作占用参考 */
  isolatedWallet: number;
  /** 开仓时占用的起始保证金 = 名义 / 杠杆 */
  initialMargin: number;
  openTime: number;
  reason: OpenReason;
  tags: AutoTag[];
  tiltScore: number;
  accumulatedFunding: number;
  lastFundingSettle: number;
  takeProfit?: number;
  stopLoss?: number;
  takeProfitWorkingType?: WorkingType;
  stopLossWorkingType?: WorkingType;
  trailingCallbackRate?: number;
  trailingExtreme?: number;
}

export interface Order {
  id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  timeInForce: TimeInForce;
  price?: number;
  stopPrice?: number;
  qty: number;
  origQty?: number;
  reduceOnly: boolean;
  workingType: WorkingType;
  callbackRate?: number;
  leverage: number;
  marginMode: MarginMode;
  status: OrderStatus;
  createdAt: number;
  updatedAt?: number;
  reason?: OpenReason;
  activationPrice?: number;
  trailingExtreme?: number;
  rejectReason?: string;
  /** 双向持仓：此单作用的仓位方向 */
  positionSide?: PositionSide;
  closePosition?: boolean;
}

export interface TradeRecord {
  id: string;
  positionId?: string;
  symbol: string;
  side: OrderSide;
  positionSide?: PositionSide;
  qty: number;
  price: number;
  fee: number;
  feeRate: number;
  isMaker: boolean;
  realizedPnl: number;
  type: TradeType;
  time: number;
  reason?: OpenReason;
  tags?: AutoTag[];
  tiltScore?: number;
  holdMs?: number;
  severeSlippage?: boolean;
  leverage?: number;
  entryPrice?: number;
  margin?: number;
  funding?: number;
  amount?: number;
}

export interface Deposit {
  time: number;
  amount: number;
}

export interface EquitySnapshot {
  time: number;
  equity: number;
  totalDeposited: number;
}

export interface RiskConfig {
  dailyLossPct: number;
  consecutiveLossLimit: number;
  maxMarginPct: number;
  maxLeverage: number;
}

export interface RiskLock {
  dailyLossUntil: number | null;
  consecutiveUntil: number | null;
  liquidationUntil: number | null;
}

export interface LastLossClose {
  time: number;
  margin: number;
  pnl: number;
}

export interface EngineState {
  walletBalance: number;
  totalDeposited: number;
  positions: Position[];
  orders: Order[];
  /** 已结束委托（成交/撤销/过期/拒绝），供历史委托页 */
  orderHistory: Order[];
  positionMode: PositionMode;
  /** 手续费等级 VIP0–VIP9；缺省按 VIP2（engine/fees.ts） */
  feeTier?: number;
  trades: TradeRecord[];
  deposits: Deposit[];
  snapshots: EquitySnapshot[];
  lastFundingSettle: number;
  lastLossClose: LastLossClose | null;
  lastCloseTime: number | null;
  consecutiveLosses: number;
  dayKey: string;
  dayStartEquity: number;
  dayStartDeposited: number;
  totalFee: number;
  totalFundingPaid: number;
  liquidationCount: number;
  riskConfig: RiskConfig;
  pendingRiskConfig: RiskConfig;
  lock: RiskLock;
}

export interface DepthBook {
  bids: Array<[number, number]>;
  asks: Array<[number, number]>;
}

export interface MarketCtx {
  lastPrice: Record<string, number>;
  markPrice: Record<string, number>;
  fundingRate: Record<string, number>;
  nextFundingTime: Record<string, number>;
  depth: Record<string, DepthBook>;
  change1m: Record<string, number>;
  now: number;
}

export interface EatResult {
  avgPrice: number;
  filledQty: number;
  notional: number;
  severeSlippage: boolean;
  levelsUsed: number;
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  dailyLossPct: 0.05,
  consecutiveLossLimit: 3,
  maxMarginPct: 0.2,
  maxLeverage: 20,
};

export const EMPTY_LOCK: RiskLock = {
  dailyLossUntil: null,
  consecutiveUntil: null,
  liquidationUntil: null,
};
