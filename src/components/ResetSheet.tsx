import BottomSheet from './BottomSheet';

export default function ResetSheet({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="确认重置账户？">
      <div className="px-4 pb-4">
        <div className="text-[12px] leading-5 text-bn-muted">
          将清空持仓、挂单、成交与入金记录，锁定状态一并清除。不可恢复。
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="h-10 flex-1 rounded bg-bn-input text-[14px]">
            取消
          </button>
          <button type="button" onClick={onConfirm} className="h-10 flex-1 rounded bg-bn-red text-[14px] text-white">
            确认重置
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
