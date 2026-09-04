import { useEffect, useState } from "react";
import { formatRelativeToNow } from "../lib/format";
import { Button } from "./ui/button";

interface HeaderProps {
  lastUpdated: Date | null;
  onRefresh: () => void;
}

export function Header({ lastUpdated, onRefresh }: HeaderProps) {
  const [, forceTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mb-4.5">
      {/* Fake browser-chrome bezel above the app content — traffic dots + a
          static mono URL readout, per DESIGN.md's Layout section. Decorative
          only; the URL text sources from the page's own origin rather than a
          hardcoded placeholder. */}
      <div className="-mx-7 -mt-6.5 mb-4 flex items-center gap-3.5 rounded-t-[5px] border-b border-(--paper-line) bg-(--bone-dim) px-3.5 py-2.5">
        <div className="flex flex-none gap-1.5" aria-hidden="true">
          <span className="h-1.75 w-1.75 rounded-full bg-(--ink-faint) opacity-55" />
          <span className="h-1.75 w-1.75 rounded-full bg-(--ink-faint) opacity-55" />
          <span className="h-1.75 w-1.75 rounded-full bg-(--ink-faint) opacity-55" />
        </div>
        <span className="font-mono max-w-80 flex-1 truncate rounded-[3px] border border-(--paper-line) bg-(--window) px-2.5 py-1 text-[11.5px] text-(--ink-soft)">
          {window.location.host}
        </span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
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
