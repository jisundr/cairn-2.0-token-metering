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
        className="font-label mb-5.5 cursor-pointer border-0 border-b border-(--ink-soft) bg-transparent p-0 text-[11.5px] text-(--ink-soft)"
      >
        ← back to session {sessionId}
      </button>

      {isLoading && <p className="text-(--ink-soft)">Loading…</p>}

      {call && (
        <>
          <div className="mb-2 flex flex-wrap items-start justify-between gap-4.5 border-b border-(--paper-line) pb-4.5">
            <div>
              <span className="font-label block text-lg font-bold">Call #{call.position}</span>
              <span className="font-label mt-1.25 block text-[12.5px] text-(--ink-soft)">
                {call.agent ?? "unknown"} · session {call.session_id} · {formatTimeOfDay(call.timestamp)} ·{" "}
                {call.model}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Pill label="in" value={call.input_tokens.toLocaleString()} />
              <Pill label="out" value={call.output_tokens.toLocaleString()} />
              <Pill value={formatCost(call.cost)} />
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

function Pill({ label, value }: { label?: string; value: ReactNode }) {
  return (
    <span className="font-label inline-flex items-center gap-1.5 rounded-[3px] border border-(--paper-line) bg-(--window) px-3 py-1 text-[11px] text-(--ink-soft)">
      {label && <span>{label}</span>}
      <span className="font-mono">{value}</span>
    </span>
  );
}
