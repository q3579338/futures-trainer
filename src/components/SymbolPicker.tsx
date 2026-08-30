import { useEffect, useMemo, useState } from 'react';
import { fmtNum, fmtPct, fmtVolCn, pnlClass } from '../lib/format';
import { coinFromSymbol } from '../lib/tradeUi';
import { POPULAR } from '../market/rest';
import { useMarketStore } from '../store/marketStore';
import BottomSheet from './BottomSheet';

const TAGS = ['USDC', 'Chinese', 'Alpha', 'AI', 'Layer-1', 'RWA'];
const FAV_KEY = 'futrainer-fav-symbols';

function loadFavs(): string[] {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export default function SymbolPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (s: string) => void;
}) {
  const market = useMarketStore();
  const [q, setQ] = useState('');
  const [favs, setFavs] = useState<string[]>(loadFavs);
  const [tag, setTag] = useState<string | null>(null);

  useEffect(() => {
    if (open) setFavs(loadFavs());
  }, [open]);

  function toggleFav(s: string) {
    setFavs((prev) => {
      const next = prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s];
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
      return next;
    });
  }

  const list = useMemo(() => {
    const all = market.symbols.length ? market.symbols : POPULAR;
    let src = q ? all.filter((s) => s.toLowerCase().includes(q.toLowerCase())) : POPULAR.concat(all.filter((s) => !POPULAR.includes(s)));
    if (tag) {
      const t = tag.toLowerCase();
      src = src.filter((s) => s.toLowerCase().includes(t) || coinFromSymbol(s).toLowerCase().includes(t));
    }
    return src.slice(0, 120);
  }, [market.symbols, q, tag]);

  return (
    <BottomSheet open={open} onClose={onClose} heightClass="max-h-[85%] h-[85%]">
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-10 min-w-0 flex-1 items-center rounded-lg bg-bn-input px-3">
            <span className="mr-2 text-bn-muted">⌕</span>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索"
              className="h-10 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
            />
          </div>
          <span className="text-bn-muted">↗</span>
        </div>
        <div className="mt-2 flex gap-4 overflow-x-auto text-[13px] no-scrollbar">
          <span className="text-bn-hint">自选</span>
          <span className="text-bn-hint">现货</span>
          <span className="border-b-2 border-bn-yellow pb-1 font-semibold">合约</span>
          <span className="text-bn-hint">传统金融</span>
          <span className="text-bn-hint">Alpha</span>
          <span className="text-bn-hint">期权</span>
        </div>
        <div className="mt-2 flex items-center text-[12px]">
          <span className="font-medium">U本位合约</span>
          <span className="ml-3 text-bn-hint">币本位合约</span>
          <span className="ml-auto text-bn-muted">全部 ▼</span>
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar">
          {TAGS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTag((x) => (x === t ? null : t))}
              className={`h-7 shrink-0 rounded-full px-2.5 text-[11px] ${tag === t ? 'bg-bn-input text-bn-text' : 'bg-bn-faint text-bn-muted'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="mt-2 flex text-[11px] text-bn-muted">
          <div className="flex-1">名称 ⇅ / 成交量 ⇅</div>
          <div className="text-right">最新价格 ⇅ / 24 小时涨跌 ⇅</div>
        </div>
      </div>
      <div className="overflow-y-auto px-3 pb-4 no-scrollbar">
        {list.map((s) => {
          const t = market.tickers[s];
          const last = market.lastPrices[s] ?? t?.lastPrice ?? 0;
          const chg = t?.priceChangePercent ?? 0;
          const coin = coinFromSymbol(s);
          const vol = t?.quoteVolume ?? t?.volume ?? 0;
          const starred = favs.includes(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => {
                onPick(s);
                onClose();
              }}
              className="flex w-full items-center py-2.5 text-left"
            >
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFav(s);
                }}
                className={`mr-1 text-[16px] ${starred ? 'text-bn-yellow' : 'text-bn-line'}`}
              >
                ★
              </span>
              <span className="mr-2 flex h-7 w-7 items-center justify-center rounded-full bg-bn-input text-[10px] font-semibold text-bn-text">
                {coin.slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center">
                  <span className="text-[16px] font-semibold">{s}</span>
                  <span className="ml-1 rounded bg-bn-input px-1 text-[10px] text-bn-muted">永续</span>
                </div>
                <div className="text-[11px] text-bn-muted">
                  {coin.toLowerCase()} | {fmtVolCn(vol)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[16px] tn">
                  {last ? fmtNum(last, market.filters[s]?.pricePrecision ?? 2) : '—'}
                </div>
                <div className={`text-[13px] tn ${pnlClass(chg)}`}>{t ? fmtPct(chg) : '—'}</div>
              </div>
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}
