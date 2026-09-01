import { useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { useDayDetail, useTimeseries } from "../api/hooks";
import type { RangeKey } from "../api/types";
import { formatCost, formatDayLabel, formatTokens } from "../lib/format";
import { cn } from "../lib/utils";
import { Panel, PanelTitle } from "./ui/panel";
import { Tabs } from "./ui/tabs";

const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "month", label: "Month" },
  { value: "6m", label: "6M" },
  { value: "life", label: "Life" },
];

const RANGE_SUB_LABEL: Record<RangeKey, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  month: "Month to date",
  "6m": "Last 6 months",
  life: "Lifetime",
};

type ChartShape = "hourly" | "daily-click" | "sparkline";

function shapeFor(range: RangeKey): ChartShape {
  if (range === "today") return "hourly";
  if (range === "7d") return "daily-click";
  return "sparkline";
}

interface TokensPerDayPanelProps {
  project?: string;
}

// Range tabs each swap the chart's shape, per mockups/dashboard.html: today
// buckets hourly, 7d is daily bars with a per-day click-through into
// /api/rollup/day-detail, and the denser ranges (30d/month/6m/life) are a
// sparkline trend with no click-through (plan.md's Actionable 3).
export function TokensPerDayPanel({ project }: TokensPerDayPanelProps) {
  const [range, setRange] = useState<RangeKey>("7d");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const { data: timeseries } = useTimeseries({ range, project });
  const dayDetail = useDayDetail(range === "7d" ? selectedDate : null, project);

  const points = timeseries?.points ?? [];
  const bucketsKey = points.map((p) => p.bucket).join(",");

  useEffect(() => {
    if (range !== "7d") return;
    if (points.length === 0) {
      setSelectedDate(null);
      return;
    }
    // Most-recent day auto-selected, matching the mockup's default. Keyed
    // off the bucket set (not `points` itself) so a 15s poll refreshing
    // the same buckets doesn't clobber the user's own selection.
    setSelectedDate((current) => (current && points.some((p) => p.bucket === current) ? current : points[points.length - 1].bucket));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, bucketsKey]);

  const shape = shapeFor(range);
  const maxTokens = Math.max(...points.map((p) => p.tokens), 1);

  return (
    <Panel>
      <PanelTitle>Tokens / day</PanelTitle>
      <Tabs data-testid="range-tabs" options={RANGE_OPTIONS} value={range} onChange={setRange} />

      <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <span className="font-label mb-0.5 block text-[10.5px] tracking-wide text-(--ink-soft) uppercase">
            {RANGE_SUB_LABEL[range]}
          </span>
          <span className="text-[22px] font-bold tabular-nums" data-testid="range-total-tokens">
            {formatTokens(timeseries?.total_tokens ?? 0)} tokens
          </span>
        </div>
      </div>

      {points.length === 0 ? (
        <p className="text-[11.5px] text-(--ink-soft)" data-testid="range-empty">
          No calls recorded.
        </p>
      ) : shape === "sparkline" ? (
        <div style={{ height: 60 }} data-testid="chart-sparkline">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <Area
                type="monotone"
                dataKey="tokens"
                stroke="var(--blue)"
                fill="var(--blue-soft)"
                strokeWidth={1.5}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div
          className={cn("flex items-end", shape === "hourly" ? "h-27 gap-[3px]" : "h-27 gap-2.5")}
          data-testid={`chart-${shape}`}
        >
          {points.map((p) => (
            <button
              key={p.bucket}
              type="button"
              disabled={shape !== "daily-click"}
              onClick={() => shape === "daily-click" && setSelectedDate(p.bucket)}
              data-testid={shape === "daily-click" ? `day-bar-${p.bucket}` : undefined}
              className={cn(
                "flex h-full flex-1 flex-col items-center justify-end gap-1.5 border-0 bg-transparent p-0",
                shape === "daily-click" && "cursor-pointer",
              )}
            >
              <div
                className={cn(
                  "w-full rounded-t-[3px] border",
                  shape === "daily-click" && selectedDate === p.bucket
                    ? "border-(--blue) bg-(--blue-soft)"
                    : "border-(--block-line) bg-(--block)",
                )}
                style={{ height: `${Math.max((p.tokens / maxTokens) * 100, 2)}%` }}
              />
              <span className="font-label text-[10px] text-(--ink-soft)">
                {shape === "hourly" ? p.bucket.slice(-2) : formatDayLabel(p.bucket)}
              </span>
            </button>
          ))}
        </div>
      )}

      {shape === "daily-click" && selectedDate && (
        <div
          className="mt-3.5 rounded-md border border-(--block-line) bg-(--paper) p-3"
          data-testid="day-detail-panel"
        >
          <div className="font-label mb-2 flex items-baseline justify-between text-[11.5px] font-bold">
            <span>{selectedDate}</span>
            <span className="font-normal text-(--ink-soft)">
              {formatTokens(dayDetail.data?.total_tokens ?? 0)} tok
            </span>
          </div>
          {dayDetail.data && dayDetail.data.by_model.length === 0 ? (
            <p className="m-0 text-[11.5px] text-(--ink-soft)" data-testid="day-detail-empty">
              No calls recorded.
            </p>
          ) : (
            (dayDetail.data?.by_model ?? []).map((m) => (
              <div
                key={m.key}
                className="font-label grid grid-cols-[8px_1fr_60px_70px] items-center gap-2 py-0.75 text-[11px]"
                data-testid="day-detail-model-row"
              >
                <span className="h-2 w-2 rounded-full bg-(--block-line)" />
                <span>{m.key}</span>
                <span className="text-right text-(--ink-soft) tabular-nums">{formatCost(m.cost)}</span>
                <span className="text-right text-(--ink-soft) tabular-nums">{formatTokens(m.tokens)} tok</span>
              </div>
            ))
          )}
        </div>
      )}
    </Panel>
  );
}
