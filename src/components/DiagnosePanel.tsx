import { useState } from 'react';
import { diagnoseConnection, type DiagnoseItem } from '../market/diagnose';
import FullScreen from './FullScreen';

export default function DiagnosePanel({ onBack }: { onBack: () => void }) {
  const [diagItems, setDiagItems] = useState<DiagnoseItem[]>([]);
  const [diagSummary, setDiagSummary] = useState('');
  const [diagRunning, setDiagRunning] = useState(false);

  return (
    <FullScreen title="连接诊断" onBack={onBack}>
      <div className="px-3 py-3">
        <div className="mb-3 text-[11px] text-bn-muted">
          真实探测：REST 直连 `/fapi/v1/time`，再订组合流 12 秒，逐条统计子流条数。盘口有数据不会被当成整条连接健康。
        </div>
        <button
          type="button"
          disabled={diagRunning}
          onClick={() => {
            setDiagRunning(true);
            setDiagItems([]);
            setDiagSummary('');
            void diagnoseConnection({
              onItem: (item) => setDiagItems((prev) => [...prev, item]),
            })
              .then((report) => setDiagSummary(report.summary))
              .finally(() => setDiagRunning(false));
          }}
          className="h-10 w-full rounded bg-bn-input text-[14px] disabled:opacity-50"
        >
          {diagRunning ? '诊断中…' : '开始诊断'}
        </button>
        {diagItems.length > 0 && (
          <div className="mt-3 space-y-2">
            {diagItems.map((it) => (
              <div key={it.id} className="flex items-start justify-between gap-3 text-[12px]">
                <div>
                  <span className="text-bn-text">
                    {it.id.startsWith('stream:') ? `${it.name}：${it.detail} ${it.ok ? '✅' : '❌'}` : it.name}
                  </span>
                  {!it.id.startsWith('stream:') && <div className="text-[11px] text-bn-muted">{it.detail}</div>}
                </div>
                <div className={`shrink-0 tn ${it.ok ? 'text-bn-green' : 'text-bn-red'}`}>
                  {it.id.startsWith('stream:') ? `${it.ms}ms` : `${it.ok ? '通过' : '失败'} · ${it.ms}ms`}
                </div>
              </div>
            ))}
          </div>
        )}
        {diagSummary && <div className="mt-2 text-[12px] text-bn-yellow">{diagSummary}</div>}
      </div>
    </FullScreen>
  );
}
