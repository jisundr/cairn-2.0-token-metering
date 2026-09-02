import type { HeatmapRow } from "../api/types";
import { cn } from "../lib/utils";

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LEVEL_CLASSES = [
  "border border-(--paper-line) bg-(--paper)",
  "bg-[#d7e0ea]",
  "bg-[#a9c0d6]",
  "bg-[#6f93b5]",
  "bg-(--blue)",
];

function levelFor(tokens: number, max: number): number {
  if (tokens === 0 || max === 0) return 0;
  const ratio = tokens / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
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
      <div className="font-label grid grid-cols-[26px_repeat(24,1fr)] items-center gap-[3px] text-[8.5px] text-(--ink-soft)">
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h}>{h % 4 === 0 ? String(h).padStart(2, "0") : ""}</span>
        ))}
      </div>
      {DOW_LABELS.map((label, dow) => (
        <div key={label} className="grid grid-cols-[26px_repeat(24,1fr)] items-center gap-[3px]">
          <span className="font-label text-[10px] text-(--ink-soft)">{label}</span>
          {Array.from({ length: 24 }, (_, hour) => {
            const cell = cells.get(`${dow}-${hour}`);
            const level = levelFor(cell?.tokens ?? 0, max);
            return (
              <span
                key={hour}
                data-testid={`heatmap-cell-${dow}-${hour}`}
                title={cell ? `${label} ${hour}:00 — ${cell.calls} calls` : undefined}
                className={cn("aspect-square rounded-[2px]", LEVEL_CLASSES[level])}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
