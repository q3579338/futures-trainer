import { fmtDuration, fmtPnl } from '../lib/format';
import type { LiqFlash } from '../store/simStore';

export default function LiqOverlay({
  flash,
  onClose,
}: {
  flash: LiqFlash | null;
  onClose: () => void;
}) {
  if (!flash) return null;
  return (
    <div className="fixed inset-0 z-[60] flex animate-flashLiq items-center justify-center bg-[#F6465D] p-6 text-white">
      <div className="w-full max-w-sm text-center">
        <div className="text-sm tracking-widest">爆仓</div>
        <div className="mt-2 text-3xl font-semibold">{flash.symbol}</div>
        <div className="mt-6 text-xs opacity-80">亏损金额</div>
        <div className="font-mono text-4xl font-bold">{fmtPnl(flash.pnl)}</div>
        <div className="mt-6 grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="opacity-70">持仓时长</div>
            <div className="mt-1">{fmtDuration(flash.holdMs)}</div>
          </div>
          <div>
            <div className="opacity-70">开仓理由</div>
            <div className="mt-1">{flash.reason ?? '—'}</div>
          </div>
          <div>
            <div className="opacity-70">TILT_SCORE</div>
            <div className="mt-1 font-mono text-lg">{flash.tiltScore}</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="mt-10 w-full rounded-lg bg-white py-3 text-sm font-medium text-bn-red"
        >
          我知道了
        </button>
      </div>
    </div>
  );
}
