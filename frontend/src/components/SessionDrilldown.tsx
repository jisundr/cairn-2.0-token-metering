import { type ReactNode, useState } from "react";
import { useSessionTrace } from "../api/hooks";
import type { AgentTrace, SessionSummary } from "../api/types";
import { formatCost, formatDuration, formatTimeOfDay, formatTokens } from "../lib/format";

interface SessionDrilldownProps {
  session: SessionSummary;
  project?: string;
  onOpenCall: (sessionId: string, position: number) => void;
}

// Session-total runtime, not a per-call duration - mm:ss/h:mm reads better
// than formatDuration's decimal-seconds form (built for the ~seconds-long
// call rows below) once a session runs to minutes or hours.
function formatSessionDuration(startIso: string, endIso: string): string {
  const totalSeconds = Math.max(0, (new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${Math.round(totalSeconds)}s`;
}

// Per-agent expand/collapse rows, each with its call trace table
// (/api/session/<id>/trace) - matches the mockup's `.drilldown` block.
export function SessionDrilldown({ session, project, onOpenCall }: SessionDrilldownProps) {
  const { data: trace } = useSessionTrace(session.session_id, project);

  if (!trace) return null;

  const maxTokens = Math.max(...trace.agents.map((a) => a.tokens), 1);
  const totalTokens = trace.agents.reduce((sum, a) => sum + a.tokens, 0);
  // Auto-expanded by default so the panel shows something useful without a
  // click; the token-dominant agent is where session cost is concentrated,
  // so it's the one worth seeing first.
  const dominantAgent = trace.agents.reduce((best, a) => (a.tokens > best.tokens ? a : best), trace.agents[0]);
  const dominantShare = totalTokens > 0 ? Math.round(((dominantAgent?.tokens ?? 0) / totalTokens) * 100) : 0;

  return (
    <div className="rounded-lg border border-(--block-line) bg-white" data-testid="session-drilldown">
      <div className="flex flex-wrap items-baseline gap-2.5 rounded-t-md border-b border-(--block-line) bg-(--block) px-4.5 py-3.5">
        <span className="font-label text-[13px] font-bold">Session {session.session_id}</span>
        <span className="font-label text-[11.5px] text-(--ink-soft)">
          {formatSessionDuration(trace.started, trace.ended)} runtime
          {dominantAgent && ` · ${dominantAgent.agent ?? "unknown"} dominant (${dominantShare}% of tokens)`}
        </span>
      </div>

      {trace.agents.map((agent) => (
        <AgentRow
          key={agent.agent ?? "unknown"}
          agent={agent}
          maxTokens={maxTokens}
          sessionId={session.session_id}
          onOpenCall={onOpenCall}
          defaultOpen={agent.agent === dominantAgent?.agent}
        />
      ))}
    </div>
  );
}

function AgentRow({
  agent,
  maxTokens,
  sessionId,
  onOpenCall,
  defaultOpen,
}: {
  agent: AgentTrace;
  maxTokens: number;
  sessionId: string;
  onOpenCall: (sessionId: string, position: number) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
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
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-semibold leading-tight">
          <span className="truncate">{name}</span>
          {isSubagent && (
            <span className="font-label shrink-0 rounded border border-(--block-line) px-1 py-0.5 text-[9.5px] lowercase text-(--ink-soft)">
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
                      onClick={() => onOpenCall(sessionId, call.global_position)}
                      data-testid={`trace-toggle-${sessionId}-${call.position}`}
                      className="inline-flex h-4.75 w-4.75 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-dashed border-(--graphite) text-[10px] text-(--ink-soft) select-none"
                    >
                      ⋯
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
