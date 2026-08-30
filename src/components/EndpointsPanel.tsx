import { useEffect, useState } from 'react';
import { DEFAULT_REST_BASE, DEFAULT_WS_BASE, getEndpoints, validateEndpoints } from '../market/endpoints';
import { useMarketStore } from '../store/marketStore';
import FullScreen from './FullScreen';

export default function EndpointsPanel({ onBack }: { onBack: () => void }) {
  const market = useMarketStore();
  const [restInput, setRestInput] = useState(DEFAULT_REST_BASE);
  const [wsInput, setWsInput] = useState(DEFAULT_WS_BASE);
  const [srcHint, setSrcHint] = useState('');

  useEffect(() => {
    const e = getEndpoints();
    setRestInput(e.restBase);
    setWsInput(e.wsBase);
  }, [market.endpoints]);

  return (
    <FullScreen title="行情源设置" onBack={onBack}>
      <div className="px-3 py-3">
        <div className="mb-3 text-[11px] text-bn-muted">
          自定义 REST / WS 基址，指向镜像或本地代理。保存到本机 IndexedDB，立即重连生效。
        </div>
        <label className="mb-2 block text-[12px]">
          <div className="mb-1 text-bn-muted">REST 基址</div>
          <input
            value={restInput}
            onChange={(e) => setRestInput(e.target.value)}
            className="h-10 w-full rounded border border-bn-line bg-bn-input px-2 outline-none focus:border-bn-yellow"
          />
        </label>
        <label className="mb-2 block text-[12px]">
          <div className="mb-1 text-bn-muted">WS 基址</div>
          <input
            value={wsInput}
            onChange={(e) => setWsInput(e.target.value)}
            className="h-10 w-full rounded border border-bn-line bg-bn-input px-2 outline-none focus:border-bn-yellow"
          />
        </label>
        <div className="mt-1 text-[11px] text-bn-muted">
          默认 {DEFAULT_REST_BASE} 与 {DEFAULT_WS_BASE}
        </div>
        <button
          type="button"
          onClick={() => {
            const err = validateEndpoints(restInput, wsInput);
            if (err) {
              setSrcHint(err);
              return;
            }
            void market.applyEndpoints({ restBase: restInput, wsBase: wsInput }).then(() => {
              setSrcHint('已保存并重连。');
            });
          }}
          className="mt-3 h-10 w-full rounded bg-bn-input text-[14px]"
        >
          保存并重连
        </button>
        <button
          type="button"
          onClick={() => {
            setRestInput(DEFAULT_REST_BASE);
            setWsInput(DEFAULT_WS_BASE);
            void market.applyEndpoints({ restBase: DEFAULT_REST_BASE, wsBase: DEFAULT_WS_BASE }).then(() => {
              setSrcHint('已恢复默认行情源并重连。');
            });
          }}
          className="mt-2 w-full text-[12px] text-bn-muted"
        >
          恢复默认
        </button>
        {srcHint && <div className="mt-2 text-[12px] text-bn-yellow">{srcHint}</div>}
      </div>
    </FullScreen>
  );
}
