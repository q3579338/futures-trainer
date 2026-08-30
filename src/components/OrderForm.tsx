import { useEffect, useMemo, useState } from 'react';
import { availableBalance } from '../engine/account';
import { maxLeverageForSymbol } from '../engine/brackets';
import { calcFee } from '../engine/fees';
import { previewLiquidationPrice } from '../engine/liquidation';
import { initialMargin } from '../engine/position';
import { activeLock, formatRemain } from '../engine/risk';
import type {
  EngineState,
  HedgeIntent,
  MarginMode,
  OrderSide,
  PositionMode,
  TimeInForce,
  WorkingType,
} from '../engine/types';
import { floorToStep, fmtNum, roundToStep } from '../lib/format';
import {
  BUY_SUB,
  CLOSE_LONG_LABEL,
  CLOSE_SHORT_LABEL,
  OPEN_LONG_LABEL,
  OPEN_SHORT_LABEL,
  ORDER_TYPE_OPTIONS,
  SELL_SUB,
  coinFromSymbol,
  convertQtyOnUnitSwitch,
  engineOrderType,
  percentFromQty,
  qtyFromPercent,
  type PanelOrderType,
} from '../lib/tradeUi';
import type { PlaceOrderInput } from '../engine/engine';
import type { SymbolFilter } from '../market/rest';
import type { ConfirmDraft } from './ConfirmOrderSheet';
import DashLabel from './DashLabel';
import LeverageSheet from './LeverageSheet';
import MarginModeSheet from './MarginModeSheet';
import PercentSlider from './PercentSlider';
import PrefsSheet from './PrefsSheet';
import StepInput from './StepInput';

