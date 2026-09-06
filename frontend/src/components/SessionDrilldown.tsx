import { useState } from "react";
import { useCallDetails, useSessionTrace } from "../api/hooks";
import type { CallDetail, SessionSummary, TraceCall } from "../api/types";
import { formatCost, formatDuration, formatTimeOfDay, formatTokens, shortId } from "../lib/format";

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

const CHANNEL_COLORS = ["var(--ch1)", "var(--ch2)", "var(--ch3)", "var(--ch4)"];

interface MergedCall {
  call: TraceCall;
  agentName: string;
  channelColor: string;
}

// Checkbox-driven agent-select rows (DESIGN.md's "Agent-select rows") above
// one always-visible, global_position-ordered chat-thread merging every
// agent's calls (DESIGN.md's "Chat thread") - replaces the former per-agent
// click-to-expand accordion + trace table. Checking an agent dims (not
// removes) every other agent's turns in the thread below.
export function SessionDrilldown({ session, project, onOpenCall }: SessionDrilldownProps) {
  const { data: trace } = useSessionTrace(session.session_id, project);
  const [checkedAgents, setCheckedAgents] = useState<Set<string>>(new Set());

  const maxTokens = trace ? Math.max(...trace.agents.map((a) => a.tokens), 1) : 1;
  const totalTokens = trace ? trace.agents.reduce((sum, a) => sum + a.tokens, 0) : 0;
  // The token-dominant agent is where session cost is concentrated, so it's
  // called out in the head line even though nothing auto-expands anymore.
  const dominantAgent = trace
    ? trace.agents.reduce((best, a) => (a.tokens > best.tokens ? a : best), trace.agents[0])
    : null;
  const dominantShare = totalTokens > 0 ? Math.round(((dominantAgent?.tokens ?? 0) / totalTokens) * 100) : 0;

  const agentsWithColor = (trace?.agents ?? []).map((agent, index) => ({
    agent,
    name: agent.agent ?? "unknown",
    channelColor: CHANNEL_COLORS[index % CHANNEL_COLORS.length],
  }));

  const mergedCalls: MergedCall[] = agentsWithColor
    .flatMap(({ agent, name, channelColor }) => agent.trace.map((call) => ({ call, agentName: name, channelColor })))
    .sort((a, b) => a.call.global_position - b.call.global_position);

  const detailQueries = useCallDetails(
    session.session_id,
    mergedCalls.map((m) => m.call.global_position),
    project,
  );

  if (!trace) return null;

  function toggleAgent(name: string) {
    setCheckedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <div className="rounded-[4px] border border-(--paper-line) bg-(--window)" data-testid="session-drilldown">
      <div className="flex flex-wrap items-baseline gap-2.5 rounded-t-[3px] border-b border-(--paper-line) bg-(--bone-dim) px-4.5 py-3.5">
        <span className="text-[13px] font-bold">{session.label || `Session ${shortId(session.session_id)}`}</span>
        <span className="font-mono text-[11.5px] text-(--ink-soft)">
          {formatSessionDuration(trace.started, trace.ended)} runtime
          {dominantAgent && ` · ${dominantAgent.agent ?? "unknown"} dominant (${dominantShare}% of tokens)`}
        </span>
      </div>

      <div className="border-b border-(--paper-line)" data-testid="agent-select-list">
        {agentsWithColor.map(({ agent, name, channelColor }) => (
          <AgentSelectRow
            key={name}
            calls={agent.calls}
            tokens={agent.tokens}
            cost={agent.cost}
            name={name}
            maxTokens={maxTokens}
            channelColor={channelColor}
            checked={checkedAgents.has(name)}
            onToggle={() => toggleAgent(name)}
          />
        ))}
      </div>

      <div
        className="mx-4.5 my-2.5 rounded-[4px] border border-(--paper-line) bg-(--bone-dim) px-4.5 pt-4 pb-1"
        data-testid="chat-thread"
      >
        <div className="font-label mb-4 text-[9.5px] font-bold tracking-wide text-(--ink-soft) uppercase">
          full transcript — check an agent above to highlight its calls
        </div>
        {mergedCalls.map(({ call, agentName, channelColor }, i) => (
          <ChatTurn
            key={call.request_id}
            sessionId={session.session_id}
            call={call}
            agentName={agentName}
            channelColor={channelColor}
            detail={detailQueries[i]?.data}
            isLoading={detailQueries[i]?.isLoading ?? false}
            dimmed={checkedAgents.size > 0 && !checkedAgents.has(agentName)}
            onOpenCall={onOpenCall}
          />
        ))}
      </div>
    </div>
  );
}

