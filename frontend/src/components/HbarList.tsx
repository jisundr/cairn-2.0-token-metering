export interface HbarRow {
  label: string;
  value: number;
  display: string;
}

interface HbarListProps {
  rows: HbarRow[];
  emptyText?: string;
  "data-testid"?: string;
}

// Generic horizontal-bar rollup row, reused for agents/models/tools/skills/
// MCP servers/projects - all the same shape server-side (rollup_group /
// rollup_tool_group), just different key functions (03-architecture.md).
export function HbarList({ rows, emptyText = "No data yet.", "data-testid": testId }: HbarListProps) {
  if (rows.length === 0) {
    return <p className="text-[11.5px] text-(--ink-soft)">{emptyText}</p>;
  }
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className="flex flex-col gap-2.5" data-testid={testId}>
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[minmax(76px,auto)_1fr_54px] items-center gap-2.5">
          <span className="font-label text-[11.5px] text-(--ink)">{row.label}</span>
          <div className="h-3 overflow-hidden rounded-[3px] border border-(--paper-line) bg-(--paper)">
            <div
              className="h-full border-r border-(--block-line) bg-(--block)"
              style={{ width: `${(row.value / max) * 100}%` }}
            />
          </div>
          <span className="font-label text-right text-[10.5px] text-(--ink-soft)">{row.display}</span>
        </div>
      ))}
    </div>
  );
}

export function HbarGroupLabel({ children }: { children: string }) {
  return (
    <p className="font-label mt-3.5 mb-2 text-[10px] tracking-wide text-(--graphite) uppercase first:mt-0">
      {children}
    </p>
  );
}
