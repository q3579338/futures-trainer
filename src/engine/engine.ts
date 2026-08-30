import { uid } from '../lib/id';
import { availableBalance, equity, markOf, utcDayKey } from './account';
import { maxLeverageForNotional } from './brackets';
import { calcFee } from './fees';
import { calcFunding, fundingTimesDue } from './funding';
import { collectLiquidations } from './liquidation';
import { addPositionAvgPrice, initialMargin, realizedPnl } from './position';
import { computeTags, computeTiltScore } from './behavior';
import {
  applyConsecutiveLock,
  applyDailyLossLock,
  applyLiquidationLock,
  canOpenNew,
  maybeRollUtcDay,
} from './risk';
import { eatBook, eatBookToLimit } from './slippage';
import { isConditionalTriggered, isLimitConditional, isMarketConditional } from './conditional';
import { applySwitchPositionMode, findPosition, inferHedgePositionSide, isHedgeClose } from './hedge';
import { archiveOrder, pruneLiveOrders } from './history';
import { applyAdjustIsolatedMargin } from './isolatedAdj';
import { applyChangeLeverage } from './leverageAdj';
import type {
  AutoTag,
  EngineState,
  MarketCtx,
  OpenReason,
  Order,
  OrderSide,
  OrderType,
  Position,
  PositionMode,
  PositionSide,
  TradeRecord,
  WorkingType,
} from './types';
import { DEFAULT_RISK_CONFIG, EMPTY_LOCK } from './types';

export interface PlaceOrderInput {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  qty: number;
  price?: number;
  stopPrice?: number;
  timeInForce?: Order['timeInForce'];
  reduceOnly: boolean;
  workingType?: WorkingType;
  callbackRate?: number;
  leverage: number;
  marginMode: EngineState['positions'][number]['marginMode'];
  reason?: OpenReason;
  takeProfit?: number;
  stopLoss?: number;
  tpWorkingType?: WorkingType;
  slWorkingType?: WorkingType;
  activationPrice?: number;
  positionSide?: PositionSide;
  postOnly?: boolean;
  closePosition?: boolean;
}

export interface EngineEvent {
  type: 'LIQUIDATION' | 'FILL' | 'REJECT' | 'FUNDING' | 'LOCK' | 'SLIPPAGE';
  message?: string;
  trade?: TradeRecord;
  position?: Position;
  holdMs?: number;
  reason?: OpenReason;
  tiltScore?: number;
  pnl?: number;
  tags?: AutoTag[];
}

export interface StepResult {
  state: EngineState;
  events: EngineEvent[];
  error?: string;
}

export function createInitialState(now = Date.now()): EngineState {
  return {
    walletBalance: 0,
    totalDeposited: 0,
    positions: [],
    orders: [],
    orderHistory: [],
    positionMode: 'ONE_WAY',
    trades: [],
    deposits: [],
    snapshots: [],
    lastFundingSettle: now,
    lastLossClose: null,
    lastCloseTime: null,
    consecutiveLosses: 0,
    dayKey: utcDayKey(now),
    dayStartEquity: 0,
    dayStartDeposited: 0,
    totalFee: 0,
    totalFundingPaid: 0,
    liquidationCount: 0,
    riskConfig: { ...DEFAULT_RISK_CONFIG },
    pendingRiskConfig: { ...DEFAULT_RISK_CONFIG },
    lock: { ...EMPTY_LOCK },
  };
}

export function cloneState(s: EngineState): EngineState {
  return {
    ...s,
    positions: s.positions.map((p) => ({ ...p, tags: [...p.tags] })),
    orders: s.orders.map((o) => ({ ...o })),
    orderHistory: (s.orderHistory ?? []).map((o) => ({ ...o })),
    positionMode: s.positionMode ?? 'ONE_WAY',
    trades: s.trades.slice(-5000),
    deposits: [...s.deposits],
    snapshots: s.snapshots.slice(-2000),
    lastLossClose: s.lastLossClose ? { ...s.lastLossClose } : null,
    riskConfig: { ...s.riskConfig },
    pendingRiskConfig: { ...s.pendingRiskConfig },
    lock: { ...s.lock },
  };
}

function pushSnap(state: EngineState, ctx: MarketCtx): void {
  const eq = equity(state, ctx.markPrice);
  const last = state.snapshots[state.snapshots.length - 1];
  if (last && last.time === ctx.now && last.equity === eq) return;
  state.snapshots.push({ time: ctx.now, equity: eq, totalDeposited: state.totalDeposited });
  if (state.snapshots.length > 2000) state.snapshots.splice(0, state.snapshots.length - 2000);
}

function pushTrade(state: EngineState, t: TradeRecord): void {
  state.trades.push(t);
  if (state.trades.length > 5000) state.trades.splice(0, state.trades.length - 5000);
}

function sideToPos(side: OrderSide): PositionSide {
  return side === 'BUY' ? 'LONG' : 'SHORT';
}

function posToCloseSide(side: PositionSide): OrderSide {
  return side === 'LONG' ? 'SELL' : 'BUY';
}

function wouldOpenNew(
  pos: Position | undefined,
  side: OrderSide,
  qty: number,
  reduceOnly: boolean,
): boolean {
  if (reduceOnly) return false;
  if (!pos) return true;
  const opening: PositionSide = sideToPos(side);
  if (pos.side === opening) return false;
  return qty > pos.qty;
}

