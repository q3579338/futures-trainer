import { useEffect, useMemo, useState } from 'react';
import AmendOrderSheet from '../components/AmendOrderSheet';
import ClosePositionSheet from '../components/ClosePositionSheet';
import LeverageSheet from '../components/LeverageSheet';
import ConfirmOrderSheet, { type ConfirmDraft } from '../components/ConfirmOrderSheet';
import ContractInfoSheet from '../components/ContractInfoSheet';
import DepositModal from '../components/DepositModal';
import DiagnosePanel from '../components/DiagnosePanel';
import EndpointsPanel from '../components/EndpointsPanel';
import FundingHistorySheet from '../components/FundingHistorySheet';
import IsolatedMarginSheet from '../components/IsolatedMarginSheet';
import KlinePage from '../components/KlinePage';
import MoreMenu from '../components/MoreMenu';
import OrderBook from '../components/OrderBook';
import OrderForm from '../components/OrderForm';
import PositionsDock from '../components/PositionsDock';
import PrefsSheet from '../components/PrefsSheet';
import ResetSheet from '../components/ResetSheet';
import RiskSettings from '../components/RiskSettings';
import SymbolPicker from '../components/SymbolPicker';
import TopBar from '../components/TopBar';
import TpslSheet from '../components/TpslSheet';
import { availableBalance } from '../engine/account';
import { maxLeverageForSymbol } from '../engine/brackets';
import type { PlaceOrderInput } from '../engine/engine';
import { positionLiquidationPrice } from '../engine/liquidation';
import type { OpenReason, Order, Position } from '../engine/types';
import { useMarketStore } from '../store/marketStore';
import { useSimStore } from '../store/simStore';
import ReviewPage from './ReviewPage';

