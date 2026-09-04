export interface HbarRow {
  label: string;
  value: number;
  display: string;
}

interface HbarListProps {
  rows: HbarRow[];
  emptyText?: string;
  maxRows?: number;
  "data-testid"?: string;
}

const DEFAULT_MAX_ROWS = 8;

// Generic horizontal-bar rollup row, reused for agents/models/tools/skills/
// MCP servers/projects - all the same shape server-side (rollup_group /
// rollup_tool_group), just different key functions (03-architecture.md).
export function HbarList({
  rows,
  emptyText = "No data yet.",
  maxRows = DEFAULT_MAX_ROWS,
  "data-testid": testId,
}: HbarListProps) {
  if (rows.length === 0) {
    return <p className="text-[11.5px] text-(--ink-soft)">{emptyText}</p>;
  }
  const visible = rows.slice(0, maxRows);
  const hiddenCount = rows.length - visible.length;
  const max = Math.max(...visible.map((r) => r.value), 1);

  return (
    <div className="flex flex-col gap-2.5" data-testid={testId}>
      {visible.map((row) => (
        <div key={row.label} className="grid grid-cols-[minmax(76px,auto)_1fr_54px] items-center gap-2.5">
          <span className="font-label text-[11.5px] text-(--ink)">{row.label}</span>
          <div className="h-2.5 overflow-hidden rounded-[2px] border border-(--paper-line) bg-(--bone-dim)">
            <div className="h-full bg-(--ink-soft)" style={{ width: `${(row.value / max) * 100}%` }} />
          </div>
          <span className="font-mono text-right text-[10.5px] text-(--ink-soft)">{row.display}</span>
        </div>
      ))}
      {hiddenCount > 0 && (
        <p className="font-label text-[10.5px] text-(--ink-soft)" data-testid={testId ? `${testId}-more` : undefined}>
          +{hiddenCount} more
        </p>
      )}
    </div>
  );
}

export function HbarGroupLabel({ children }: { children: string }) {
  return (
    <p className="font-label mt-3.5 mb-2 text-[10px] tracking-wide text-(--ink-soft) uppercase first:mt-0">
      {children}
    </p>
  );
}