export function applyDeposit(state: EngineState, amount: number, now: number, ctx: MarketCtx): StepResult {
  const next = cloneState(state);
  if (amount < 10 || amount > 10_000_000) {
    return { state: next, events: [], error: '入金范围 10 ~ 10,000,000 USDT' };
  }
  next.walletBalance += amount;
  next.totalDeposited += amount;
  next.deposits.push({ time: now, amount });
  pushTrade(next, {
    id: uid('d_'),
    symbol: 'USDT',
    side: 'BUY',
    qty: amount,
    price: 1,
    fee: 0,
    feeRate: 0,
    isMaker: true,
    realizedPnl: 0,
    type: 'DEPOSIT',
    time: now,
    amount,
  });
  if (next.deposits.length === 1) {
    next.dayKey = utcDayKey(now);
    next.dayStartEquity = next.walletBalance;
    next.dayStartDeposited = next.totalDeposited;
  }
  const c = { ...ctx, now };
  pushSnap(next, c);
  return { state: next, events: [] };
}

export function applyReset(now: number): EngineState {
  return createInitialState(now);
}

export function applyPendingRisk(state: EngineState): EngineState {
  const next = cloneState(state);
  next.riskConfig = { ...next.pendingRiskConfig };
  return next;
}

export function applyPlaceOrder(
  state: EngineState,
  input: PlaceOrderInput,
  ctx: MarketCtx,
): StepResult {
  const next = cloneState(state);
  const events: EngineEvent[] = [];
  const now = ctx.now;
  maybeRollUtcDay(next, equity(next, ctx.markPrice), now);

  if (input.qty <= 0) return { state: next, events, error: '数量必须大于 0' };
  if (input.leverage < 1) return { state: next, events, error: '杠杆必须 ≥ 1' };

  const hedgeSide =
    next.positionMode === 'HEDGE'
      ? inferHedgePositionSide(input.side, input.reduceOnly, input.positionSide)
      : undefined;
  const pos = findPosition(next.positions, input.symbol, next.positionMode, hedgeSide);
  const sameSymbol = next.positions.filter((p) => p.symbol === input.symbol);
  if (sameSymbol.some((p) => p.marginMode !== input.marginMode)) {
    return { state: next, events, error: '已有仓位，不可切换保证金模式' };
  }
  if (pos && pos.leverage !== input.leverage && (next.positionMode === 'HEDGE' || sideToPos(input.side) === pos.side)) {
    // 加仓沿用原杠杆
    input = { ...input, leverage: pos.leverage };
  }
  if (input.closePosition && pos) {
    input = { ...input, qty: pos.qty, reduceOnly: true };
  }

  const tif = input.postOnly ? 'GTX' : (input.timeInForce ?? 'GTC');
  const order: Order = {
    id: uid('o_'),
    symbol: input.symbol,
    side: input.side,
    type: input.type,
    timeInForce: tif,
    price: input.price,
    stopPrice: input.stopPrice,
    qty: input.qty,
    origQty: input.qty,
    reduceOnly: input.reduceOnly,
    workingType: input.workingType ?? 'MARK_PRICE',
    callbackRate: input.callbackRate,
    leverage: input.leverage,
    marginMode: input.marginMode,
    status: 'NEW',
    createdAt: now,
    reason: input.reason,
    activationPrice: input.activationPrice,
    trailingExtreme: undefined,
    positionSide: hedgeSide,
    closePosition: input.closePosition,
  };

  if (input.type === 'TRAILING_STOP_MARKET') {
    const rate = input.callbackRate ?? 0;
    if (rate < 0.001 || rate > 0.1) {
      return { state: next, events, error: '追踪止损回调率须在 0.1% ~ 10%' };
    }
    const px = markOf(ctx, input.symbol);
    if (!order.activationPrice) order.activationPrice = px;
    if (px > 0 && px === order.activationPrice) {
      order.trailingExtreme = px;
    }
  }

  if (input.type === 'MARKET') {
    const r = fillMarket(next, order, ctx, events, input);
    if (r.error) return { state: next, events, error: r.error };
    archiveOrder(next, order);
    attachTpsl(next, input);
    return { state: next, events };
  }

  if (input.type === 'LIMIT') {
    const r = matchLimit(next, order, ctx, events, input, now);
    if (r.error && order.status === 'REJECTED') {
      archiveOrder(next, order);
      return { state: next, events, error: r.error };
    }
    if (r.error) return { state: next, events, error: r.error };
    if (order.status === 'NEW') next.orders.push(order);
    else archiveOrder(next, order);
    attachTpsl(next, input);
    return { state: next, events };
  }

  if (input.type === 'STOP' || input.type === 'TAKE_PROFIT') {
    if (!(input.stopPrice != null && input.stopPrice > 0)) {
      return { state: next, events, error: '触发价必须大于 0' };
    }
    if (!(input.price != null && input.price > 0)) {
      return { state: next, events, error: '委托价必须大于 0' };
    }
    next.orders.push(order);
    return { state: next, events };
  }

  // 条件市价 / 追踪止损：挂起
  next.orders.push(order);
  return { state: next, events };
}

