import type { HeatmapRow } from "../api/types";
import { formatTokens } from "../lib/format";
import { cn } from "../lib/utils";

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Accent-intensity ramp, low to high: level 0 is an empty cell, 1-3 step
// through increasing opacity of the single accent color.
const LEVEL_CLASSES = [
  "border border-(--border) bg-(--surface-muted)",
  "bg-(--accent)/15",
  "bg-(--accent)/45",
  "bg-(--accent)",
];

function levelFor(tokens: number, max: number): number {
  if (tokens === 0 || max === 0) return 0;
  const ratio = tokens / max;
  if (ratio <= 1 / 3) return 1;
  if (ratio <= 2 / 3) return 2;
  return 3;
}

// getDay() is Sunday=0..Saturday=6; DOW_LABELS (and the grid below) are
// Monday=0..Sunday=6, matching server.py's old Python weekday() convention.
function localDow(d: Date): number {
  return (d.getDay() + 6) % 7;
}

// 7 (day-of-week) x 24 (hour) grid, bucketed here from /api/heatmap's raw
// per-call rows using each row's *local* Date fields - not the server's
// UTC day/hour - so the grid reflects the viewer's own time zone, DST
// transitions included.
export function ActivityHeatmap({ calls }: { calls: HeatmapRow[] }) {
  const cells = new Map<string, { calls: number; tokens: number }>();
  for (const row of calls) {
    const d = new Date(row.timestamp);
    const key = `${localDow(d)}-${d.getHours()}`;
    const cell = cells.get(key) ?? { calls: 0, tokens: 0 };
    cell.calls += 1;
    cell.tokens += row.tokens;
    cells.set(key, cell);
  }
  const max = Math.max(...Array.from(cells.values(), (c) => c.tokens), 0);

  return (
    <div className="mt-1.5 flex flex-col gap-[3px]" data-testid="activity-heatmap">
      <div className="grid grid-cols-[26px_repeat(24,1fr)] items-center gap-[3px] text-[8.5px] text-(--ink-soft)">
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h}>{h % 4 === 0 ? String(h).padStart(2, "0") : ""}</span>
        ))}
      </div>
      {DOW_LABELS.map((label, dow) => (
        <div key={label} className="grid grid-cols-[26px_repeat(24,1fr)] items-center gap-[3px]">
          <span className="text-[10px] text-(--ink-soft)">{label}</span>
          {Array.from({ length: 24 }, (_, hour) => {
            const cell = cells.get(`${dow}-${hour}`);
            const level = levelFor(cell?.tokens ?? 0, max);
            return (
              <div key={hour} className="group relative">
                <span
                  data-testid={`heatmap-cell-${dow}-${hour}`}
                  className={cn("block aspect-square rounded-[2px]", LEVEL_CLASSES[level])}
                />
                {cell && (
                  <div
                    data-testid={`heatmap-tooltip-${dow}-${hour}`}
                    className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 rounded-md border border-(--border) bg-(--surface) px-2 py-1.5 text-[11px] whitespace-nowrap text-(--ink) group-hover:block"
                  >
                    <div className="font-medium">
                      {label} {hour}:00
                    </div>
                    <div className="text-(--ink-soft) tabular-nums">
                      {cell.calls} calls · {formatTokens(cell.tokens)} tokens
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
