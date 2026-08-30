export default function MiniBars({
  items,
  colorFor,
}: {
  items: { label: string; value: number }[];
  colorFor?: (v: number) => string;
}) {
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 0.0001);
  return (
    <div className="space-y-1">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-2 text-[11px]">
          <div className="w-16 shrink-0 text-bn-muted">{i.label}</div>
          <div className="h-2 flex-1 overflow-hidden rounded bg-bn-input">
            <div
              className="h-full"
              style={{
                width: `${(Math.abs(i.value) / max) * 100}%`,
                background: colorFor ? colorFor(i.value) : '#FCD535',
              }}
            />
          </div>
          <div className="w-14 text-right font-mono">{i.value}</div>
        </div>
      ))}
    </div>
  );
}