function matchLimit(
  state: EngineState,
  order: Order,
  ctx: MarketCtx,
  events: EngineEvent[],
  input: PlaceOrderInput | undefined,
  now: number,
): { error?: string } {
  const book = ctx.depth[order.symbol];
  const limit = order.price ?? 0;
  if (limit <= 0) return { error: '限价必须大于 0' };
  const tif = order.timeInForce;
  const bestAsk = book?.asks[0]?.[0];
  const bestBid = book?.bids[0]?.[0];
  const marketable =
    (order.side === 'BUY' && bestAsk != null && bestAsk <= limit) ||
    (order.side === 'SELL' && bestBid != null && bestBid >= limit);

  if (tif === 'GTX' && marketable) {
    order.status = 'REJECTED';
    order.rejectReason = 'Post-Only 将立即吃单，已拒绝';
    return { error: order.rejectReason };
  }

  if (marketable && tif !== 'GTX') {
    const eat = eatBookToLimit(order.side, order.qty, limit, book);
    if (tif === 'FOK' && eat.filledQty + 1e-12 < order.qty) {
      return { error: 'FOK 无法全部成交' };
    }
    if (eat.filledQty > 0) {
      const err = applyFill(state, {
        symbol: order.symbol,
        side: order.side,
        qty: eat.filledQty,
        price: eat.avgPrice,
        isMaker: false,
        reduceOnly: order.reduceOnly,
        leverage: order.leverage,
        marginMode: order.marginMode,
        reason: order.reason ?? input?.reason,
        severeSlippage: eat.severeSlippage,
        now,
        ctx,
        events,
        positionSide: order.positionSide ?? input?.positionSide,
      });
      if (err) return { error: err };
    }
    const remain = order.qty - eat.filledQty;
    if (remain > 1e-12 && tif === 'GTC') {
      order.qty = remain;
      order.status = 'NEW';
      return {};
    }
    order.status = eat.filledQty > 0 ? 'FILLED' : 'EXPIRED';
    return {};
  }

  if (tif === 'FOK' || tif === 'IOC') {
    return { error: tif === 'FOK' ? 'FOK 无法全部成交' : 'IOC 无立即成交' };
  }
  order.status = 'NEW';
  return {};
}

function fillMarket(
  state: EngineState,
  order: Order,
  ctx: MarketCtx,
  events: EngineEvent[],
  input: PlaceOrderInput,
): { error?: string } {
  const book = ctx.depth[order.symbol];
  const eat = eatBook(order.side, order.qty, book);
  if (eat.filledQty <= 0 || eat.avgPrice <= 0) {
    return { error: '盘口不足，无法市价成交' };
  }
  if (eat.severeSlippage) {
    events.push({ type: 'SLIPPAGE', message: '滑点严重' });
  }
  const err = applyFill(state, {
    symbol: order.symbol,
    side: order.side,
    qty: eat.filledQty,
    price: eat.avgPrice,
    isMaker: false,
    reduceOnly: order.reduceOnly,
    leverage: order.leverage,
    marginMode: order.marginMode,
    reason: order.reason,
    severeSlippage: eat.severeSlippage,
    now: ctx.now,
    ctx,
    events,
    positionSide: order.positionSide,
  });
  if (err) return { error: err };
  attachTpsl(state, input);
  order.status = 'FILLED';
  return {};
}

function attachTpsl(state: EngineState, input: PlaceOrderInput): void {
  const side =
    state.positionMode === 'HEDGE'
      ? inferHedgePositionSide(input.side, input.reduceOnly, input.positionSide)
      : undefined;
  const pos = findPosition(state.positions, input.symbol, state.positionMode, side);
  if (!pos) return;
  if (input.takeProfit != null) {
    pos.takeProfit = input.takeProfit;
    pos.takeProfitWorkingType = input.tpWorkingType ?? 'MARK_PRICE';
  }
  if (input.stopLoss != null) {
    pos.stopLoss = input.stopLoss;
    pos.stopLossWorkingType = input.slWorkingType ?? 'MARK_PRICE';
  }
}

interface FillArgs {
  symbol: string;
  side: OrderSide;
  qty: number;
  price: number;
  isMaker: boolean;
  reduceOnly: boolean;
  leverage: number;
  marginMode: Position['marginMode'];
  reason?: OpenReason;
  tags?: AutoTag[];
  tiltScore?: number;
  severeSlippage?: boolean;
  now: number;
  ctx: MarketCtx;
  events: EngineEvent[];
  asLiquidation?: boolean;
  liqPrice?: number;
  positionSide?: PositionSide;
}