function AgentSelectRow({
  name,
  calls,
  tokens,
  cost,
  maxTokens,
  channelColor,
  checked,
  onToggle,
}: {
  name: string;
  calls: number;
  tokens: number;
  cost: number | "unknown" | null;
  maxTokens: number;
  channelColor: string;
  checked: boolean;
  onToggle: () => void;
}) {
  const isSubagent = name !== "main";
  const checkboxId = `agent-select-${name}`;

  return (
    <div className="border-b border-(--paper-line-soft) last:border-b-0" data-testid={`agent-row-${name}`}>
      <label
        htmlFor={checkboxId}
        className={
          "grid w-full cursor-pointer grid-cols-[18px_110px_1fr_90px_90px_70px] items-center gap-3 px-4.5 py-3 text-left text-[13px] " +
          (checked ? "bg-(--bone-dim)" : "bg-transparent")
        }
      >
        <input
          type="checkbox"
          id={checkboxId}
          data-testid={checkboxId}
          checked={checked}
          onChange={onToggle}
          className="sr-only"
        />
        <span
          aria-hidden="true"
          className="h-2.25 w-2.25 shrink-0 rounded-[2px] border-[1.5px]"
          style={
            checked
              ? { backgroundColor: channelColor, borderColor: channelColor }
              : { backgroundColor: "transparent", borderColor: "var(--ink-faint)" }
          }
        />
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-semibold leading-tight">
          <span className="truncate">{name}</span>
          {isSubagent && (
            <span className="font-label shrink-0 rounded-[3px] border border-(--paper-line) px-1 py-0.5 text-[9.5px] lowercase text-(--ink-faint)">
              subagent
            </span>
          )}
        </span>
        <div
          className="h-2 overflow-hidden rounded-[2px] border border-(--paper-line) bg-(--bone-dim)"
          data-testid={`agent-mini-bar-${name}`}
        >
          <div className="h-full" style={{ width: `${(tokens / maxTokens) * 100}%`, backgroundColor: channelColor }} />
        </div>
        <span className="font-label text-right text-[11.5px] text-(--ink-soft) tabular-nums">{calls} calls</span>
        <span className="font-label text-right text-[11.5px] text-(--ink-soft) tabular-nums">
          {formatTokens(tokens)} tok
        </span>
        <span className="font-label text-right text-[12px] font-bold tabular-nums">{formatCost(cost)}</span>
      </label>
    </div>
  );
}

function ChatTurn({
  sessionId,
  call,
  agentName,
  channelColor,
  detail,
  isLoading,
  dimmed,
  onOpenCall,
}: {
  sessionId: string;
  call: TraceCall;
  agentName: string;
  channelColor: string;
  detail: CallDetail | undefined;
  isLoading: boolean;
  dimmed: boolean;
  onOpenCall: (sessionId: string, position: number) => void;
}) {
  return (
    <div
      className="border-l border-(--paper-line) pb-4 pl-3.5 transition-opacity duration-150 [&+&]:mt-4 [&+&]:border-t [&+&]:border-dashed [&+&]:border-(--paper-line) [&+&]:pt-4"
      style={{ opacity: dimmed ? 0.32 : 1 }}
      data-testid={`chat-turn-${sessionId}-${call.global_position}`}
    >
      <div className="font-mono mb-2.5 flex flex-wrap items-center gap-2 text-[10px] tabular-nums text-(--ink-soft)">
        <span className="font-label font-bold" style={{ color: channelColor }}>
          {agentName}
        </span>
        <span>
          · #{call.position} · {formatTimeOfDay(call.timestamp)} · {call.model} ·{" "}
          {call.input_tokens.toLocaleString()} in / {call.output_tokens.toLocaleString()} out ·{" "}
          {formatCost(call.cost)} · {formatDuration(call.duration_seconds)}
        </span>
        <button
          type="button"
          onClick={() => onOpenCall(sessionId, call.global_position)}
          data-testid={`view-full-detail-${sessionId}-${call.global_position}`}
          className="font-label ml-auto cursor-pointer border-0 border-b border-(--ink-faint) bg-transparent p-0 text-[9.5px] tracking-wide whitespace-nowrap text-(--ink-soft) uppercase"
        >
          view full detail
        </button>
      </div>

      <ChatBubble role="prompt" align="left" isLoading={isLoading} detail={detail} field="prompt" />
      <ChatBubble role="response" align="right" isLoading={isLoading} detail={detail} field="response" />
    </div>
  );
}

function ChatBubble({
  role,
  align,
  isLoading,
  detail,
  field,
}: {
  role: "prompt" | "response";
  align: "left" | "right";
  isLoading: boolean;
  detail: CallDetail | undefined;
  field: "prompt" | "response";
}) {
  const isRight = align === "right";
  const text = detail ? (detail.available ? (detail[field] ?? "") : "Transcript unavailable.") : null;

  return (
    <div className={"mb-2.5 max-w-[80%] last:mb-0 " + (isRight ? "ml-auto" : "mr-auto")}>
      <span
        className={
          "font-label mb-1 block text-[9px] tracking-wide text-(--ink-faint) uppercase " + (isRight ? "text-right" : "")
        }
      >
        {role}
      </span>
      <div
        className="rounded-[4px] border border-(--paper-line) px-3 py-2.5 text-[12px] whitespace-pre-wrap"
        style={isRight ? { backgroundColor: "var(--ch1-soft)", borderColor: "var(--ch1-soft)" } : undefined}
        data-testid={`chat-bubble-${role}`}
      >
        {isLoading ? <span className="text-(--ink-soft) italic">loading…</span> : text}
      </div>
    </div>
  );
}
