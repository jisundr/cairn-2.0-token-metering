import type { HeatmapRow } from "../api/types";
import { formatDayLabel, formatTokens } from "../lib/format";
import { cn } from "../lib/utils";

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

function localDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// GitHub-style per-calendar-day grid: 7 rows (Sun top - Sat bottom) x one
// column per Sun-Sat week the range touches, bucketed here from
// /api/heatmap's raw per-call rows using each row's *local* Date fields -
// not the server's UTC day - so the grid reflects the viewer's own time
// zone, DST transitions included.
export function ActivityHeatmap({ calls }: { calls: HeatmapRow[] }) {
  const cells = new Map<string, { calls: number; tokens: number }>();
  for (const row of calls) {
    const d = new Date(row.timestamp);
    const key = localDateKey(d);
    const cell = cells.get(key) ?? { calls: 0, tokens: 0 };
    cell.calls += 1;
    cell.tokens += row.tokens;
    cells.set(key, cell);
  }

  // Explicit 7-day window (6 days before today -> today, local midnight) so
  // data-free days still render as level-0 cells, not gaps.
  const today = startOfLocalDay(new Date());
  const days: { date: Date; key: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    days.push({ date, key: localDateKey(date) });
  }

  const max = Math.max(...Array.from(cells.values(), (c) => c.tokens), 0);

  // Column index: weeks since the range's first Sunday-aligned week start.
  const firstWeekStart = new Date(days[0].date);
  firstWeekStart.setDate(firstWeekStart.getDate() - firstWeekStart.getDay());

  const columns = new Map<number, (typeof days)[number][]>();
  for (const day of days) {
    const weekStart = new Date(day.date);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const col = Math.round((weekStart.getTime() - firstWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
    const rows = columns.get(col) ?? [];
    rows.push(day);
    columns.set(col, rows);
  }
  const columnCount = Math.max(...Array.from(columns.keys()), 0) + 1;

  return (
    <div
      className="mt-1.5 grid gap-[3px]"
      style={{ gridTemplateColumns: `repeat(${columnCount}, 11px)` }}
      data-testid="activity-heatmap"
    >
      {Array.from({ length: columnCount }, (_, col) => (
        <div key={col} className="grid grid-rows-[repeat(7,11px)] gap-[3px]">
          {Array.from({ length: 7 }, (_, dow) => {
            const day = columns.get(col)?.find((d) => d.date.getDay() === dow);
            if (!day) return <div key={dow} />;
            const cell = cells.get(day.key);
            const level = levelFor(cell?.tokens ?? 0, max);
            return (
              <div key={dow} className="group relative">
                <span
                  data-testid={`heatmap-cell-${day.key}`}
                  className={cn("block h-[11px] w-[11px] rounded-[2px]", LEVEL_CLASSES[level])}
                />
                {cell && (
                  <div
                    data-testid={`heatmap-tooltip-${day.key}`}
                    className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 rounded-md border border-(--border) bg-(--surface) px-2 py-1.5 text-[11px] whitespace-nowrap text-(--ink) group-hover:block"
                  >
                    <div className="font-medium">{formatDayLabel(day.key)}</div>
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