function applyFill(state: EngineState, args: FillArgs): string | undefined {
  if (state.positionMode === 'HEDGE') return applyFillHedge(state, args);
  const { symbol, side, price, isMaker, reduceOnly, leverage, now, ctx } = args;
  const qty = args.qty;
  const posIdx = state.positions.findIndex((p) => p.symbol === symbol);
  const pos = posIdx >= 0 ? state.positions[posIdx] : undefined;
  const fee0 = calcFee(qty * price, isMaker);

  if (wouldOpenNew(pos, side, qty, reduceOnly) || (!pos && !reduceOnly)) {
    const openQty = !pos ? qty : Math.max(0, qty - pos.qty);
    if (openQty > 0) {
      const im = initialMargin(openQty, price, leverage);
      const eq = equity(state, ctx.markPrice);
      const bracketMax = maxLeverageForNotional(symbol, openQty * price);
      if (leverage > bracketMax) return `超过档位最大杠杆 ${bracketMax}x`;
      const gate = canOpenNew(state, now, im, leverage, eq);
      if (!gate.ok) return gate.reason;
      const avail = availableBalance(state, ctx.markPrice);
      if (avail < im + fee0) return '可用余额不足';
    }
  }

  if (!pos) {
    if (reduceOnly) return 'reduceOnly 无仓可减';
    return openPosition(state, args, qty);
  }

  const opening = sideToPos(side);
  if (pos.side === opening) {
    if (reduceOnly) return 'reduceOnly 不能加仓';
    return addPosition(state, pos, args, qty);
  }

  // 反向：先平后开
  const closeQty = Math.min(qty, pos.qty);
  const closeErr = closePosition(state, pos, posIdx, closeQty, args);
  if (closeErr) return closeErr;
  const remain = qty - closeQty;
  if (remain > 1e-12) {
    if (reduceOnly) return undefined;
    return openPosition(state, args, remain);
  }
  return undefined;
}

function applyFillHedge(state: EngineState, args: FillArgs): string | undefined {
  const { symbol, side, price, isMaker, reduceOnly, leverage, now, ctx } = args;
  const qty = args.qty;
  const target = inferHedgePositionSide(side, reduceOnly, args.positionSide);
  const posIdx = state.positions.findIndex((p) => p.symbol === symbol && p.side === target);
  const pos = posIdx >= 0 ? state.positions[posIdx] : undefined;
  const closing = isHedgeClose(side, target);
  const fee0 = calcFee(qty * price, isMaker);

  if (!closing) {
    if (reduceOnly) return 'reduceOnly 不能加仓';
    const openQty = pos ? qty : qty;
    const im = initialMargin(openQty, price, pos?.leverage ?? leverage);
    const eq = equity(state, ctx.markPrice);
    const notional = ((pos?.qty ?? 0) + openQty) * price;
    const bracketMax = maxLeverageForNotional(symbol, notional);
    const lev = pos?.leverage ?? leverage;
    if (lev > bracketMax) return `超过档位最大杠杆 ${bracketMax}x`;
    const gate = canOpenNew(state, now, im, lev, eq);
    if (!gate.ok) return gate.reason;
    const avail = availableBalance(state, ctx.markPrice);
    if (avail < im + fee0) return '可用余额不足';
    if (!pos) return openPosition(state, { ...args, leverage: lev }, qty);
    return addPosition(state, pos, args, qty);
  }

  if (!pos) return 'reduceOnly 无仓可减';
  const closeQty = Math.min(qty, pos.qty);
  return closePosition(state, pos, posIdx, closeQty, args);
}

function tagBundle(state: EngineState, args: FillArgs, qty: number, price: number, side: PositionSide) {
  const margin = initialMargin(qty, price, args.leverage);
  const eq = equity(state, args.ctx.markPrice);
  const input = {
    margin,
    equity: eq,
    leverage: args.leverage,
    side,
    change1mPct: args.ctx.change1m[args.symbol] ?? 0,
    now: args.now,
    lastLossClose: state.lastLossClose,
    lastCloseTime: state.lastCloseTime,
    consecutiveLosses: state.consecutiveLosses,
  };
  return {
    tags: computeTags(input),
    tiltScore: computeTiltScore(input),
    margin,
  };
}

function openPosition(state: EngineState, args: FillArgs, qty: number): string | undefined {
  const { symbol, side, price, isMaker, leverage, marginMode, now, ctx, events, reason } = args;
  if (!reason) return '开新仓必须选择开仓理由';
  const posSide = sideToPos(side);
  const im = initialMargin(qty, price, leverage);
  const fee = calcFee(qty * price, isMaker);
  const { tags, tiltScore } = tagBundle(state, args, qty, price, posSide);
  const avail = availableBalance(state, ctx.markPrice);
  if (avail < im + fee) return '可用余额不足';
  const bracketMax = maxLeverageForNotional(symbol, qty * price);
  if (leverage > bracketMax) return `超过档位最大杠杆 ${bracketMax}x`;
  const gate = canOpenNew(state, now, im, leverage, equity(state, ctx.markPrice));
  if (!gate.ok) return gate.reason;

  state.walletBalance -= fee;
  state.totalFee += fee;
  const pos: Position = {
    id: uid('p_'),
    symbol,
    side: posSide,
    qty,
    entryPrice: price,
    leverage,
    marginMode,
    isolatedWallet: marginMode === 'ISOLATED' ? im : im,
    initialMargin: im,
    openTime: now,
    reason,
    tags,
    tiltScore,
    accumulatedFunding: 0,
    lastFundingSettle: state.lastFundingSettle,
  };
  state.positions.push(pos);
  const trade: TradeRecord = {
    id: uid('t_'),
    positionId: pos.id,
    symbol,
    side,
    positionSide: posSide,
    qty,
    price,
    fee,
    feeRate: isMaker ? 0.0002 : 0.0005,
    isMaker,
    realizedPnl: 0,
    type: 'OPEN',
    time: now,
    reason,
    tags,
    tiltScore,
    severeSlippage: args.severeSlippage,
    leverage,
    entryPrice: price,
    margin: im,
  };
  pushTrade(state, trade);
  events.push({ type: 'FILL', trade, position: pos, tags, tiltScore, reason });
  pushSnap(state, ctx);
  return undefined;
}

