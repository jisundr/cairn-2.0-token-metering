import type { HeatmapCell } from "../api/types";
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

// 7 (day-of-week) x 24 (hour) grid from /api/heatmap - zero-filled server
// side, so this always has all 168 cells (03-architecture.md).
export function ActivityHeatmap({ cells }: { cells: HeatmapCell[] }) {
  const max = Math.max(...cells.map((c) => c.tokens), 0);
  const byDowHour = new Map(cells.map((c) => [`${c.day_of_week}-${c.hour}`, c]));

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
            const cell = byDowHour.get(`${dow}-${hour}`);
            const level = levelFor(cell?.tokens ?? 0, max);
            return (
              <span
                key={hour}
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
