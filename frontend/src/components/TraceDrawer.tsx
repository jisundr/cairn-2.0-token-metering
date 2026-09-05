import { useCallDetail } from "../api/hooks";
import { formatTimeOfDay } from "../lib/format";
import { TraceDetailContent } from "./TraceDetailContent";

interface TraceDrawerProps {
  sessionId: string;
  n: number;
  project?: string;
  onClose: () => void;
  onViewFullPage: () => void;
}

// GitLab-style detail drawer: fixed to the viewport edge, opened in-app
// from a trace row's toggle (mockups/dashboard.html's `.trace-drawer`).
export function TraceDrawer({ sessionId, n, project, onClose, onViewFullPage }: TraceDrawerProps) {
  const { data: call } = useCallDetail(sessionId, n, project);

  return (
    <>
      <button
        type="button"
        aria-label="Close trace detail"
        onClick={onClose}
        className="fixed inset-0 z-[20] cursor-pointer border-0 bg-(--ink)/35 p-0"
        data-testid="trace-drawer-backdrop"
      />
      <aside
        className="fixed inset-y-0 right-0 z-[21] flex w-full max-w-[400px] flex-col border-l border-(--paper-line) bg-(--window)"
        data-testid="trace-drawer"
      >
        <div className="flex items-start justify-between gap-3 border-b border-(--paper-line) bg-(--bone-dim) px-5 py-4.5">
          {call && (
            <div>
              <span className="block text-[13px] font-bold">Call #{call.position}</span>
              <span className="font-label mt-0.75 block text-[11px] text-(--ink-soft)">
                {call.agent ?? "unknown"} · session {call.session_id} · {formatTimeOfDay(call.timestamp)} ·{" "}
                {call.model}
              </span>
            </div>
          )}
          <div className="flex flex-none items-center gap-3.5">
            <button
              type="button"
              onClick={onViewFullPage}
              data-testid="trace-drawer-fullpage-link"
              className="font-label cursor-pointer border-0 border-b border-(--ink-soft) bg-transparent p-0 text-[10.5px] whitespace-nowrap text-(--ink-soft)"
            >
              view full page ↗
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              data-testid="trace-drawer-close"
              className="cursor-pointer border-0 bg-transparent p-0 text-lg leading-none text-(--ink-soft)"
            >
              ×
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{call && <TraceDetailContent call={call} />}</div>
      </aside>
    </>
  );
}