function addPosition(state: EngineState, pos: Position, args: FillArgs, qty: number): string | undefined {
  const { price, isMaker, now, ctx, events, side } = args;
  const im = initialMargin(qty, price, pos.leverage);
  const fee = calcFee(qty * price, isMaker);
  const avail = availableBalance(state, ctx.markPrice);
  if (avail < im + fee) return '可用余额不足';
  const gate = canOpenNew(state, now, im, pos.leverage, equity(state, ctx.markPrice));
  if (!gate.ok) return gate.reason;
  const bracketMax = maxLeverageForNotional(pos.symbol, (pos.qty + qty) * price);
  if (pos.leverage > bracketMax) return `加仓后超过档位最大杠杆 ${bracketMax}x`;

  state.walletBalance -= fee;
  state.totalFee += fee;
  pos.entryPrice = addPositionAvgPrice(pos.qty, pos.entryPrice, qty, price);
  pos.qty += qty;
  pos.initialMargin += im;
  pos.isolatedWallet += im;
  const trade: TradeRecord = {
    id: uid('t_'),
    positionId: pos.id,
    symbol: pos.symbol,
    side,
    positionSide: pos.side,
    qty,
    price,
    fee,
    feeRate: isMaker ? 0.0002 : 0.0005,
    isMaker,
    realizedPnl: 0,
    type: 'OPEN',
    time: now,
    reason: pos.reason,
    tags: pos.tags,
    tiltScore: pos.tiltScore,
    severeSlippage: args.severeSlippage,
    leverage: pos.leverage,
    entryPrice: pos.entryPrice,
    margin: im,
  };
  pushTrade(state, trade);
  events.push({ type: 'FILL', trade, position: pos });
  pushSnap(state, ctx);
  return undefined;
}

function closePosition(
  state: EngineState,
  pos: Position,
  posIdx: number,
  qty: number,
  args: FillArgs,
): string | undefined {
  const { price, isMaker, now, ctx, events } = args;
  const exit = args.asLiquidation && args.liqPrice != null ? args.liqPrice : price;
  const fee = calcFee(qty * exit, isMaker);
  const pnl = realizedPnl(pos.side, qty, pos.entryPrice, exit);
  const ratio = pos.qty > 0 ? qty / pos.qty : 1;
  const released = pos.isolatedWallet * ratio;

  if (args.asLiquidation) {
    if (pos.marginMode === 'ISOLATED') {
      const leftover = Math.max(0, pos.isolatedWallet + pnl - fee);
      state.walletBalance = state.walletBalance - pos.isolatedWallet + leftover;
    } else {
      state.walletBalance = Math.max(0, state.walletBalance + pnl - fee);
    }
  } else {
    state.walletBalance += pnl - fee;
    if (state.walletBalance < 0) state.walletBalance = 0;
  }
  state.totalFee += fee;

  const holdMs = now - pos.openTime;
  const trade: TradeRecord = {
    id: uid('t_'),
    positionId: pos.id,
    symbol: pos.symbol,
    side: posToCloseSide(pos.side),
    positionSide: pos.side,
    qty,
    price: exit,
    fee,
    feeRate: isMaker ? 0.0002 : 0.0005,
    isMaker,
    realizedPnl: pnl,
    type: args.asLiquidation ? 'LIQUIDATION' : 'CLOSE',
    time: now,
    reason: pos.reason,
    tags: pos.tags,
    tiltScore: pos.tiltScore,
    holdMs,
    severeSlippage: args.severeSlippage,
    leverage: pos.leverage,
    entryPrice: pos.entryPrice,
    margin: released,
    funding: pos.accumulatedFunding * ratio,
  };
  pushTrade(state, trade);

  state.lastCloseTime = now;
  if (pnl < 0) {
    state.consecutiveLosses += 1;
    state.lastLossClose = { time: now, margin: released, pnl };
    applyConsecutiveLock(state, now);
  } else if (pnl > 0) {
    state.consecutiveLosses = 0;
  }

  if (args.asLiquidation) {
    state.liquidationCount += 1;
    applyLiquidationLock(state, now);
    events.push({
      type: 'LIQUIDATION',
      trade,
      position: { ...pos },
      holdMs,
      reason: pos.reason,
      tiltScore: pos.tiltScore,
      pnl,
      tags: pos.tags,
      message: '仓位已强平',
    });
    state.positions.splice(posIdx, 1);
  } else {
    events.push({ type: 'FILL', trade, position: pos, holdMs, pnl });
    if (qty + 1e-12 >= pos.qty) {
      state.positions.splice(posIdx, 1);
    } else {
      pos.qty -= qty;
      pos.isolatedWallet -= released;
      pos.initialMargin *= 1 - ratio;
      pos.accumulatedFunding *= 1 - ratio;
    }
  }

  const eq = equity(state, ctx.markPrice);
  applyDailyLossLock(state, eq, now);
  pushSnap(state, ctx);
  return undefined;
}

