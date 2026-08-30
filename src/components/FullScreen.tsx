import type { ReactNode } from 'react';

export default function FullScreen({
  title,
  onBack,
  extra,
  children,
}: {
  title: string;
  onBack: () => void;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 mx-auto flex max-w-lg flex-col bg-bn-bg">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-bn-line px-2">
        <button type="button" onClick={onBack} className="flex h-11 w-11 items-center justify-center text-bn-text">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M15 6L9 12L15 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="text-[15px] font-medium">{title}</div>
        <div className="flex h-11 min-w-11 items-center justify-end">{extra}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">{children}</div>
    </div>
  );
}
