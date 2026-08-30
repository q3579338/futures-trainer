import { hasValidMarkPrice, statusBarText } from '../market/fallback';
import { useMarketStore } from '../store/marketStore';

export default function ConnectionBanner() {
  const transport = useMarketStore((s) => s.transport);
  const mute = useMarketStore((s) => s.muteStreams);
  const hint = useMarketStore((s) => s.transportHint);
  const markPrice = useMarketStore((s) => s.markPrice);
  const latencyMs = useMarketStore((s) => s.latencyMs);
  const connected = useMarketStore((s) => s.connected);

  if (transport === 'polling') {
    return (
      <div className="shrink-0 bg-[#FFF6D6] px-3 py-1.5 text-center text-[11px] text-[#8A6D00]">
        轮询模式 · 1s · 数据更新频率低于实时，哑流走 REST，后台继续重连 WebSocket
      </div>
    );
  }
  if (transport === 'hybrid') {
    const label = statusBarText({
      transport,
      mute,
      latencyMs,
      hasMarkPrice: hasValidMarkPrice(markPrice),
      wsOpen: connected,
    });
    return (
      <div className="shrink-0 bg-[#FFF6D6] px-3 py-1.5 text-center text-[11px] text-[#8A6D00]">
        {label} · 哑流走 REST，其余仍是 WebSocket
      </div>
    );
  }
  if (hint) {
    return (
      <div className="shrink-0 bg-[#EBF9F4] px-3 py-1.5 text-center text-[11px] text-bn-green">
        {hint}
      </div>
    );
  }
  return null;
}
