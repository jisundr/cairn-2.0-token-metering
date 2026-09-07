import { useEffect, useState } from "react";
import { formatRelativeToNow } from "../lib/format";
import { cn } from "../lib/utils";
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
    <div className="mb-6 border-b border-(--border) pb-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div
            className="relative h-6.5 w-6.5 flex-none rounded-md border-2 border-(--ink) before:absolute before:inset-y-[5px] before:left-1/2 before:w-0.5 before:-translate-x-1/2 before:bg-(--ink) before:content-[''] after:absolute after:inset-x-[5px] after:top-1/2 after:h-0.5 after:-translate-y-1/2 after:bg-(--ink) after:content-['']"
            aria-hidden="true"
          />
          <div>
            <h2 className="m-0 text-[19px] font-bold tracking-tight">Token Metering</h2>
            <span className="block text-[11px] text-(--ink-soft)">cairn · local dashboard</span>
          </div>
        </div>

        {/* App-level tab bar: same subtle segmented-track pattern as
            components/ui/tabs.tsx (white pill + accent text on the active
            segment), so the whole app reads as one consistent tab idiom. */}
        <div
          className="inline-flex gap-1 rounded-md border border-(--border) bg-(--surface-muted) p-0.5 text-[13px]"
          data-testid="app-tabs"
        >
          {APP_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => onTabChange(tab.value)}
              aria-pressed={activeTab === tab.value}
              data-testid={`app-tab-${tab.value}`}
              className={cn(
                "cursor-pointer rounded-[5px] px-4 py-1.5 font-medium text-(--ink-soft) transition-colors select-none",
                activeTab === tab.value && "bg-(--surface) text-(--accent)",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2.5 text-[12px] text-(--ink-soft)">
          {/* Pulsing status lamp: a ring in --accent-soft expanding around
              the solid --accent dot, via Tailwind's built-in ping animation. */}
          <span className="relative flex h-2 w-2 flex-none" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-(--accent-soft) opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-(--accent)" />
          </span>
          <span className="rounded-md border border-(--border) bg-(--surface) px-3 py-1">
            auto-refresh 15s
          </span>
          <Button data-testid="refresh-now" onClick={onRefresh}>
            Refresh now
          </Button>
          <span data-testid="updated-label">
            {lastUpdated ? `updated ${formatRelativeToNow(lastUpdated.toISOString())}` : "updating…"}
          </span>
        </div>
      </div>
    </div>
  );
}