export function applyCancelOrder(state: EngineState, orderId: string): StepResult {
  const next = cloneState(state);
  const o = next.orders.find((x) => x.id === orderId && x.status === 'NEW');
  if (!o) return { state: next, events: [], error: '订单不存在' };
  o.status = 'CANCELED';
  o.updatedAt = Date.now();
  pruneLiveOrders(next);
  return { state: next, events: [] };
}

export function applyAmendTpsl(
  state: EngineState,
  positionId: string,
  patch: {
    takeProfit?: number | null;
    stopLoss?: number | null;
    takeProfitWorkingType?: WorkingType;
    stopLossWorkingType?: WorkingType;
  },
): StepResult {
  const next = cloneState(state);
  const pos = next.positions.find((p) => p.id === positionId);
  if (!pos) return { state: next, events: [], error: '仓位不存在' };
  if (patch.takeProfit === null) {
    delete pos.takeProfit;
    delete pos.takeProfitWorkingType;
  } else if (patch.takeProfit != null) {
    pos.takeProfit = patch.takeProfit;
    if (patch.takeProfitWorkingType) pos.takeProfitWorkingType = patch.takeProfitWorkingType;
  }
  if (patch.stopLoss === null) {
    delete pos.stopLoss;
    delete pos.stopLossWorkingType;
  } else if (patch.stopLoss != null) {
    pos.stopLoss = patch.stopLoss;
    if (patch.stopLossWorkingType) pos.stopLossWorkingType = patch.stopLossWorkingType;
  }
  if (patch.takeProfitWorkingType && pos.takeProfit != null) {
    pos.takeProfitWorkingType = patch.takeProfitWorkingType;
  }
  if (patch.stopLossWorkingType && pos.stopLoss != null) {
    pos.stopLossWorkingType = patch.stopLossWorkingType;
  }
  return { state: next, events: [] };
}

export function applyAmendOrder(
  state: EngineState,
  orderId: string,
  patch: { price?: number; qty?: number },
  ctx: MarketCtx,
): StepResult {
  const next = cloneState(state);
  const events: EngineEvent[] = [];
  const o = next.orders.find((x) => x.id === orderId && x.status === 'NEW');
  if (!o) return { state: next, events, error: '订单不存在' };
  if (o.type !== 'LIMIT' && o.type !== 'STOP' && o.type !== 'TAKE_PROFIT') {
    return { state: next, events, error: '仅限价/条件限价单可改' };
  }
  if (patch.qty != null) {
    if (!(patch.qty > 0)) return { state: next, events, error: '数量必须大于 0' };
    o.qty = patch.qty;
    o.origQty = patch.qty;
  }
  if (patch.price != null) {
    if (!(patch.price > 0)) return { state: next, events, error: '价格必须大于 0' };
    o.price = patch.price;
  }
  o.updatedAt = ctx.now;
  if (o.type === 'LIMIT') {
    const r = matchLimit(next, o, ctx, events, undefined, ctx.now);
    if (r.error && o.status === 'REJECTED') {
      pruneLiveOrders(next);
      return { state: next, events, error: r.error };
    }
    if (r.error) {
      o.status = 'NEW';
      return { state: next, events, error: r.error };
    }
    pruneLiveOrders(next);
  }
  return { state: next, events };
}

function triggerPrice(order: Order, ctx: MarketCtx): number {
  if (order.workingType === 'CONTRACT_PRICE') return ctx.lastPrice[order.symbol] ?? 0;
  return markOf(ctx, order.symbol);
}

function isStopTriggered(order: Order, px: number): boolean {
  return isConditionalTriggered(order, px);
}

function updateTrailing(order: Order, px: number): boolean {
  if (px <= 0) return false;
  const rate = order.callbackRate ?? 0;
  if (order.activationPrice && order.side === 'SELL' && px < order.activationPrice) return false;
  if (order.activationPrice && order.side === 'BUY' && px > order.activationPrice) return false;
  if (order.trailingExtreme == null) {
    order.trailingExtreme = px;
    return false;
  }
  if (order.side === 'SELL') {
    order.trailingExtreme = Math.max(order.trailingExtreme, px);
    return px <= order.trailingExtreme * (1 - rate);
  }
  order.trailingExtreme = Math.min(order.trailingExtreme, px);
  return px >= order.trailingExtreme * (1 + rate);
}

