import { type ReactNode, useState } from "react";
import { useSessionTrace } from "../api/hooks";
import type { AgentTrace, SessionSummary } from "../api/types";
import { formatCost, formatDuration, formatStarted, formatTimeOfDay, formatTokens } from "../lib/format";

interface SessionDrilldownProps {
  session: SessionSummary;
  project?: string;
  onOpenCall: (sessionId: string, position: number) => void;
}

// Per-agent expand/collapse rows, each with its call trace table
// (/api/session/<id>/trace) - matches the mockup's `.drilldown` block.
export function SessionDrilldown({ session, project, onOpenCall }: SessionDrilldownProps) {
  const { data: trace } = useSessionTrace(session.session_id, project);

  if (!trace) return null;

  const maxTokens = Math.max(...trace.agents.map((a) => a.tokens), 1);

  // server.py's `/api/call/<session>/<n>` numbers `n` across the *whole*
  // session in chronological order (`calls.sort(key=(timestamp,
  // request_id))` in `call_detail`), not per-agent like each trace row's
  // own `position` (build_session_trace's per-agent `i + 1`). Recomputing
  // that same global ordering here from `request_id` is what lets a
  // trace row's detail toggle open the right call.
  const globalPosition = new Map<string, number>();
  trace.agents
    .flatMap((a) => a.trace)
    .sort((a, b) => (a.timestamp === b.timestamp ? (a.request_id < b.request_id ? -1 : 1) : a.timestamp < b.timestamp ? -1 : 1))
    .forEach((call, i) => globalPosition.set(call.request_id, i + 1));

  return (
    <div className="rounded-lg border border-(--block-line) bg-white" data-testid="session-drilldown">
      <div className="flex flex-wrap items-baseline gap-2.5 rounded-t-md border-b border-(--block-line) bg-(--block) px-4.5 py-3.5">
        <span className="font-label text-[13px] font-bold">Session {session.session_id}</span>
        <span className="font-label text-[11.5px] text-(--ink-soft)">
          {formatStarted(trace.started)}–{formatStarted(trace.ended).split(" ")[1]} · {trace.agents.length} agents ·{" "}
          {formatTokens(session.tokens)} tokens · {formatCost(session.cost)}
        </span>
      </div>

      {trace.agents.map((agent) => (
        <AgentRow
          key={agent.agent ?? "unknown"}
          agent={agent}
          maxTokens={maxTokens}
          sessionId={session.session_id}
          globalPosition={globalPosition}
          onOpenCall={onOpenCall}
        />
      ))}
    </div>
  );
}

function AgentRow({
  agent,
  maxTokens,
  sessionId,
  globalPosition,
  onOpenCall,
}: {
  agent: AgentTrace;
  maxTokens: number;
  sessionId: string;
  globalPosition: Map<string, number>;
  onOpenCall: (sessionId: string, position: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const name = agent.agent ?? "unknown";
  const isSubagent = name !== "main";

  return (
    <div className="border-b border-(--paper-line) last:border-b-0" data-testid={`agent-row-${name}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid={`agent-row-toggle-${name}`}
        aria-expanded={open}
        className={
          "grid w-full cursor-pointer grid-cols-[18px_110px_1fr_90px_90px_70px] items-center gap-3 border-0 px-4.5 py-3 text-left text-[13px] " +
          (open ? "bg-(--blue-soft)" : "bg-transparent")
        }
      >
        <span className={"font-label text-[11px] " + (open ? "text-(--blue)" : "text-(--ink-soft)")}>
          {open ? "▾" : "▸"}
        </span>
        <span className="font-semibold">
          {name}
          {isSubagent && (
            <span className="font-label ml-1.5 rounded border border-(--block-line) px-1 py-0.5 text-[9.5px] lowercase text-(--ink-soft)">
              subagent
            </span>
          )}
        </span>
        <div className="h-2 overflow-hidden rounded-[2px] border border-(--paper-line) bg-(--paper)">
          <div
            className="h-full bg-(--block-line)"
            style={{ width: `${(agent.tokens / maxTokens) * 100}%` }}
          />
        </div>
        <span className="font-label text-right text-[11.5px] text-(--ink-soft) tabular-nums">
          {agent.calls} calls
        </span>
        <span className="font-label text-right text-[11.5px] text-(--ink-soft) tabular-nums">
          {formatTokens(agent.tokens)} tok
        </span>
        <span className="font-label text-right text-[12px] font-bold tabular-nums">{formatCost(agent.cost)}</span>
      </button>

      {open && (
        <div className="overflow-visible px-4.5 pb-4" data-testid={`agent-trace-${name}`}>
          <table className="font-label w-full min-w-[640px] border-collapse text-[11px]">
            <thead>
              <tr>
                <TraceTh>#</TraceTh>
                <TraceTh>time</TraceTh>
                <TraceTh>model</TraceTh>
                <TraceTh>in</TraceTh>
                <TraceTh>out</TraceTh>
                <TraceTh>cost</TraceTh>
                <TraceTh>dur</TraceTh>
                <TraceTh center>detail</TraceTh>
              </tr>
            </thead>
            <tbody>
              {agent.trace.map((call) => (
                <tr key={call.request_id} data-testid={`trace-row-${sessionId}-${call.position}`}>
                  <TraceTd left>{call.position}</TraceTd>
                  <TraceTd>{formatTimeOfDay(call.timestamp)}</TraceTd>
                  <TraceTd>{call.model}</TraceTd>
                  <TraceTd>{call.input_tokens.toLocaleString()}</TraceTd>
                  <TraceTd>{call.output_tokens.toLocaleString()}</TraceTd>
                  <TraceTd>{formatCost(call.cost)}</TraceTd>
                  <TraceTd>{formatDuration(call.duration_seconds)}</TraceTd>
                  <TraceTd center>
                    <button
                      type="button"
                      onClick={() => onOpenCall(sessionId, globalPosition.get(call.request_id) ?? call.position)}
                      data-testid={`trace-toggle-${sessionId}-${call.position}`}
                      className="inline-flex h-4.75 w-4.75 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-dashed border-(--graphite) text-[10px] text-(--ink-soft) select-none"
                    >
                      ⌄
                    </button>
                  </TraceTd>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TraceTh({ children, center }: { children: ReactNode; center?: boolean }) {
  return (
    <th
      className={
        "border-b border-(--block-line) px-2 py-1.5 font-normal whitespace-nowrap text-(--ink-soft) " +
        (center ? "text-center" : "text-right")
      }
    >
      {children}
    </th>
  );
}

function TraceTd({ children, left, center }: { children: ReactNode; left?: boolean; center?: boolean }) {
  return (
    <td
      className={
        "border-b border-dashed border-(--paper-line) px-2 py-1.5 whitespace-nowrap tabular-nums " +
        (left ? "text-left" : center ? "text-center" : "text-right")
      }
    >
      {children}
    </td>
  );
}
