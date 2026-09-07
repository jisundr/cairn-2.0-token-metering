import { useState } from "react";
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

// Checkbox-driven agent-select rows (DESIGN.md's "Agent-select rows") above
// one always-visible, turn-grouped chat thread merging every agent's calls
// (DESIGN.md's "Chat thread") - replaces the former per-agent click-to-expand
// accordion + trace table. Checking an agent dims (not removes) every other
// agent's turns in the thread below.
export function SessionDrilldown({ session, project }: SessionDrilldownProps) {
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

  return (
    <div className="rounded-lg border border-(--border) bg-(--surface)" data-testid="session-drilldown">
      <div className="flex flex-wrap items-baseline gap-2.5 rounded-t-lg border-b border-(--border) bg-(--surface-muted) px-4.5 py-3.5">
        <span className="text-[13px] font-bold">{session.label || `Session ${shortId(session.session_id)}`}</span>
        <span className="font-mono text-[11.5px] text-(--ink-soft)">
          {formatSessionDuration(trace.started, trace.ended)} runtime
          {dominantAgent && ` · ${dominantAgent.agent ?? "unknown"} dominant (${dominantShare}% of tokens)`}
        </span>
      </div>

      <div className="border-b border-(--border)" data-testid="agent-select-list">
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
        className="mx-4.5 my-2.5 rounded-md border border-(--border) bg-(--surface-muted) px-4.5 pt-4 pb-1"
        data-testid="chat-thread"
      >
        <div className="mb-4 text-[10px] font-semibold tracking-wide text-(--ink-soft) uppercase">
          full transcript — check an agent above to highlight its calls
        </div>
        {turns.map((turn) => (
          <ChatTurn
            key={turn.key}
            sessionId={session.session_id}
            turn={turn}
            dimmed={checkedAgents.size > 0 && !checkedAgents.has(turn.agentName)}
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
  const pct = Math.round((tokens / maxTokens) * 100);

  return (
    <div className="border-b border-(--border-soft) last:border-b-0" data-testid={`agent-row-${name}`}>
      <label
        htmlFor={checkboxId}
        className={
          "grid w-full cursor-pointer grid-cols-[18px_110px_1fr_90px_90px_70px] items-center gap-3 px-4.5 py-3 text-left text-[13px] " +
          (checked ? "bg-(--surface-muted)" : "bg-transparent")
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
            <span className="shrink-0 rounded-[3px] border border-(--border) px-1 py-0.5 text-[9.5px] lowercase text-(--ink-faint)">
              subagent
            </span>
          )}
        </span>
        <div className="flex items-center gap-1.5" data-testid={`agent-mini-bar-${name}`}>
          <div className="h-2 flex-1 overflow-hidden rounded-[2px] border border-(--border) bg-(--surface-muted)">
            <div className="h-full" style={{ width: `${pct}%`, backgroundColor: channelColor }} />
          </div>
          <span className="w-8 flex-none text-right text-[10.5px] text-(--ink-faint) tabular-nums">{pct}%</span>
        </div>
        <span className="text-right text-[11.5px] text-(--ink-soft) tabular-nums">{calls} calls</span>
        <span className="text-right text-[11.5px] text-(--ink-soft) tabular-nums">{formatTokens(tokens)} tok</span>
        <span className="text-right text-[12px] font-bold tabular-nums">{formatCost(cost)}</span>
      </label>
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
