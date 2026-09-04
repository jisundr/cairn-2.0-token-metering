import type { ReactNode } from "react";
import type { RangeKey, SessionSummary } from "../api/types";
import { formatCost, formatStarted } from "../lib/format";
import { cn } from "../lib/utils";

interface SessionsTableProps {
  sessions: SessionSummary[];
  multiProject: boolean;
  selectedSessionId: string | null;
  onSelect: (sessionId: string) => void;
  projectFilter: string;
  onProjectFilterChange: (project: string) => void;
  projectLabels: string[];
  sessionsRange: RangeKey;
  onSessionsRangeChange: (range: RangeKey) => void;
}

// Most-recent session auto-selected, click-to-select; a project column and
// filter pills appear only in the multi-project (user/local-scope install)
// case (03-architecture.md's Cross-project rollup; plan.md's Actionable 3).
export function SessionsTable({
  sessions,
  multiProject,
  selectedSessionId,
  onSelect,
  projectFilter,
  onProjectFilterChange,
  projectLabels,
  sessionsRange,
  onSessionsRangeChange,
}: SessionsTableProps) {
  const visible = multiProject && projectFilter !== "all" ? sessions.filter((s) => s.project === projectFilter) : sessions;

  return (
    <div className="mb-5.5">
      <div className="font-label mb-3.5 text-xs tracking-wide text-(--ink-soft) uppercase">Sessions</div>
      <p className="font-label -mt-1.5 mb-3 text-[11px] text-(--ink-soft)">
        Most recent session shown below by default — click any row to change it.
      </p>

      <div className="mb-3.5 flex flex-wrap gap-1.5" data-testid="sessions-range">
        <FilterPill
          label="Last 30 days"
          active={sessionsRange === "30d"}
          onClick={() => onSessionsRangeChange("30d")}
          testId="sessions-range-30d"
        />
        <FilterPill
          label="All time"
          active={sessionsRange === "life"}
          onClick={() => onSessionsRangeChange("life")}
          testId="sessions-range-life"
        />
      </div>

      {multiProject && (
        <div className="mb-3.5 flex flex-wrap gap-1.5" data-testid="project-filter">
          <FilterPill label="All projects" active={projectFilter === "all"} onClick={() => onProjectFilterChange("all")} />
          {projectLabels.map((label) => (
            <FilterPill
              key={label}
              label={label}
              active={projectFilter === label}
              onClick={() => onProjectFilterChange(label)}
            />
          ))}
        </div>
      )}

      <div className="max-h-[420px] overflow-y-auto rounded-[4px] border border-(--paper-line)">
        <table className="w-full border-collapse text-[13px]" data-testid="sessions-table">
          <thead className="sticky top-0 z-10 bg-(--window)">
            <tr>
              <Th>Started</Th>
              <Th>Session</Th>
              {multiProject && <Th>Project</Th>}
              <Th>Agents</Th>
              <Th>Tokens</Th>
              <Th>Est. cost</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => {
              const selected = selectedSessionId === s.session_id;
              return (
                <tr
                  key={`${s.project}-${s.session_id}`}
                  data-testid={`session-row-${s.session_id}`}
                  onClick={() => onSelect(s.session_id)}
                  className={cn(
                    "cursor-pointer border-b border-dashed border-(--paper-line)",
                    selected && "bg-(--signal-soft)",
                  )}
                >
                  <Td mono>{formatStarted(s.started)}</Td>
                  <Td>
                    {selected && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-[1px] bg-(--signal)" />}
                    {s.usage_limit_hit && <span className="mr-1.5 inline-block h-1.75 w-1.75 rounded-full bg-(--signal)" />}
                    {s.session_id}
                  </Td>
                  {multiProject && <Td>{s.project}</Td>}
                  <Td mono>{s.agents.length}</Td>
                  <Td mono>{s.tokens.toLocaleString()}</Td>
                  <Td mono>{formatCost(s.cost)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
  testId,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId ?? `project-filter-${label}`}
      className={cn(
        "font-label cursor-pointer rounded-[3px] border border-(--paper-line) bg-(--window) px-3 py-1 text-[10.5px] tracking-wide text-(--ink-soft) uppercase select-none",
        active && "border-(--signal) bg-(--signal) font-bold text-(--window)",
      )}
    >
      {label}
    </button>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="font-label border-b border-(--paper-line) px-2.5 pb-2 text-left text-[10.5px] font-normal tracking-wide text-(--ink-soft) uppercase">
      {children}
    </th>
  );
}

function Td({ children, mono }: { children: ReactNode; mono?: boolean }) {
  return <td className={cn("px-2.5 py-2.25 tabular-nums", mono && "font-mono")}>{children}</td>;
}
