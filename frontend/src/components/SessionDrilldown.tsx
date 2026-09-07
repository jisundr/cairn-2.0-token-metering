import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useState } from "react";
import { useCallDetails, useSessionTrace } from "../api/hooks";
import type { CallDetail, SessionSummary, TraceCall } from "../api/types";
import { formatCost, formatDuration, formatTimeOfDay, formatTokens, shortId } from "../lib/format";

interface SessionDrilldownProps {
  session: SessionSummary;
  project?: string;
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

// Compact verb per tool name for inline action lines - falls back to the
// bare tool name for anything unmapped.
const TOOL_ACTION_VERB: Record<string, string> = {
  Write: "Edited",
  Edit: "Edited",
  Bash: "Ran",
  Grep: "Searched",
  Glob: "Searched",
  WebFetch: "Fetched",
  Task: "Dispatched",
  Skill: "Invoked",
};

function toolActionLine(toolCall: { name: string; summary: string }): string {
  const verb = TOOL_ACTION_VERB[toolCall.name] ?? toolCall.name;
  return toolCall.summary ? `${verb} ${toolCall.summary}` : verb;
}

interface MergedCall {
  call: TraceCall;
  agentName: string;
  channelColor: string;
}

interface CallEntry extends MergedCall {
  detail: CallDetail | undefined;
  isLoading: boolean;
}

interface Turn {
  key: string;
  agentName: string;
  channelColor: string;
  firstGlobalPosition: number;
  calls: CallEntry[];
}

// Groups one agent's own chronological calls into turns: consecutive calls
// merge into the same turn only when both the current and immediately
// preceding call's detail have loaded, are both available, and the current
// call's prompt is non-empty and string-equals the previous one's - a
// same-agent walk-back-to-the-same-prompt tool round trip. Anything else
// (including an unavailable or still-loading call) starts a new turn -
// fail safe, never guess.
function buildAgentTurns(
  agentName: string,
  channelColor: string,
  trace: TraceCall[],
  detailByPosition: Map<number, { detail: CallDetail | undefined; isLoading: boolean }>,
): Turn[] {
  const turns: Turn[] = [];
  let previous: CallEntry | null = null;

  for (const call of trace) {
    const found = detailByPosition.get(call.global_position);
    const entry: CallEntry = {
      call,
      agentName,
      channelColor,
      detail: found?.detail,
      isLoading: found?.isLoading ?? false,
    };

    const canMerge =
      previous !== null &&
      !previous.isLoading &&
      !entry.isLoading &&
      previous.detail?.available === true &&
      entry.detail?.available === true &&
      !!entry.detail.prompt &&
      entry.detail.prompt === previous.detail.prompt;

    if (canMerge) {
      turns[turns.length - 1].calls.push(entry);
    } else {
      turns.push({
        key: `${agentName}-${call.global_position}`,
        agentName,
        channelColor,
        firstGlobalPosition: call.global_position,
        calls: [entry],
      });
    }

    previous = entry;
  }

  return turns;
}

// A stacked share bar (session-total token share per agent) whose segments
// double as the legend rows below it - the legend's click-to-select drives
// the dim/highlight-other-agents behavior in the chat thread. Replaces the
// former per-agent click-to-expand accordion + trace table; a legend click
// dims (not removes) every other agent's turns in the thread below.
export function SessionDrilldown({ session, project }: SessionDrilldownProps) {
  const { data: trace } = useSessionTrace(session.session_id, project);
  const [checkedAgents, setCheckedAgents] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const detailByPosition = new Map<number, { detail: CallDetail | undefined; isLoading: boolean }>();
  mergedCalls.forEach((m, i) => {
    detailByPosition.set(m.call.global_position, {
      detail: detailQueries[i]?.data,
      isLoading: detailQueries[i]?.isLoading ?? false,
    });
  });

  // Turn-group each agent using its own chronological trace order (never the
  // merged global_position order - a subagent's calls come from a separate
  // transcript file and can't share a turn with a different agent's call),
  // then merge every agent's turns back into one sequence ordered by each
  // turn's first call's global_position (today's single continuous
  // merged-thread behavior).
  const turns: Turn[] = agentsWithColor
    .flatMap(({ agent, name, channelColor }) => buildAgentTurns(name, channelColor, agent.trace, detailByPosition))
    .sort((a, b) => a.firstGlobalPosition - b.firstGlobalPosition);

  // Windowed rendering: chat-thread's turns vary from one bubble to several
  // tool-action lines, so item size is measured per-turn rather than fixed.
  const rowVirtualizer = useVirtualizer({
    count: turns.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 160,
    overscan: 5,
  });

  function toggleAgent(name: string) {
    setCheckedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  if (!trace) return null;

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-(--border) bg-(--surface)" data-testid="session-drilldown">
      <div className="flex flex-none flex-wrap items-baseline gap-2.5 rounded-t-lg border-b border-(--border) bg-(--surface-muted) px-4.5 py-3.5">
        <span className="text-[13px] font-bold">{session.label || `Session ${shortId(session.session_id)}`}</span>
        <span className="font-mono text-[11.5px] text-(--ink-soft)">
          {formatSessionDuration(trace.started, trace.ended)} runtime
          {dominantAgent && ` · ${dominantAgent.agent ?? "unknown"} dominant (${dominantShare}% of tokens)`}
        </span>
      </div>

      <div className="flex-none px-4.5 pt-3.5">
        <AgentShareBar agents={agentsWithColor.map(({ agent, name, channelColor }) => ({ name, channelColor, tokens: agent.tokens }))} totalTokens={totalTokens} />
      </div>

      <div className="flex-none border-b border-(--border)" data-testid="agent-select-list">
        {agentsWithColor.map(({ agent, name, channelColor }) => (
          <AgentSelectRow
            key={name}
            calls={agent.calls}
            tokens={agent.tokens}
            cost={agent.cost}
            name={name}
            channelColor={channelColor}
            checked={checkedAgents.has(name)}
            onToggle={() => toggleAgent(name)}
          />
        ))}
      </div>

      <div
        className="mx-4.5 my-2.5 flex min-h-0 flex-1 flex-col rounded-md border border-(--border) bg-(--surface-muted)"
        data-testid="chat-thread"
      >
        <div className="flex-none px-4.5 pt-4 pb-2 text-[10px] font-semibold tracking-wide text-(--ink-soft) uppercase">
          full transcript — select an agent above to highlight its calls
        </div>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4.5 pb-1">
          <div style={{ height: rowVirtualizer.getTotalSize(), width: "100%", position: "relative" }}>
            {rowVirtualizer.getVirtualItems().map((virtualItem) => {
              const turn = turns[virtualItem.index];
              return (
                <div
                  key={turn.key}
                  data-index={virtualItem.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <ChatTurn
                    sessionId={session.session_id}
                    turn={turn}
                    dimmed={checkedAgents.size > 0 && !checkedAgents.has(turn.agentName)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// 100%-stacked bar of each agent's share of the session's *total* tokens
// (not the top agent's tokens) - segment order matches agentsWithColor and
// each agent's legend row below. Segments are hover-only; the legend row is
// the click target (5b).
function AgentShareBar({
  agents,
  totalTokens,
}: {
  agents: { name: string; channelColor: string; tokens: number }[];
  totalTokens: number;
}) {
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-[3px]" data-testid="agent-share-bar">
      {agents.map(({ name, channelColor, tokens }) => {
        const pct = totalTokens > 0 ? (tokens / totalTokens) * 100 : 0;
        return (
          <div
            key={name}
            className="group relative h-full"
            style={{ width: `${pct}%`, backgroundColor: channelColor }}
            data-testid={`agent-share-segment-${name}`}
          >
            <div
              data-testid={`agent-share-tooltip-${name}`}
              className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 rounded-md border border-(--border) bg-(--surface) px-2 py-1.5 text-[11px] whitespace-nowrap text-(--ink) group-hover:block"
            >
              <div className="font-medium">{name}</div>
              <div className="text-(--ink-soft) tabular-nums">
                {formatTokens(tokens)} tok · {Math.round(pct)}%
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Legend row keyed to the matching AgentShareBar segment - the click target
// that drives the chat thread's dim/highlight-other-agents behavior
// (replaces the former checkbox row and its embedded mini-bar).
function AgentSelectRow({
  name,
  calls,
  tokens,
  cost,
  channelColor,
  checked,
  onToggle,
}: {
  name: string;
  calls: number;
  tokens: number;
  cost: number | "unknown" | null;
  channelColor: string;
  checked: boolean;
  onToggle: () => void;
}) {
  const isSubagent = name !== "main";

  return (
    <div className="border-b border-(--border-soft) last:border-b-0" data-testid={`agent-row-${name}`}>
      <button
        type="button"
        aria-pressed={checked}
        data-testid={`agent-select-${name}`}
        onClick={onToggle}
        className={
          "grid w-full cursor-pointer grid-cols-[14px_110px_1fr] items-center gap-3 px-4.5 py-3 text-left text-[13px] " +
          (checked ? "bg-(--surface-muted)" : "bg-transparent")
        }
      >
        <span aria-hidden="true" className="h-2.25 w-2.25 shrink-0 rounded-[2px]" style={{ backgroundColor: channelColor }} />
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-semibold leading-tight">
          <span className="truncate">{name}</span>
          {isSubagent && (
            <span className="shrink-0 rounded-[3px] border border-(--border) px-1 py-0.5 text-[9.5px] lowercase text-(--ink-faint)">
              subagent
            </span>
          )}
        </span>
        <span className="ml-auto flex items-center gap-3" data-testid={`agent-row-meta-${name}`}>
          <span className="w-[62px] text-right text-[11.5px] text-(--ink-soft) tabular-nums">{calls} calls</span>
          <span className="w-[72px] text-right text-[11.5px] text-(--ink-soft) tabular-nums">{formatTokens(tokens)} tok</span>
          <span className="w-[62px] text-right text-[12px] font-bold tabular-nums">{formatCost(cost)}</span>
        </span>
      </button>
    </div>
  );
}

// One turn = one human prompt (rendered once) followed by every call the
// turn's tool round trip produced, each with its own metadata line and
// inline tool-action lines, then the turn's final text reply if it produced
// one - no blank text bubble ever renders in place of a tool-only reply.
function ChatTurn({ sessionId, turn, dimmed }: { sessionId: string; turn: Turn; dimmed: boolean }) {
  const firstCall = turn.calls[0];
  const lastCall = turn.calls[turn.calls.length - 1];
  const finalResponse =
    lastCall.detail && lastCall.detail.available ? (lastCall.detail.response ?? "") : "";

  return (
    <div
      className="border-l border-(--border) pb-4 pl-3.5 transition-opacity duration-150 [&+&]:mt-4 [&+&]:border-t [&+&]:border-(--border) [&+&]:pt-4"
      style={{ opacity: dimmed ? 0.32 : 1 }}
      data-testid={`chat-turn-${sessionId}-${turn.firstGlobalPosition}`}
    >
      <ChatBubble role="prompt" align="left" isLoading={firstCall.isLoading} detail={firstCall.detail} field="prompt" />

      {turn.calls.map((entry) => (
        <CallMeta key={entry.call.request_id} entry={entry} />
      ))}

      {finalResponse && (
        <div className="mb-2.5 ml-auto max-w-[80%] last:mb-0">
          <span className="mb-1 block text-right text-[9px] tracking-wide text-(--ink-faint) uppercase">response</span>
          <div
            className="rounded-md border border-(--ch1-soft) px-3 py-2.5 text-[12px] whitespace-pre-wrap"
            style={{ backgroundColor: "var(--ch1-soft)" }}
            data-testid="chat-bubble-response"
          >
            {finalResponse}
          </div>
        </div>
      )}
    </div>
  );
}

// A single call's metadata line plus its inline tool-action lines - kept
// visible per call (not hidden behind a detail view) even when several
// calls share one turn.
function CallMeta({ entry }: { entry: CallEntry }) {
  const { call, agentName, channelColor, detail, isLoading } = entry;
  const toolCalls = !isLoading && detail?.available ? detail.tool_calls : [];

  return (
    <div className="mb-2.5">
      <div className="font-mono flex flex-wrap items-center gap-2 text-[10px] tabular-nums text-(--ink-soft)">
        <span className="font-body font-semibold" style={{ color: channelColor }} data-testid="call-agent-name">
          {agentName}
        </span>
        <span>
          · #{call.position} · {formatTimeOfDay(call.timestamp)} · {call.model} ·{" "}
          {call.input_tokens.toLocaleString()} in / {call.output_tokens.toLocaleString()} out ·{" "}
          {formatCost(call.cost)} · {formatDuration(call.duration_seconds)}
        </span>
      </div>
      {toolCalls.map((toolCall, i) => (
        <div key={i} className="font-mono mt-1 pl-1 text-[11px] text-(--ink-soft)">
          {toolActionLine(toolCall)}
        </div>
      ))}
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
        className={"mb-1 block text-[9px] tracking-wide text-(--ink-faint) uppercase " + (isRight ? "text-right" : "")}
      >
        {role}
      </span>
      <div
        className="rounded-md border border-(--border) px-3 py-2.5 text-[12px] whitespace-pre-wrap"
        style={isRight ? { backgroundColor: "var(--ch1-soft)", borderColor: "var(--ch1-soft)" } : undefined}
        data-testid={`chat-bubble-${role}`}
      >
        {isLoading ? <span className="text-(--ink-soft) italic">loading…</span> : text}
      </div>
    </div>
  );
}
