import type { ReactNode } from "react";
import type { SessionSummary } from "../api/types";
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
}: SessionsTableProps) {
  const visible = multiProject && projectFilter !== "all" ? sessions.filter((s) => s.project === projectFilter) : sessions;

  return (
    <div className="mb-5.5">
      <div className="font-label mb-3.5 text-xs tracking-wide text-(--ink-soft) uppercase">Sessions</div>
      <p className="font-label -mt-1.5 mb-3 text-[11px] text-(--ink-soft)">
        Most recent session shown below by default — click any row to change it.
      </p>

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

      <table className="w-full border-collapse text-[13px]" data-testid="sessions-table">
        <thead>
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
          {visible.map((s) => (
            <tr
              key={`${s.project}-${s.session_id}`}
              data-testid={`session-row-${s.session_id}`}
              onClick={() => onSelect(s.session_id)}
              className={cn(
                "cursor-pointer border-b border-dashed border-(--paper-line)",
                selectedSessionId === s.session_id && "bg-(--blue-soft)",
              )}
            >
              <Td>{formatStarted(s.started)}</Td>
              <Td>
                {s.usage_limit_hit && <span className="mr-1.5 inline-block h-1.75 w-1.75 rounded-full bg-(--flag)" />}
                {s.session_id}
              </Td>
              {multiProject && <Td>{s.project}</Td>}
              <Td>{s.agents.length}</Td>
              <Td>{s.tokens.toLocaleString()}</Td>
              <Td>{formatCost(s.cost)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`project-filter-${label}`}
      className={cn(
        "font-label cursor-pointer rounded-full border border-(--block-line) px-3 py-1 text-[10.5px] tracking-wide text-(--ink-soft) uppercase select-none",
        active && "border-(--blue) bg-(--blue-soft) font-bold text-(--blue)",
      )}
    >
      {label}
    </button>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="font-label border-b border-(--block-line) px-2.5 pb-2 text-left text-[10.5px] font-normal tracking-wide text-(--ink-soft) uppercase">
      {children}
    </th>
  );
}

function Td({ children }: { children: ReactNode }) {
  return <td className="px-2.5 py-2.25 tabular-nums">{children}</td>;
}