function processConditional(state: EngineState, ctx: MarketCtx, events: EngineEvent[]): void {
  const live = state.orders.filter((o) => o.status === 'NEW');
  for (const o of live) {
    if (o.type === 'LIMIT') continue;
    const px = triggerPrice(o, ctx);
    let fire = false;
    if (isMarketConditional(o.type) || isLimitConditional(o.type)) fire = isStopTriggered(o, px);
    else if (o.type === 'TRAILING_STOP_MARKET') fire = updateTrailing(o, px);
    if (!fire) continue;
    if (isLimitConditional(o.type)) {
      const limitOrder: Order = { ...o, type: 'LIMIT' };
      const r = matchLimit(state, limitOrder, ctx, events, undefined, ctx.now);
      o.status = limitOrder.status;
      o.qty = limitOrder.qty;
      o.type = limitOrder.status === 'NEW' ? 'LIMIT' : o.type;
      o.rejectReason = limitOrder.rejectReason;
      if (r.error && limitOrder.status === 'REJECTED') {
        events.push({ type: 'REJECT', message: r.error });
      } else if (r.error && limitOrder.status === 'NEW') {
        o.status = 'REJECTED';
        o.rejectReason = r.error;
        events.push({ type: 'REJECT', message: r.error });
      }
      continue;
    }
    o.status = 'FILLED';
    const mkt: Order = { ...o, type: 'MARKET' };
    const r = fillMarket(state, mkt, ctx, events, {
      symbol: o.symbol,
      side: o.side,
      type: 'MARKET',
      qty: o.qty,
      reduceOnly: o.reduceOnly,
      leverage: o.leverage,
      marginMode: o.marginMode,
      reason: o.reason,
      positionSide: o.positionSide,
    });
    if (r.error) {
      o.status = 'REJECTED';
      o.rejectReason = r.error;
      events.push({ type: 'REJECT', message: r.error });
    }
  }
  pruneLiveOrders(state);
}

function processLimits(state: EngineState, ctx: MarketCtx, events: EngineEvent[]): void {
  const lastMap = ctx.lastPrice;
  const live = state.orders.filter((o) => o.status === 'NEW' && o.type === 'LIMIT');
  for (const o of live) {
    const last = lastMap[o.symbol];
    const limit = o.price ?? 0;
    if (last == null || limit <= 0) continue;
    const cross = o.side === 'BUY' ? last <= limit : last >= limit;
    if (!cross) continue;
    o.status = 'FILLED';
    const err = applyFill(state, {
      symbol: o.symbol,
      side: o.side,
      qty: o.qty,
      price: limit,
      isMaker: true,
      reduceOnly: o.reduceOnly,
      leverage: o.leverage,
      marginMode: o.marginMode,
      reason: o.reason,
      now: ctx.now,
      ctx,
      events,
      positionSide: o.positionSide,
    });
    if (err) {
      o.status = 'NEW';
      events.push({ type: 'REJECT', message: err });
    }
  }
  pruneLiveOrders(state);
}

function processPositionTpsl(state: EngineState, ctx: MarketCtx, events: EngineEvent[]): void {
  for (const pos of [...state.positions]) {
    const mark = markOf(ctx, pos.symbol);
    const last = ctx.lastPrice[pos.symbol] ?? mark;
    const tpPx = pos.takeProfitWorkingType === 'CONTRACT_PRICE' ? last : mark;
    const slPx = pos.stopLossWorkingType === 'CONTRACT_PRICE' ? last : mark;
    const hitTp =
      pos.takeProfit != null &&
      ((pos.side === 'LONG' && tpPx >= pos.takeProfit) ||
        (pos.side === 'SHORT' && tpPx <= pos.takeProfit));
    const hitSl =
      pos.stopLoss != null &&
      ((pos.side === 'LONG' && slPx <= pos.stopLoss) || (pos.side === 'SHORT' && slPx >= pos.stopLoss));
    if (!hitTp && !hitSl) continue;
    const idx = state.positions.findIndex((p) => p.id === pos.id);
    if (idx < 0) continue;
    const book = ctx.depth[pos.symbol];
    const closeSide = posToCloseSide(pos.side);
    const eat = eatBook(closeSide, pos.qty, book);
    const px = eat.avgPrice > 0 ? eat.avgPrice : last;
    closePosition(state, state.positions[idx]!, idx, pos.qty, {
      symbol: pos.symbol,
      side: closeSide,
      qty: pos.qty,
      price: px,
      isMaker: false,
      reduceOnly: true,
      leverage: pos.leverage,
      marginMode: pos.marginMode,
      now: ctx.now,
      ctx,
      events,
      severeSlippage: eat.severeSlippage,
      positionSide: pos.side,
    });
  }
}

function processFunding(state: EngineState, ctx: MarketCtx, events: EngineEvent[]): void {
  const dues = fundingTimesDue(state.lastFundingSettle, ctx.now);
  if (dues.length === 0) return;
  for (const t of dues) {
    for (const pos of state.positions) {
      const mark = markOf(ctx, pos.symbol, pos.entryPrice);
      const rate = ctx.fundingRate[pos.symbol] ?? 0;
      const pay = calcFunding(pos.qty, mark, rate, pos.side);
      state.walletBalance -= pay;
      state.totalFundingPaid += pay;
      pos.accumulatedFunding += pay;
      pos.isolatedWallet -= pay;
      if (pos.marginMode === 'ISOLATED' && pos.isolatedWallet < 0) pos.isolatedWallet = 0;
      pushTrade(state, {
        id: uid('f_'),
        positionId: pos.id,
        symbol: pos.symbol,
        side: pos.side === 'LONG' ? 'SELL' : 'BUY',
        positionSide: pos.side,
        qty: pos.qty,
        price: mark,
        fee: 0,
        feeRate: 0,
        isMaker: true,
        realizedPnl: -pay,
        type: 'FUNDING',
        time: t,
        funding: pay,
      });
      events.push({ type: 'FUNDING', pnl: -pay, message: '资金费结算' });
    }
  }
  state.lastFundingSettle = dues[dues.length - 1]!;
  if (state.walletBalance < 0) state.walletBalance = 0;
  pushSnap(state, ctx);
}

