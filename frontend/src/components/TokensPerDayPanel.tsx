import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { useDayDetail, useTimeseries } from "../api/hooks";
import type { RangeKey, TimeseriesPoint } from "../api/types";
import { formatCost, formatDayLabel, formatTokens } from "../lib/format";
import { Panel, PanelTitle } from "./ui/panel";
import { Skeleton } from "./ui/skeleton";
import { Tabs } from "./ui/tabs";

// Model-breakdown dots cycle the ink-scale channel set, not a single flat color.
const MODEL_DOT_CHANNELS = ["--ch1", "--ch2", "--ch3", "--ch4"] as const;

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

function tickLabel(shape: ChartShape, bucket: string): string {
  return shape === "hourly" ? bucket.slice(-2) : formatDayLabel(bucket);
}

// Shared hover tooltip for all three chart shapes: real recharts <Tooltip>
// hover-tracking, formatted with the same token/cost readouts used elsewhere.
interface ChartTooltipProps {
  active?: boolean;
  payload?: readonly { payload?: TimeseriesPoint }[];
  shape: ChartShape;
}

function ChartTooltip({ active, payload, shape }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0 || !payload[0].payload) return null;
  const point = payload[0].payload;
  return (
    <div
      className="rounded-md border border-(--border) bg-(--surface) px-2.5 py-2 text-[11.5px]"
      data-testid="chart-tooltip"
    >
      <div className="mb-1 font-medium text-(--ink)">{tickLabel(shape, point.bucket)}</div>
      <div className="text-(--ink-soft) tabular-nums">{formatTokens(point.tokens)} tokens</div>
      {point.cost != null && <div className="text-(--ink-soft) tabular-nums">{formatCost(point.cost)}</div>}
    </div>
  );
}

interface DayBarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: TimeseriesPoint;
}

// Custom <Bar> shape render-prop: keeps the exact per-bar test id and
// click-to-drilldown behavior the 7d view relies on, while still getting
// recharts' native Tooltip hover-tracking on the same <BarChart>.
function makeDayBarShape(shape: ChartShape, selectedDate: string | null, onSelect: (bucket: string) => void) {
  return function DayBarShape({ x = 0, y = 0, width = 0, height = 0, payload }: DayBarShapeProps) {
    if (!payload) return null;
    const selected = shape === "daily-click" && selectedDate === payload.bucket;
    const minHeight = 2;
    const h = Math.max(height, minHeight);
    const adjustedY = y + height - h;
    return (
      <g
        data-testid={shape === "daily-click" ? `day-bar-${payload.bucket}` : undefined}
        onClick={shape === "daily-click" ? () => onSelect(payload.bucket) : undefined}
        style={{ cursor: shape === "daily-click" ? "pointer" : "default" }}
      >
        <rect
          x={x}
          y={adjustedY}
          width={width}
          height={h}
          rx={2}
          fill={selected ? "var(--accent)" : "var(--surface-muted)"}
          stroke={selected ? "var(--accent)" : "var(--border)"}
        />
      </g>
    );
  };
}

interface TokensPerDayPanelProps {
  project?: string;
}

// Range tabs each swap the chart's shape: today buckets hourly, 7d is daily
// bars with a per-day click-through into /api/rollup/day-detail, and the
// denser ranges (30d/month/6m/life) are a sparkline trend with no click-through.
export function TokensPerDayPanel({ project }: TokensPerDayPanelProps) {
  const [range, setRange] = useState<RangeKey>("7d");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const { data: timeseries, isLoading } = useTimeseries({ range, project });
  const dayDetail = useDayDetail(range === "7d" ? selectedDate : null, project);

  const points = timeseries?.points ?? [];
  const bucketsKey = points.map((p) => p.bucket).join(",");

  useEffect(() => {
    if (range !== "7d") return;
    if (points.length === 0) {
      setSelectedDate(null);
      return;
    }
    // Most-recent day auto-selected. Keyed off the bucket set (not `points`
    // itself) so a 15s poll refreshing the same buckets doesn't clobber the
    // user's own selection.
    setSelectedDate((current) => (current && points.some((p) => p.bucket === current) ? current : points[points.length - 1].bucket));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, bucketsKey]);

  const shape = shapeFor(range);

  return (
    <Panel>
      <PanelTitle>Tokens / day</PanelTitle>
      <Tabs data-testid="range-tabs" options={RANGE_OPTIONS} value={range} onChange={setRange} />

      <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <span className="mb-0.5 block text-[11px] text-(--ink-soft)">{RANGE_SUB_LABEL[range]}</span>
          {isLoading ? (
            <Skeleton className="h-[22px] w-24" />
          ) : (
            <span className="text-[22px] font-bold tabular-nums" data-testid="range-total-tokens">
              {formatTokens(timeseries?.total_tokens ?? 0)} tokens
            </span>
          )}
        </div>
      </div>

      {isLoading ? (
        <Skeleton
          className={shape === "sparkline" ? "h-15 w-full" : "h-35 w-full"}
          data-testid="chart-loading"
        />
      ) : points.length === 0 ? (
        <p className="text-[11.5px] text-(--ink-soft)" data-testid="range-empty">
          No calls recorded.
        </p>
      ) : shape === "sparkline" ? (
        <div style={{ height: 60 }} data-testid="chart-sparkline">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <Tooltip content={(p) => <ChartTooltip {...p} shape={shape} />} cursor={{ fill: "var(--surface-muted)" }} />
              <Bar dataKey="tokens" fill="var(--accent-line)" radius={[1, 1, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{ height: 140 }} data-testid={`chart-${shape}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap={shape === "hourly" ? 2 : 10}>
              <CartesianGrid stroke="var(--border-soft)" vertical={false} />
              <XAxis
                dataKey="bucket"
                tickFormatter={(bucket: string) => tickLabel(shape, bucket)}
                tick={{ fontSize: 10, fill: "var(--ink-faint)" }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
                interval={0}
              />
              <Tooltip content={(p) => <ChartTooltip {...p} shape={shape} />} cursor={{ fill: "var(--surface-muted)" }} />
              <Bar dataKey="tokens" shape={makeDayBarShape(shape, selectedDate, setSelectedDate)} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {shape === "daily-click" && selectedDate && (
        <div className="mt-3.5 rounded-md border border-(--border) bg-(--surface-muted) p-3" data-testid="day-detail-panel">
          <div className="mb-2 flex items-baseline justify-between text-[11.5px] font-semibold">
            <span>{selectedDate}</span>
            <span className="font-mono font-normal text-(--ink-soft)">
              {formatTokens(dayDetail.data?.total_tokens ?? 0)} tok
            </span>
          </div>
          {dayDetail.data && dayDetail.data.by_model.length === 0 ? (
            <p className="m-0 text-[11.5px] text-(--ink-soft)" data-testid="day-detail-empty">
              No calls recorded.
            </p>
          ) : (
            (dayDetail.data?.by_model ?? []).map((m, i) => (
              <div
                key={m.key}
                className="grid grid-cols-[8px_1fr_60px_70px] items-center gap-2 py-0.75 text-[11px]"
                data-testid="day-detail-model-row"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: `var(${MODEL_DOT_CHANNELS[i % MODEL_DOT_CHANNELS.length]})` }}
                />
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
