import { useEffect, useState } from 'react';
import { isRelaxing } from '../engine/risk';
import type { RiskConfig } from '../engine/types';
import { DEFAULT_RISK_CONFIG } from '../engine/types';
import { useSimStore } from '../store/simStore';
import FullScreen from './FullScreen';

export default function RiskSettings({ onBack }: { onBack: () => void }) {
  const sim = useSimStore();
  const [draft, setDraft] = useState<RiskConfig>(sim.state.pendingRiskConfig);
  const [count, setCount] = useState(0);
  const [hint, setHint] = useState('');
  const [relaxWait, setRelaxWait] = useState(false);

  useEffect(() => {
    setDraft(sim.state.pendingRiskConfig);
  }, [sim.state.pendingRiskConfig]);

  useEffect(() => {
    if (count <= 0) return;
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count]);

  useEffect(() => {
    if (count !== 0 || !relaxWait) return;
    sim.setPendingRisk(draft);
    setRelaxWait(false);
    setHint('已保存放宽后的风控。请完全退出并重启 App 后生效。');
  }, [count, relaxWait, draft, sim]);

  function save() {
    const active = sim.state.riskConfig;
    const relaxing = isRelaxing(active, draft);
    if (relaxing && count <= 0) {
      setCount(30);
      setRelaxWait(true);
      setHint('放宽限制需等待 30 秒确认。确认后仍要重启 App 才会生效。');
      return;
    }
    if (relaxing && count > 0) {
      setHint(`请等待倒计时结束（还剩 ${count}s）`);
      return;
    }
    sim.setPendingRisk(draft);
    setHint('已保存。请完全退出并重启 App 后生效。');
    setCount(0);
  }

  return (
    <FullScreen title="风控设置" onBack={onBack}>
      <div className="px-3 py-3">
        <div className="mb-3 text-[11px] text-bn-muted">
          修改后需重启 App 生效。放宽限制有 30 秒倒计时确认。没有「我确定要解锁」按钮。
        </div>
        <Field
          label="日亏损上限（占日初权益 %）"
          value={String(Math.round(draft.dailyLossPct * 1000) / 10)}
          onChange={(v) => setDraft({ ...draft, dailyLossPct: Math.max(0.1, Number(v)) / 100 })}
        />
        <Field
          label="连亏笔数锁定阈值"
          value={String(draft.consecutiveLossLimit)}
          onChange={(v) => setDraft({ ...draft, consecutiveLossLimit: Math.max(1, Math.floor(Number(v))) })}
        />
        <Field
          label="单笔最大保证金占比 %"
          value={String(Math.round(draft.maxMarginPct * 1000) / 10)}
          onChange={(v) => setDraft({ ...draft, maxMarginPct: Math.max(1, Number(v)) / 100 })}
        />
        <Field
          label="最大杠杆"
          value={String(draft.maxLeverage)}
          onChange={(v) => setDraft({ ...draft, maxLeverage: Math.max(1, Math.floor(Number(v))) })}
        />
        <div className="mt-1 text-[11px] text-bn-muted">
          当前生效：日亏 {sim.state.riskConfig.dailyLossPct * 100}% · 连亏 {sim.state.riskConfig.consecutiveLossLimit} ·
          保证金 {sim.state.riskConfig.maxMarginPct * 100}% · 杠杆 {sim.state.riskConfig.maxLeverage}x
          <br />
          爆仓锁定固定 24 小时，连亏锁定固定 4 小时，UTC 00:00 解除日亏锁。
        </div>
        <button type="button" onClick={save} className="mt-3 h-10 w-full rounded bg-bn-input text-[14px]">
          {count > 0 ? `放宽确认中 ${count}s` : '保存（重启后生效）'}
        </button>
        {hint && <div className="mt-2 text-[12px] text-bn-yellow">{hint}</div>}
        <button
          type="button"
          onClick={() => {
            setDraft({ ...DEFAULT_RISK_CONFIG });
            setHint('已恢复默认草稿，点保存并重启后生效。');
          }}
          className="mt-2 w-full text-[12px] text-bn-muted"
        >
          恢复默认 5% / 3 笔 / 20% / 20x
        </button>
      </div>
    </FullScreen>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="mb-2 block text-[12px]">
      <div className="mb-1 text-bn-muted">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded border border-bn-line bg-bn-input px-2 tn outline-none focus:border-bn-yellow"
      />
    </label>
  );
}