function processLiquidations(state: EngineState, ctx: MarketCtx, events: EngineEvent[]): void {
  const hits = collectLiquidations(state, ctx);
  for (const hit of hits) {
    const idx = state.positions.findIndex((p) => p.id === hit.pos.id);
    if (idx < 0) continue;
    const pos = state.positions[idx]!;
    closePosition(state, pos, idx, pos.qty, {
      symbol: pos.symbol,
      side: posToCloseSide(pos.side),
      qty: pos.qty,
      price: hit.lp,
      isMaker: false,
      reduceOnly: true,
      leverage: pos.leverage,
      marginMode: pos.marginMode,
      now: ctx.now,
      ctx,
      events,
      asLiquidation: true,
      liqPrice: hit.lp,
    });
  }
}

export function applyMarkTick(state: EngineState, ctx: MarketCtx): StepResult {
  const next = cloneState(state);
  const events: EngineEvent[] = [];
  maybeRollUtcDay(next, equity(next, ctx.markPrice), ctx.now);
  processFunding(next, ctx, events);
  processLiquidations(next, ctx, events);
  processConditional(next, ctx, events);
  processPositionTpsl(next, ctx, events);
  return { state: next, events };
}

export function applyTradeTick(state: EngineState, ctx: MarketCtx): StepResult {
  const next = cloneState(state);
  const events: EngineEvent[] = [];
  processLimits(next, ctx, events);
  processConditional(next, ctx, events);
  processPositionTpsl(next, ctx, events);
  return { state: next, events };
}

export function applyCloseAll(
  state: EngineState,
  symbol: string | null,
  ctx: MarketCtx,
): StepResult {
  const next = cloneState(state);
  const events: EngineEvent[] = [];
  const list = symbol ? next.positions.filter((p) => p.symbol === symbol) : [...next.positions];
  for (const pos of list) {
    const idx = next.positions.findIndex((p) => p.id === pos.id);
    if (idx < 0) continue;
    const closeSide = posToCloseSide(pos.side);
    const eat = eatBook(closeSide, pos.qty, ctx.depth[pos.symbol]);
    if (eat.filledQty <= 0) {
      events.push({ type: 'REJECT', message: '盘口不足，无法平仓' });
      continue;
    }
    closePosition(next, next.positions[idx]!, idx, pos.qty, {
      symbol: pos.symbol,
      side: closeSide,
      qty: pos.qty,
      price: eat.avgPrice,
      isMaker: false,
      reduceOnly: true,
      leverage: pos.leverage,
      marginMode: pos.marginMode,
      now: ctx.now,
      ctx,
      events,
      severeSlippage: eat.severeSlippage,
    });
  }
  return { state: next, events };
}

export function maxOpenNotional(state: EngineState, ctx: MarketCtx, leverage: number): number {
  const avail = Math.max(0, availableBalance(state, ctx.markPrice));
  return avail * leverage;
}

export function applyIsolatedMargin(
  state: EngineState,
  positionId: string,
  delta: number,
  ctx: MarketCtx,
): StepResult {
  const r = applyAdjustIsolatedMargin(cloneState(state), positionId, delta, ctx);
  return { state: r.state, events: [], error: r.error };
}

export function applyLeverage(
  state: EngineState,
  symbol: string,
  leverage: number,
  ctx: MarketCtx,
): StepResult {
  const r = applyChangeLeverage(cloneState(state), symbol, leverage, ctx);
  return { state: r.state, events: [], error: r.error };
}

export function applyPositionMode(state: EngineState, mode: PositionMode): StepResult {
  const r = applySwitchPositionMode(cloneState(state), mode);
  return { state: r.state, events: [], error: r.error };
}

export function applyClosePosition(
  state: EngineState,
  positionId: string,
  ctx: MarketCtx,
  qty?: number,
): StepResult {
  const next = cloneState(state);
  const events: EngineEvent[] = [];
  const idx = next.positions.findIndex((p) => p.id === positionId);
  if (idx < 0) return { state: next, events, error: '仓位不存在' };
  const pos = next.positions[idx]!;
  const q = qty != null ? Math.min(qty, pos.qty) : pos.qty;
  if (!(q > 0)) return { state: next, events, error: '数量必须大于 0' };
  const closeSide = posToCloseSide(pos.side);
  const eat = eatBook(closeSide, q, ctx.depth[pos.symbol]);
  if (eat.filledQty <= 0) return { state: next, events, error: '盘口不足，无法平仓' };
  const err = closePosition(next, next.positions[idx]!, idx, eat.filledQty, {
    symbol: pos.symbol,
    side: closeSide,
    qty: eat.filledQty,
    price: eat.avgPrice,
    isMaker: false,
    reduceOnly: true,
    leverage: pos.leverage,
    marginMode: pos.marginMode,
    now: ctx.now,
    ctx,
    events,
    severeSlippage: eat.severeSlippage,
    positionSide: pos.side,
  });
  if (err) return { state: next, events, error: err };
  return { state: next, events };
}
