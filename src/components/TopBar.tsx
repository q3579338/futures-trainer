import { fmtPct, pnlClass } from '../lib/format';

export default function TopBar({
  symbol,
  changePct,
  notice,
  onDismissNotice,
  onPickSymbol,
  onKline,
  onMore,
}: {
  symbol: string;
  changePct: number;
  notice?: string | null;
  onDismissNotice?: () => void;
  onPickSymbol: () => void;
  onKline: () => void;
  onMore: () => void;
}) {
  return (
    <div className="shrink-0">
      <div className="flex h-11 items-center px-3">
        <button type="button" className="text-[20px] font-bold text-bn-text">
          U本位
        </button>
        <span className="ml-3 text-[14px] text-bn-muted">币本位</span>
        <span className="ml-3 text-[14px] text-bn-muted">期权</span>
        <span className="ml-3 text-[14px] text-bn-muted">跟单</span>
        <button
          type="button"
          onClick={onMore}
          className="ml-auto flex h-11 w-9 items-center justify-center text-bn-text"
          aria-label="菜单"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 6h16v1.8H4V6zm0 5.1h16v1.8H4v-1.8zm0 5.1h16V18H4v-1.8z" />
          </svg>
        </button>
      </div>
      {notice ? (
        <div className="flex items-center gap-1.5 bg-bn-faint px-3 py-1.5 text-[12px] text-bn-muted">
          <span>🔔</span>
          <span className="min-w-0 flex-1 truncate">{notice}</span>
          <button type="button" onClick={onDismissNotice} className="px-1 text-bn-hint" aria-label="关闭">
            ✕
          </button>
        </div>
      ) : null}
      <div className="flex h-11 items-center px-3">
        <button type="button" onClick={onPickSymbol} className="flex min-w-0 items-center gap-1">
          <span className="truncate text-[22px] font-bold text-bn-text">{symbol}</span>
          <span className="rounded bg-bn-input px-1 py-[1px] text-[11px] leading-4 text-bn-muted">永续</span>
          <svg width="10" height="10" viewBox="0 0 12 12" className="text-bn-muted">
            <path d="M2 4L6 8L10 4" fill="currentColor" />
          </svg>
        </button>
        <div className="ml-auto flex items-center">
          <button type="button" onClick={onKline} className="flex h-11 w-10 items-center justify-center text-bn-text" aria-label="K线">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M6 4v16M6 8h3v6H6M18 4v16M15 7h3v8h-3M12 4v16M10 10h4v7h-4" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>
          <button type="button" onClick={onMore} className="relative flex h-11 w-10 items-center justify-center text-bn-text" aria-label="更多">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="6" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="18" cy="12" r="1.6" />
            </svg>
            <span className="absolute right-2 top-3 h-1.5 w-1.5 rounded-full bg-bn-yellow" />
          </button>
        </div>
      </div>
      <div className={`px-3 pb-1 text-[15px] tn ${pnlClass(changePct)}`}>{fmtPct(changePct)}</div>
    </div>
  );
}
