import type { UsageLimitEvent } from "../api/types";
import { Badge } from "./ui/badge";

interface WarningBannerProps {
  events: UsageLimitEvent[];
  onViewSession: (sessionId: string) => void;
}

// Rendered only when /api/usage-limit-events is non-empty (03-architecture.md).
export function WarningBanner({ events, onViewSession }: WarningBannerProps) {
  if (events.length === 0) return null;

  const mostRecent = [...events].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))[0];
  const plural = events.length === 1 ? "once" : `${events.length} times`;

  return (
    <div
      data-testid="usage-limit-banner"
      className="mb-5 flex items-center gap-3 rounded-lg border-[1.5px] border-dashed border-(--signal-line) bg-(--signal-soft) px-4 py-3 text-[13.5px]"
    >
      <span className="font-label flex h-5 w-5 flex-none items-center justify-center rounded-full border-[1.5px] border-(--signal-line) text-xs text-(--signal-line)">
        !
      </span>
      <span>
        <strong className="font-semibold">Usage limit hit</strong> {plural} — session{" "}
        <code className="font-mono rounded bg-(--block) px-1 py-0.5">{mostRecent.session_id}</code>
      </span>
      <Badge>{events.length}</Badge>
      <button
        type="button"
        data-testid="usage-limit-view-session"
        onClick={() => onViewSession(mostRecent.session_id)}
        className="font-label ml-auto cursor-pointer border-none border-b border-(--signal-line) bg-transparent p-0 text-[12px] whitespace-nowrap text-(--signal-line)"
      >
        view session →
      </button>
    </div>
  );
}
