import BottomSheet from './BottomSheet';

const ITEMS: {
  id: 'review' | 'risk' | 'diag' | 'endpoints' | 'prefs' | 'contract' | 'funding' | 'reset';
  label: string;
}[] = [
  { id: 'prefs', label: '偏好设置' },
  { id: 'contract', label: '合约信息' },
  { id: 'funding', label: '资金费历史' },
  { id: 'review', label: '合约盈亏分析' },
  { id: 'risk', label: '风控设置' },
  { id: 'diag', label: '连接诊断' },
  { id: 'endpoints', label: '行情源设置' },
  { id: 'reset', label: '重置账户' },
];

export default function MoreMenu({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (id: (typeof ITEMS)[number]['id']) => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="更多">
      <div className="px-2 pb-2">
        {ITEMS.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => {
              onPick(it.id);
              onClose();
            }}
            className={`flex h-12 w-full items-center px-3 text-left text-[15px] ${
              it.id === 'reset' ? 'text-bn-red' : 'text-bn-text'
            }`}
          >
            {it.label}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
