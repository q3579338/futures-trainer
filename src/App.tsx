import { useEffect, useState } from 'react';
import LiqOverlay from './components/LiqOverlay';
import DepositModal from './components/DepositModal';
import ConnectionBanner from './components/ConnectionBanner';
import BottomNav from './components/BottomNav';
import TradePage from './pages/TradePage';
import AssetPage from './pages/AssetPage';
import ReviewPage from './pages/ReviewPage';
import { setMarketExtras, setTickHandlers, useMarketStore } from './store/marketStore';
import { useSimStore } from './store/simStore';

export default function App() {
  const [now, setNow] = useState(Date.now());
  const [needDeposit, setNeedDeposit] = useState(false);
  const [nav, setNav] = useState<'futures' | 'assets'>('futures');
  const [review, setReview] = useState(false);
  const [assetDeposit, setAssetDeposit] = useState(false);
  const sim = useSimStore();

  useEffect(() => {
    setTickHandlers({
      onMark: () => useSimStore.getState().onMarkTick(),
      onTrade: () => useSimStore.getState().onTradeTick(),
    });
    let cancelled = false;
    void (async () => {
      await useSimStore.getState().hydrate();
      await useMarketStore.getState().hydrateEndpoints();
      if (!cancelled) useMarketStore.getState().start();
    })();
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      clearInterval(t);
      useMarketStore.getState().stop();
    };
  }, []);

  useEffect(() => {
    const symbols = sim.state.positions.map((p) => p.symbol);
    setMarketExtras(symbols);
  }, [sim.state.positions]);

  useEffect(() => {
    if (sim.hydrated && sim.state.totalDeposited <= 0) setNeedDeposit(true);
  }, [sim.hydrated, sim.state.totalDeposited]);

  return (
    <div className="mx-auto flex h-full max-w-lg flex-col bg-bn-bg">
      <ConnectionBanner />
      <div className="min-h-0 flex-1 overflow-hidden">
        {nav === 'futures' ? (
          <TradePage now={now} />
        ) : (
          <AssetPage
            now={now}
            onTrade={() => setNav('futures')}
            onReview={() => setReview(true)}
            onDeposit={() => setAssetDeposit(true)}
          />
        )}
      </div>
      <BottomNav active={nav} onChange={setNav} />
      <LiqOverlay flash={sim.liqFlash} onClose={() => sim.clearLiq()} />
      <DepositModal
        open={needDeposit}
        title="先入一笔模拟金"
        onClose={() => setNeedDeposit(false)}
        onConfirm={(n) => sim.deposit(n)}
      />
      <DepositModal
        open={assetDeposit}
        onClose={() => setAssetDeposit(false)}
        onConfirm={(n) => sim.deposit(n)}
      />
      {review && <ReviewPage onBack={() => setReview(false)} />}
    </div>
  );
}