export default function OrderForm({
  symbol,
  state,
  mark,
  last,
  filter,
  lockNow,
  tapPrice,
  tapSeq,
  placedSeq,
  positionMode = 'ONE_WAY',
  onCommitLeverage,
  onPositionMode,
  onDeposit,
  onRequestConfirm,
}: {
  symbol: string;
  state: EngineState;
  mark: number;
  last: number;
  filter?: SymbolFilter;
  lockNow: number;
  tapPrice: number | null;
  tapSeq: number;
  placedSeq: number;
  positionMode?: PositionMode;
  onCommitLeverage?: (n: number) => string | undefined;
  onPositionMode?: (m: PositionMode) => string | undefined;
  onDeposit?: () => void;
  onRequestConfirm: (draft: ConfirmDraft, input: PlaceOrderInput) => void;
}) {
  const pos = state.positions.find((p) => p.symbol === symbol);
  const [mode, setMode] = useState<MarginMode>(pos?.marginMode ?? 'ISOLATED');
  const maxLevCap = Math.min(maxLeverageForSymbol(symbol), 125, state.riskConfig.maxLeverage);
  const [leverage, setLeverage] = useState(pos?.leverage ?? Math.min(20, maxLevCap));
  const [panel, setPanel] = useState<PanelOrderType>('MARKET');
  const [typeOpen, setTypeOpen] = useState(false);
  const [unit, setUnit] = useState<'coin' | 'usdt'>('usdt');
  const [unitOpen, setUnitOpen] = useState(false);
  const [qtyStr, setQtyStr] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [priceTouched, setPriceTouched] = useState(false);
  const [stopStr, setStopStr] = useState('');
  const [callback, setCallback] = useState('1');
  const [activationStr, setActivationStr] = useState('');
  const [tif, setTif] = useState<TimeInForce>('GTC');
  const [postOnly, setPostOnly] = useState(false);
  const [closeTab, setCloseTab] = useState(false);
  const [attachTpsl, setAttachTpsl] = useState(false);
  const [slippageOn, setSlippageOn] = useState(false);
  const [slippageStr, setSlippageStr] = useState('1');
  const [tpStr, setTpStr] = useState('');
  const [slStr, setSlStr] = useState('');
  const [tpWt, setTpWt] = useState<WorkingType>('MARK_PRICE');
  const [slWt, setSlWt] = useState<WorkingType>('MARK_PRICE');
  const [workingType, setWorkingType] = useState<WorkingType>('MARK_PRICE');
  const [modeOpen, setModeOpen] = useState(false);
  const [levOpen, setLevOpen] = useState(false);
  const [posModeOpen, setPosModeOpen] = useState(false);
  const [err, setErr] = useState('');

  const hedge = positionMode === 'HEDGE';
  const coin = coinFromSymbol(symbol);
  const step = filter?.stepSize ?? 0.001;
  const tick = filter?.tickSize ?? 0.01;
  const pxPrec = filter?.pricePrecision ?? 2;
  const qtyPrec = filter?.quantityPrecision ?? 3;
  const needLimitPx = panel === 'LIMIT' || panel === 'STOP_LIMIT';
  const px = needLimitPx ? Number(priceStr) || last || mark : last || mark;
  const marks = { [symbol]: mark || last };
  const avail = Math.max(0, availableBalance(state, marks));
  const lock = activeLock(state.lock, lockNow);
  const closing = closeTab;
  const openLocked = lock.locked && !closing;

  useEffect(() => {
    if (pos) {
      setMode(pos.marginMode);
      setLeverage(pos.leverage);
    }
  }, [pos?.id, pos?.marginMode, pos?.leverage]);

  useEffect(() => {
    if (!priceTouched && last > 0) setPriceStr(String(roundToStep(last, tick)));
  }, [last, priceTouched, tick]);

  useEffect(() => {
    if (tapPrice != null && tapPrice > 0) {
      setPanel('LIMIT');
      setPriceStr(String(roundToStep(tapPrice, tick)));
      setPriceTouched(true);
    }
  }, [tapPrice, tapSeq, tick]);

  useEffect(() => {
    if (placedSeq > 0) {
      setQtyStr('');
      setErr('');
    }
  }, [placedSeq]);

  const qtyCoin = useMemo(() => {
    const n = Number(qtyStr);
    if (!Number.isFinite(n) || n <= 0 || px <= 0) return 0;
    return unit === 'usdt' ? floorToStep(n / px, step) : floorToStep(n, step);
  }, [qtyStr, unit, px, step]);

  const sliderPct = percentFromQty({
    qtyCoin,
    available: avail,
    leverage,
    price: px,
    stepSize: step,
  });

  const notional = qtyCoin * px;
  const im = qtyCoin > 0 && leverage > 0 ? initialMargin(qtyCoin, px, leverage) : 0;
  const maker = panel === 'LIMIT' && (postOnly || tif === 'GTC' || tif === 'GTX');
  const fee = qtyCoin > 0 ? calcFee(notional, maker) : 0;
  const maxLongUsdt = avail * leverage;
  const maxShortUsdt = maxLongUsdt;
  const insufficient = qtyCoin > 0 && avail < im + fee;

  function stepPrice(dir: 1 | -1) {
    const cur = Number(priceStr) || last || 0;
    const next = roundToStep(cur + dir * tick, tick);
    setPriceStr(String(Math.max(0, next)));
    setPriceTouched(true);
  }

  function stepQty(dir: 1 | -1) {
    const cur = Number(qtyStr) || 0;
    const s = unit === 'usdt' ? 0.01 : step;
    const next = floorToStep(Math.max(0, cur + dir * s), s);
    setQtyStr(next > 0 ? String(next) : '');
  }

  function applyPct(p: number) {
    const v = qtyFromPercent({
      percent: p,
      available: avail,
      leverage,
      price: px,
      stepSize: step,
      unit,
    });
    setQtyStr(v > 0 ? String(v) : '');
  }

  function switchUnit(next: 'coin' | 'usdt') {
    const n = Number(qtyStr);
    if (Number.isFinite(n) && n > 0) {
      const conv = convertQtyOnUnitSwitch({ from: unit, to: next, value: n, price: px, stepSize: step });
      setQtyStr(conv > 0 ? String(conv) : '');
    }
    setUnit(next);
    setUnitOpen(false);
  }

  function previewLiq(side: OrderSide) {
    if (qtyCoin <= 0) return null;
    return previewLiquidationPrice({
      symbol,
      side: side === 'BUY' ? 'LONG' : 'SHORT',
      qty: qtyCoin,
      entryPrice: px,
      leverage: pos?.leverage ?? leverage,
      marginMode: pos?.marginMode ?? mode,
      walletBalance: state.walletBalance,
      isolatedWallet: im,
    });
  }

  function request(side: OrderSide, intent?: HedgeIntent) {
    setErr('');
    if (qtyCoin <= 0) {
      setErr('请输入数量');
      return;
    }
    if (insufficient) {
      setErr('可用保证金不足');
      return;
    }
    const type = engineOrderType(panel, side, Number(stopStr) || 0, last || px);
    const typeLabel = ORDER_TYPE_OPTIONS.find((o) => o.id === panel)?.label ?? '市价单';
    const priceLabel = panel === 'MARKET' ? '市价' : `${fmtNum(px, pxPrec)} USDT`;
    const ro = closing;
    const positionSide = hedge
      ? intent === 'OPEN_SHORT' || intent === 'CLOSE_SHORT'
        ? 'SHORT'
        : 'LONG'
      : undefined;
    const draft: ConfirmDraft = {
      side,
      type,
      typeLabel,
      symbol,
      qty: qtyCoin,
      qtyUnit: coin,
      notional: qtyCoin * (needLimitPx ? Number(priceStr) : mark || last),
      price: needLimitPx ? Number(priceStr) : undefined,
      priceLabel,
      margin: im,
      liq: previewLiq(side),
      fee,
      reduceOnly: ro,
      pricePrecision: pxPrec,
      qtyPrecision: qtyPrec,
    };
    onRequestConfirm(draft, {
      symbol,
      side,
      type,
      qty: qtyCoin,
      price: needLimitPx ? Number(priceStr) : undefined,
      stopPrice: panel === 'STOP' || panel === 'STOP_LIMIT' || panel === 'TRAILING' ? Number(stopStr) || undefined : undefined,
      timeInForce: panel === 'LIMIT' || panel === 'STOP_LIMIT' ? (postOnly ? 'GTX' : tif) : 'GTC',
      postOnly: panel === 'LIMIT' && postOnly,
      reduceOnly: ro,
      workingType,
      callbackRate: panel === 'TRAILING' ? Number(callback) / 100 : undefined,
      activationPrice: panel === 'TRAILING' && Number(activationStr) > 0 ? Number(activationStr) : undefined,
      leverage: pos?.leverage ?? leverage,
      marginMode: pos?.marginMode ?? mode,
      takeProfit: attachTpsl && tpStr ? Number(tpStr) : undefined,
      stopLoss: attachTpsl && slStr ? Number(slStr) : undefined,
      tpWorkingType: tpWt,
      slWorkingType: slWt,
      positionSide,
    });
  }

  const typeLabel = ORDER_TYPE_OPTIONS.find((o) => o.id === panel)?.label ?? '市价单';
  const lockText = lock.locked ? `${lock.reasons.join(' / ')} ${formatRemain(lock.until - lockNow)}` : '';
  const cond = panel === 'STOP' || panel === 'STOP_LIMIT' || panel === 'TRAILING';
  const longMain = closing ? CLOSE_SHORT_LABEL : OPEN_LONG_LABEL;
  const shortMain = closing ? CLOSE_LONG_LABEL : OPEN_SHORT_LABEL;
  const longSub = BUY_SUB;
  const shortSub = SELL_SUB;
  const canLabel = closing ? '可平' : '可开';

  return (
    <div className="flex flex-col gap-1.5 px-1.5 pt-1">
      <div className="flex h-10 rounded-lg bg-bn-input p-0.5">
        <button
          type="button"
          onClick={() => {
            setCloseTab(false);
          }}
          className={`h-full flex-1 rounded-md text-[13px] ${
            !closeTab ? 'bg-white font-medium text-bn-text shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-bn-muted'
          }`}
        >
          开仓
        </button>
        <button
          type="button"
          onClick={() => {
            setCloseTab(true);
          }}
          className={`h-full flex-1 rounded-md text-[13px] ${
            closeTab ? 'bg-white font-medium text-bn-text shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-bn-muted'
          }`}
        >
          平仓
        </button>
      </div>

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setModeOpen(true)}
          className="h-10 flex-1 rounded-lg bg-bn-input text-[14px] text-bn-text"
        >
          {mode === 'ISOLATED' ? '逐仓' : '全仓'}
        </button>
        <button
          type="button"
          onClick={() => setLevOpen(true)}
          className="h-10 flex-1 rounded-lg bg-bn-input text-[14px] text-bn-text"
        >
          {leverage}x
        </button>
        <button
          type="button"
          onClick={() => setPosModeOpen(true)}
          className="h-10 flex-1 rounded-lg bg-bn-input text-[14px] text-bn-text"
        >
          {hedge ? '双' : '单'}
        </button>
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => setTypeOpen((v) => !v)}
          className="flex h-11 w-full items-center rounded-lg bg-bn-input px-2 text-[13px] text-bn-text"
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-full border border-bn-muted text-[10px] text-bn-muted">
            i
          </span>
          <span className="flex-1 text-center">{typeLabel}</span>
          <span className="text-[10px] text-bn-muted">▼</span>
        </button>
        {typeOpen && (
          <div className="absolute left-0 right-0 z-20 overflow-hidden rounded-lg border border-bn-line bg-white shadow-md">
            {ORDER_TYPE_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  setPanel(o.id);
                  setTypeOpen(false);
                  if ((o.id === 'LIMIT' || o.id === 'STOP_LIMIT') && !priceStr && last > 0) {
                    setPriceStr(String(roundToStep(last, tick)));
                  }
                }}
                className={`block w-full px-2 py-2.5 text-left text-[13px] ${panel === o.id ? 'text-bn-yellow' : 'text-bn-text'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {panel !== 'MARKET' && (
        <StepInput
          label="价格"
          value={priceStr}
          onChange={(v) => {
            setPriceStr(v);
            setPriceTouched(true);
          }}
          onStep={stepPrice}
          unit="USDT"
        />
      )}

      {(panel === 'STOP' || panel === 'STOP_LIMIT') && (
        <StepInput
          label="触发价"
          value={stopStr}
          onChange={setStopStr}
          onStep={(d) => setStopStr(String(Math.max(0, roundToStep((Number(stopStr) || last) + d * tick, tick))))}
          unit="USDT"
        />
      )}
      {panel === 'TRAILING' && (
        <>
          <StepInput
            label="回调率%"
            value={callback}
            onChange={setCallback}
            onStep={(d) => setCallback(String(Math.max(0.1, Math.min(10, Number(((Number(callback) || 1) + d * 0.1).toFixed(1))))))}
            unit="%"
          />
          <StepInput
            label="激活价(可选)"
            value={activationStr}
            onChange={setActivationStr}
            onStep={(d) =>
              setActivationStr(String(Math.max(0, roundToStep((Number(activationStr) || last) + d * tick, tick))))
            }
            unit="USDT"
          />
        </>
      )}
      {cond && (
        <button
          type="button"
          onClick={() => setWorkingType((w) => (w === 'MARK_PRICE' ? 'CONTRACT_PRICE' : 'MARK_PRICE'))}
          className="self-start text-[11px] text-bn-muted"
        >
          触发: {workingType === 'MARK_PRICE' ? '标记价' : '最新价'} ▾
        </button>
      )}

      {panel === 'LIMIT' && (
        <div className="flex flex-wrap items-center gap-1 text-[10px] text-bn-muted">
          {(['GTC', 'IOC', 'FOK'] as TimeInForce[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTif(t);
                if (t !== 'GTC') setPostOnly(false);
              }}
              className={`rounded px-1.5 py-0.5 ${tif === t && !postOnly ? 'bg-bn-input text-bn-yellow' : 'bg-bn-input'}`}
            >
              {t}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setPostOnly((v) => !v);
              setTif('GTC');
            }}
            className={`rounded px-1.5 py-0.5 ${postOnly ? 'bg-bn-input text-bn-yellow' : 'bg-bn-input'}`}
          >
            Post Only
          </button>
        </div>
      )}

      <StepInput
        label=""
        value={qtyStr}
        onChange={setQtyStr}
        onStep={stepQty}
        placeholder="数量"
        unitMenu={
          <div className="relative">
            <button
              type="button"
              onClick={() => setUnitOpen((v) => !v)}
              className="px-1.5 text-[11px] text-bn-text"
            >
              {unit === 'coin' ? coin : 'USDT'} ▼
            </button>
            {unitOpen && (
              <div className="absolute right-0 top-7 z-20 overflow-hidden rounded-lg border border-bn-line bg-white shadow-md">
                <button type="button" className="block w-full px-3 py-1.5 text-left text-[12px]" onClick={() => switchUnit('coin')}>
                  {coin}
                </button>
                <button type="button" className="block w-full px-3 py-1.5 text-left text-[12px]" onClick={() => switchUnit('usdt')}>
                  USDT
                </button>
              </div>
            )}
          </div>
        }
      />

      <PercentSlider value={sliderPct} onChange={applyPct} />

      <div className="flex items-center justify-between px-0.5 text-[12px]">
        <span className="text-bn-muted">可用</span>
        <span className="flex items-center gap-1">
          <span className="tn text-bn-text">{fmtNum(avail, 2)} USDT</span>
          <button
            type="button"
            aria-label="入金"
            onClick={onDeposit}
            className="flex h-5 w-5 items-center justify-center rounded-full bg-bn-yellow text-[14px] font-bold leading-none text-black"
          >
            +
          </button>
        </span>
      </div>

      <div className="flex flex-col gap-1.5 text-[12px] text-bn-muted">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={slippageOn}
            onChange={(e) => setSlippageOn(e.target.checked)}
            className="h-3.5 w-3.5 rounded-none accent-bn-yellow"
          />
          <DashLabel>滑点容差</DashLabel>
        </label>
        {slippageOn && (
          <input
            value={slippageStr}
            onChange={(e) => setSlippageStr(e.target.value)}
            className="h-8 rounded-lg bg-bn-input px-2 text-[12px] outline-none tn"
            placeholder="%"
          />
        )}
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={attachTpsl}
            onChange={(e) => setAttachTpsl(e.target.checked)}
            className="h-3.5 w-3.5 rounded-none accent-bn-yellow"
          />
          <DashLabel>止盈/止损</DashLabel>
        </label>
      </div>

      {attachTpsl && (
        <div className="space-y-1">
          <TpslLine label="止盈价" value={tpStr} onChange={setTpStr} wt={tpWt} onWt={setTpWt} />
          <TpslLine label="止损价" value={slStr} onChange={setSlStr} wt={slWt} onWt={setSlWt} />
        </div>
      )}

      {(err || insufficient) && (
        <div className="text-[11px] text-bn-red">{err || '可用保证金不足'}</div>
      )}

      <SideBlock
        canLabel={canLabel}
        canValue={fmtNum(maxLongUsdt, 2)}
        margin={fmtNum(im, 2)}
        main={openLocked && !closing ? lockText : longMain}
        sub={longSub}
        color="green"
        disabled={openLocked && !closing}
        onClick={() =>
          request('BUY', hedge ? (closing ? 'CLOSE_SHORT' : 'OPEN_LONG') : undefined)
        }
      />
      <SideBlock
        canLabel={canLabel}
        canValue={fmtNum(maxShortUsdt, 2)}
        margin={fmtNum(im, 2)}
        main={openLocked && !closing ? lockText : shortMain}
        sub={shortSub}
        color="red"
        disabled={openLocked && !closing}
        onClick={() =>
          request('SELL', hedge ? (closing ? 'CLOSE_LONG' : 'OPEN_SHORT') : undefined)
        }
      />

      <MarginModeSheet
        open={modeOpen}
        value={mode}
        disabled={state.positions.some((p) => p.symbol === symbol)}
        onClose={() => setModeOpen(false)}
        onConfirm={setMode}
      />
      <LeverageSheet
        open={levOpen}
        value={leverage}
        max={maxLevCap}
        symbol={symbol}
        onClose={() => setLevOpen(false)}
        onConfirm={(n) => {
          if (state.positions.some((p) => p.symbol === symbol) && onCommitLeverage) {
            const e = onCommitLeverage(n);
            if (e) {
              setErr(e);
              return;
            }
          }
          setLeverage(n);
        }}
      />
      <PrefsSheet
        open={posModeOpen}
        mode={positionMode}
        onClose={() => setPosModeOpen(false)}
        onMode={(m) => onPositionMode?.(m) ?? undefined}
      />
    </div>
  );
}

function SideBlock({
  canLabel,
  canValue,
  margin,
  main,
  sub,
  color,
  disabled,
  onClick,
}: {
  canLabel: string;
  canValue: string;
  margin: string;
  main: string;
  sub: string;
  color: 'green' | 'red';
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="mt-1">
      <div className="flex justify-between text-[12px]">
        <DashLabel>{canLabel}</DashLabel>
        <span className="tn text-bn-text">{canValue} USDT</span>
      </div>
      <div className="mt-0.5 flex justify-between text-[12px]">
        <DashLabel>保证金</DashLabel>
        <span className="tn text-bn-text">{margin} USDT</span>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={`relative mt-1 flex h-12 w-full items-center rounded-lg px-3 text-white disabled:bg-bn-input disabled:text-bn-muted ${
          color === 'green' ? 'bg-bn-green' : 'bg-bn-red'
        }`}
      >
        <span className="w-full text-center text-[17px] font-bold">{main}</span>
        {!disabled && <span className="absolute right-3 text-[13px] font-normal">{sub}</span>}
      </button>
    </div>
  );
}

function TpslLine({
  label,
  value,
  onChange,
  wt,
  onWt,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  wt: WorkingType;
  onWt: (w: WorkingType) => void;
}) {
  return (
    <div className="flex h-9 items-center rounded-lg bg-bn-input px-1">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        className="min-w-0 flex-1 bg-transparent px-1 text-[12px] outline-none tn"
      />
      <button
        type="button"
        onClick={() => onWt(wt === 'MARK_PRICE' ? 'CONTRACT_PRICE' : 'MARK_PRICE')}
        className="shrink-0 px-1 text-[10px] text-bn-muted"
      >
        {wt === 'MARK_PRICE' ? '标记价' : '最新价'} ▾
      </button>
    </div>
  );
}
