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
    <div className="mb-4.5 flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-center gap-2.5">
        <div className="h-7 w-7 flex-none rounded-md border-2 border-(--ink)" />
        <div>
          <h2 className="m-0 text-[19px] font-bold tracking-tight">Token Metering</h2>
          <span className="font-label block text-[11px] tracking-wide text-(--ink-soft) uppercase">
            cairn · local dashboard
          </span>
        </div>
      </div>
      <div className="font-label flex items-center gap-2.5 text-[11.5px] text-(--ink-soft)">
        <span className="rounded-full border border-(--block-line) bg-(--block) px-3 py-1">
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
  );
}
