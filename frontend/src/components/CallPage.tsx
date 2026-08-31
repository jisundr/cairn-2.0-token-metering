import type { ReactNode } from "react";
import { useCallDetail } from "../api/hooks";
import { formatCost, formatTimeOfDay } from "../lib/format";
import { TraceDetailContent } from "./TraceDetailContent";

interface CallPageProps {
  sessionId: string;
  n: number;
  onBack: () => void;
}

// Standalone page for /call/<session>/<n> on direct load/refresh - same
// content as TraceDrawer, mockups/dashboard.html's `.call-page` layout
// (03-architecture.md's Call-detail deep-linking).
export function CallPage({ sessionId, n, onBack }: CallPageProps) {
  const { data: call, isLoading } = useCallDetail(sessionId, n);

  return (
    <div className="mx-auto max-w-[820px] px-6 py-9" data-testid="call-page">
      <button
        type="button"
        onClick={onBack}
        data-testid="call-page-back"
        className="font-label mb-5.5 cursor-pointer border-0 border-b border-(--blue) bg-transparent p-0 text-[11.5px] text-(--blue)"
      >
        ← back to session {sessionId}
      </button>

      {isLoading && <p className="text-(--ink-soft)">Loading…</p>}

      {call && (
        <>
          <div className="mb-2 flex flex-wrap items-start justify-between gap-4.5 border-b border-(--block-line) pb-4.5">
            <div>
              <span className="font-label block text-lg font-bold">Call #{call.position}</span>
              <span className="font-label mt-1.25 block text-[12.5px] text-(--ink-soft)">
                {call.agent ?? "unknown"} · session {call.session_id} · {formatTimeOfDay(call.timestamp)} ·{" "}
                {call.model}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Pill>in {call.input_tokens.toLocaleString()}</Pill>
              <Pill>out {call.output_tokens.toLocaleString()}</Pill>
              <Pill>{formatCost(call.cost)}</Pill>
            </div>
          </div>
          <div className="mt-5.5 flex flex-col gap-8.5 md:flex-row">
            <div className="min-w-0 flex-1">
              <TraceDetailContent call={call} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="font-label rounded-full border border-(--block-line) bg-(--block) px-3 py-1 text-[11px] text-(--ink-soft)">
      {children}
    </span>
  );
}