export default function TradePage({ now }: { now: number }) {
  const market = useMarketStore();
  const sim = useSimStore();
  const [picker, setPicker] = useState(false);
  const [more, setMore] = useState(false);
  const [notice, setNotice] = useState<string | null>('重要提示: 本页为模拟盘，盈亏不涉及真实资金');
  const [levPos, setLevPos] = useState<Position | null>(null);
  const [kline, setKline] = useState(false);
  const [deposit, setDeposit] = useState(false);
  const [tapPrice, setTapPrice] = useState<number | null>(null);
  const [tapN, setTapN] = useState(0);
  const [placedSeq, setPlacedSeq] = useState(0);
  const [confirm, setConfirm] = useState<{ draft: ConfirmDraft; input: PlaceOrderInput } | null>(null);
  const [confirmErr, setConfirmErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [closePos, setClosePos] = useState<Position | null>(null);
  const [tpslPos, setTpslPos] = useState<Position | null>(null);
  const [marginPos, setMarginPos] = useState<Position | null>(null);
  const [amendOrder, setAmendOrder] = useState<Order | null>(null);
  const [page, setPage] = useState<null | 'review' | 'risk' | 'diag' | 'endpoints'>(null);
  const [prefs, setPrefs] = useState(false);
  const [contract, setContract] = useState(false);
  const [fundingHist, setFundingHist] = useState(false);
  const [resetAsk, setResetAsk] = useState(false);

  const marks = useMemo(
    () => ({ ...market.markPrices, [market.symbol]: market.markPrice || market.lastPrice }),
    [market.markPrices, market.symbol, market.markPrice, market.lastPrice],
  );
  const avail = availableBalance(sim.state, marks);
  const pos = sim.state.positions.find((p) => p.symbol === market.symbol);
  const lp = pos ? positionLiquidationPrice(sim.state, pos, marks[pos.symbol] ?? pos.entryPrice, marks) : undefined;
  const pending = sim.state.orders.filter((o) => o.symbol === market.symbol && o.price).map((o) => o.price!);
  const tpslLines = sim.state.positions
    .filter((p) => p.symbol === market.symbol)
    .flatMap((p) => [p.takeProfit, p.stopLoss])
    .filter((n): n is number => n != null && n > 0);
  const ticker = market.tickers[market.symbol];
  const chg = ticker?.priceChangePercent ?? 0;
  const filter = market.filters[market.symbol];

  useEffect(() => {
    setTapPrice(null);
  }, [market.symbol]);

  async function placeWithReason(reason: OpenReason | null) {
    if (!confirm) return;
    if (!confirm.draft.reduceOnly && !reason) return;
    setBusy(true);
    setConfirmErr('');
    const input: PlaceOrderInput = confirm.draft.reduceOnly
      ? confirm.input
      : { ...confirm.input, reason: reason! };
    const e = await sim.place(input);
    setBusy(false);
    if (e) {
      setConfirmErr(e);
      return;
    }
    setConfirm(null);
    setPlacedSeq((n) => n + 1);
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <TopBar
        symbol={market.symbol}
        changePct={chg}
        notice={notice}
        onDismissNotice={() => setNotice(null)}
        onPickSymbol={() => setPicker(true)}
        onKline={() => setKline(true)}
        onMore={() => setMore(true)}
      />

      {/* 交易区 + 持仓区整体纵向滚动，跟币安 App 一致：两个下单按钮必须完整露出，不做内部裁剪 */}
      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
      <div className="flex shrink-0 items-stretch">
        <div className="w-[57%]">
          <OrderForm
            key={market.symbol}
            symbol={market.symbol}
            state={sim.state}
            mark={market.markPrice || market.lastPrice}
            last={market.lastPrice}
            filter={filter}
            lockNow={now}
            tapPrice={tapPrice}
            tapSeq={tapN}
            placedSeq={placedSeq}
            positionMode={sim.state.positionMode ?? 'ONE_WAY'}
            onCommitLeverage={(n) => sim.changeLeverage(market.symbol, n)}
            onPositionMode={(m) => sim.setPositionMode(m)}
            onDeposit={() => setDeposit(true)}
            onRequestConfirm={(draft, input) => {
              setConfirmErr('');
              setConfirm({ draft, input });
            }}
          />
        </div>
        <div className="w-[43%] border-l border-bn-line">
          <OrderBook
            book={market.depth}
            last={market.lastPrice}
            mark={market.markPrice}
            precision={filter?.pricePrecision ?? 2}
            qtyPrecision={filter?.quantityPrecision ?? 3}
            tickSize={filter?.tickSize ?? 0.1}
            symbol={market.symbol}
            recentTrades={market.recentTrades}
            fundingRate={market.fundingRate}
            nextFundingTime={market.nextFundingTime}
            fundingIntervalHours={market.fundingIntervals[market.symbol] ?? 8}
            now={now}
            onPickPrice={(p) => {
              setTapPrice(p);
              setTapN((n) => n + 1);
            }}
          />
        </div>
      </div>

      <PositionsDock
        state={sim.state}
        marks={marks}
        filters={market.filters}
        currentSymbol={market.symbol}
        klines={market.klines}
        onCancel={(id) => sim.cancel(id)}
        onAmend={setAmendOrder}
        onTpsl={setTpslPos}
        onClosePos={setClosePos}
        onLeverage={setLevPos}
        onCloseAll={() => sim.closeSymbol(null)}
        onMargin={setMarginPos}
        onReverse={(p) => {
          setConfirmErr('');
          setConfirm({
            draft: {
              side: p.side === 'LONG' ? 'SELL' : 'BUY',
              type: 'MARKET',
              typeLabel: '市价',
              symbol: p.symbol,
              qty: p.qty * 2,
              qtyUnit: p.symbol.replace(/USDT$/i, ''),
              priceLabel: '市价',
              margin: p.initialMargin,
              liq: null,
              fee: 0,
              reduceOnly: false,
              pricePrecision: market.filters[p.symbol]?.pricePrecision ?? 2,
              qtyPrecision: market.filters[p.symbol]?.quantityPrecision ?? 3,
            },
            input: {
              symbol: p.symbol,
              side: p.side === 'LONG' ? 'SELL' : 'BUY',
              type: 'MARKET',
              qty: p.qty * 2,
              reduceOnly: false,
              leverage: p.leverage,
              marginMode: p.marginMode,
            },
          });
        }}
      />
      </div>

      <SymbolPicker open={picker} onClose={() => setPicker(false)} onPick={(s) => market.setSymbol(s)} />
      <MoreMenu
        open={more}
        onClose={() => setMore(false)}
        onPick={(id) => {
          if (id === 'reset') setResetAsk(true);
          else if (id === 'prefs') setPrefs(true);
          else if (id === 'contract') setContract(true);
          else if (id === 'funding') setFundingHist(true);
          else setPage(id);
        }}
      />
      <ConfirmOrderSheet
        open={!!confirm}
        draft={confirm?.draft ?? null}
        busy={busy}
        error={confirmErr}
        onClose={() => {
          setConfirm(null);
          setConfirmErr('');
        }}
        onConfirm={(r) => void placeWithReason(r)}
      />
      <ClosePositionSheet
        open={!!closePos}
        symbol={closePos?.symbol ?? ''}
        qty={closePos?.qty ?? 0}
        last={closePos ? market.lastPrices[closePos.symbol] ?? market.lastPrice : 0}
        stepSize={closePos ? market.filters[closePos.symbol]?.stepSize ?? 0.001 : 0.001}
        pricePrecision={closePos ? market.filters[closePos.symbol]?.pricePrecision ?? 2 : 2}
        qtyPrecision={closePos ? market.filters[closePos.symbol]?.quantityPrecision ?? 3 : 3}
        onClose={() => setClosePos(null)}
        onConfirm={(opts) => {
          if (!closePos) return;
          if (opts.type === 'MARKET') {
            const e = sim.closePosition(closePos.id, opts.qty);
            if (e) setConfirmErr(e);
          } else {
            void sim.place({
              symbol: closePos.symbol,
              side: closePos.side === 'LONG' ? 'SELL' : 'BUY',
              type: opts.type,
              qty: opts.qty,
              price: opts.price,
              reduceOnly: true,
              leverage: closePos.leverage,
              marginMode: closePos.marginMode,
              positionSide: closePos.side,
            });
          }
          setClosePos(null);
        }}
      />
      {tpslPos && (
        <TpslSheet
          open
          pos={tpslPos}
          onClose={() => setTpslPos(null)}
          onConfirm={(patch) => {
            sim.amendTpsl(tpslPos.id, patch);
            setTpslPos(null);
          }}
        />
      )}
      {levPos && (
        <LeverageSheet
          open
          value={levPos.leverage}
          max={Math.min(maxLeverageForSymbol(levPos.symbol), 125, sim.state.riskConfig.maxLeverage)}
          symbol={levPos.symbol}
          onClose={() => setLevPos(null)}
          onConfirm={(n) => {
            const e = sim.changeLeverage(levPos.symbol, n);
            if (e) setConfirmErr(e);
          }}
          onOpenIsolated={
            levPos.marginMode === 'ISOLATED'
              ? () => {
                  setMarginPos(levPos);
                  setLevPos(null);
                }
              : undefined
          }
        />
      )}
      <IsolatedMarginSheet
        open={!!marginPos}
        pos={marginPos}
        mark={marginPos ? marks[marginPos.symbol] ?? marginPos.entryPrice : 0}
        available={avail}
        pricePrecision={marginPos ? market.filters[marginPos.symbol]?.pricePrecision ?? 2 : 2}
        onClose={() => setMarginPos(null)}
        onConfirm={(delta) => sim.adjustIsolated(marginPos!.id, delta)}
      />
      <AmendOrderSheet
        open={!!amendOrder}
        order={amendOrder}
        onClose={() => setAmendOrder(null)}
        onConfirm={(patch) => sim.amendOrder(amendOrder!.id, patch)}
      />
      <PrefsSheet
        open={prefs}
        mode={sim.state.positionMode ?? 'ONE_WAY'}
        onClose={() => setPrefs(false)}
        onMode={(m) => sim.setPositionMode(m)}
      />
      <ContractInfoSheet
        open={contract}
        symbol={market.symbol}
        filter={filter}
        fundingRate={market.fundingRate}
        nextFundingTime={market.nextFundingTime}
        onClose={() => setContract(false)}
      />
      <FundingHistorySheet
        open={fundingHist}
        trades={sim.state.trades}
        onClose={() => setFundingHist(false)}
      />
      <DepositModal
        open={deposit}
        onClose={() => setDeposit(false)}
        onConfirm={(n) => sim.deposit(n)}
      />
      <ResetSheet
        open={resetAsk}
        onClose={() => setResetAsk(false)}
        onConfirm={() => {
          void sim.reset();
          setResetAsk(false);
        }}
      />

      {kline && (
        <KlinePage
          symbol={market.symbol}
          klines={market.klines}
          interval={market.interval}
          onInterval={(i) => market.setInterval(i)}
          entry={pos?.entryPrice}
          liq={lp ?? undefined}
          pending={pending}
          tpsl={tpslLines}
          onBack={() => setKline(false)}
        />
      )}
      {page === 'review' && <ReviewPage onBack={() => setPage(null)} />}
      {page === 'risk' && <RiskSettings onBack={() => setPage(null)} />}
      {page === 'diag' && <DiagnosePanel onBack={() => setPage(null)} />}
      {page === 'endpoints' && <EndpointsPanel onBack={() => setPage(null)} />}
    </div>
  );
}
