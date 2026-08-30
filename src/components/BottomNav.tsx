export type NavId = 'home' | 'markets' | 'spot' | 'futures' | 'assets';

const ITEMS: { id: NavId; label: string; enabled: boolean }[] = [
  { id: 'home', label: '首页', enabled: false },
  { id: 'markets', label: '行情', enabled: false },
  { id: 'spot', label: '交易', enabled: false },
  { id: 'futures', label: '合约', enabled: true },
  { id: 'assets', label: '资产', enabled: true },
];

export default function BottomNav({
  active,
  onChange,
}: {
  active: 'futures' | 'assets';
  onChange: (id: 'futures' | 'assets') => void;
}) {
  return (
    <nav className="safe-bottom flex shrink-0 border-t border-bn-line bg-white">
      {ITEMS.map((it) => {
        const on = it.enabled && active === it.id;
        return (
          <button
            key={it.id}
            type="button"
            disabled={!it.enabled}
            onClick={() => {
              if (it.id === 'futures' || it.id === 'assets') onChange(it.id);
            }}
            className={`flex h-12 flex-1 flex-col items-center justify-center gap-0.5 ${
              it.enabled ? '' : 'opacity-40'
            }`}
          >
            <NavIcon id={it.id} active={on} />
            <span className={`text-[10px] ${on ? 'font-medium text-bn-text' : 'text-bn-muted'}`}>
              {it.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function NavIcon({ id, active }: { id: NavId; active: boolean }) {
  const c = active ? '#1E2329' : '#707A8A';
  if (id === 'home') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M4 10.5L12 4l8 6.5V20H4V10.5Z" stroke={c} strokeWidth="1.6" />
      </svg>
    );
  }
  if (id === 'markets') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M5 18V11M12 18V6M19 18v-5" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === 'spot') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M7 8h10M7 12h6M7 16h8" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === 'futures') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="5" width="16" height="14" rx="2" stroke={c} strokeWidth="1.6" />
        <path d="M8 15V10M12 15V8M16 15v-3" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="6" width="16" height="12" rx="2" stroke={c} strokeWidth="1.6" />
      <path d="M4 10h16" stroke={c} strokeWidth="1.6" />
    </svg>
  );
}
