import { useEffect, useState } from "react";
import { formatRelativeToNow } from "../lib/format";
import { Button } from "./ui/button";

export type DashboardTab = "dashboard" | "sessions";

interface HeaderProps {
  lastUpdated: Date | null;
  onRefresh: () => void;
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
}

const APP_TABS: { value: DashboardTab; label: string }[] = [
  { value: "dashboard", label: "Dashboard" },
  { value: "sessions", label: "Sessions" },
];

export function Header({ lastUpdated, onRefresh, activeTab, onTabChange }: HeaderProps) {
  const [, forceTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mb-4.5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div
            className="relative h-6.5 w-6.5 flex-none rounded-[3px] border-2 border-(--ink) before:absolute before:inset-y-[5px] before:left-1/2 before:w-0.5 before:-translate-x-1/2 before:bg-(--ink) before:content-[''] after:absolute after:inset-x-[5px] after:top-1/2 after:h-0.5 after:-translate-y-1/2 after:bg-(--ink) after:content-['']"
            aria-hidden="true"
          />
          <div>
            <h2 className="m-0 text-[19px] font-bold tracking-tight">Token Metering</h2>
            <span className="font-label block text-[11px] tracking-wide text-(--ink-soft) uppercase">
              cairn · local dashboard
            </span>
          </div>
        </div>

        {/* App-level Dial Tabs (DESIGN.md's Dial Tabs, app-level variant):
            a bordered --window segmented group, unselected segments in
            --ink-soft, the selected segment getting a --signal-soft fill
            plus an inset bottom box-shadow in --signal — distinct from
            components/ui/tabs.tsx's solid-fill treatment, which stays
            reserved for the chart-range Today/Daily/Monthly tabs. */}
        <div
          className="font-label flex overflow-hidden rounded-[3px] border border-(--paper-line) bg-(--window) text-[12px]"
          data-testid="app-tabs"
        >
          {APP_TABS.map((tab, i) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => onTabChange(tab.value)}
              aria-pressed={activeTab === tab.value}
              data-testid={`app-tab-${tab.value}`}
              className={
                "cursor-pointer border-0 px-4.5 py-2.25 font-semibold tracking-wide uppercase select-none " +
                (i > 0 ? "border-l border-(--paper-line) " : "") +
                (activeTab === tab.value
                  ? "bg-(--signal-soft) text-(--ink) shadow-[inset_0_-3px_0_var(--signal)]"
                  : "bg-transparent text-(--ink-soft)")
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="font-label flex items-center gap-2.5 text-[11.5px] text-(--ink-soft)">
          {/* Pulsing status lamp (DESIGN.md's status-cluster) — a ring in
              --signal-soft expanding around the solid --signal dot, built from
              Tailwind's built-in ping animation rather than a new keyframe. */}
          <span className="relative flex h-2 w-2 flex-none" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-(--signal-soft) opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-(--signal)" />
          </span>
          <span className="rounded-[3px] border border-(--paper-line) bg-(--window) px-3 py-1">
            ↻ auto-refresh 15s
          </span>
          <Button data-testid="refresh-now" onClick={onRefresh}>
            refresh now
          </Button>
          <span data-testid="updated-label">
            {lastUpdated ? `updated ${formatRelativeToNow(lastUpdated.toISOString())}` : "updating…"}
          </span>
        </div>
      </div>
    </div>
  );
}
