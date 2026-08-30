import type { ReactNode } from 'react';

export default function BottomSheet({
  open,
  onClose,
  title,
  children,
  heightClass = 'max-h-[85%]',
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  heightClass?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="关闭"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div
        className={`relative w-full max-w-lg ${heightClass} overflow-y-auto rounded-t-sheet bg-bn-card pb-[max(16px,env(safe-area-inset-bottom))] animate-sheetUp`}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-bn-line" />
        {title && (
          <div className="px-4 py-3 text-center text-[16px] font-semibold text-bn-text">{title}</div>
        )}
        {children}
      </div>
    </div>
  );
}
