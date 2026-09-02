import { useEffect, useState } from "react";
import {
  useAgentRollup,
  useHeatmap,
  useMcpRollup,
  useModelRollup,
  useProjects,
  useSessions,
  useSkillRollup,
  useToolRollup,
  useUsageLimitEvents,
} from "./api/hooks";
import { ActivityHeatmap } from "./components/ActivityHeatmap";
import { EmptyState } from "./components/EmptyState";
import { HbarGroupLabel, HbarList } from "./components/HbarList";
import { Header } from "./components/Header";
import { ProjectsPanel } from "./components/ProjectsPanel";
import { SessionDrilldown } from "./components/SessionDrilldown";
import { SessionsTable } from "./components/SessionsTable";
import { TraceDrawer } from "./components/TraceDrawer";
import { Panel, PanelTitle } from "./components/ui/panel";
import { TokensPerDayPanel } from "./components/TokensPerDayPanel";
import { WarningBanner } from "./components/WarningBanner";
import { formatTokens } from "./lib/format";

const HBAR_RANGE = "7d" as const;

interface DashboardProps {
  onOpenCall: (sessionId: string, position: number) => void;
  drawerCall: { sessionId: string; n: number } | null;
  onCloseDrawer: () => void;
  onViewFullPage: () => void;
}

export function Dashboard({ onOpenCall, drawerCall, onCloseDrawer, onViewFullPage }: DashboardProps) {
  const [projectFilter, setProjectFilter] = useState("all");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const projectParam = projectFilter === "all" ? undefined : projectFilter;

  const projects = useProjects();
  const sessions = useSessions({ range: "life", project: projectParam });
  const usageLimitEvents = useUsageLimitEvents({ range: "7d", project: projectParam });
  const agentRollup = useAgentRollup({ range: HBAR_RANGE, project: projectParam });
  const skillRollup = useSkillRollup({ range: HBAR_RANGE, project: projectParam });
  const modelRollup = useModelRollup({ range: HBAR_RANGE, project: projectParam });
  const toolRollup = useToolRollup({ range: HBAR_RANGE, project: projectParam });
  const mcpRollup = useMcpRollup({ range: HBAR_RANGE, project: projectParam });
  const heatmap = useHeatmap({ range: HBAR_RANGE, project: projectParam });

  const multiProject = (projects.data?.length ?? 0) > 1;
  const sessionRows = sessions.data ?? [];

  useEffect(() => {
    if (selectedSessionId && sessionRows.some((s) => s.session_id === selectedSessionId)) return;
    setSelectedSessionId(sessionRows[0]?.session_id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionRows.map((s) => s.session_id).join(",")]);

  useEffect(() => {
    const latest = [sessions.dataUpdatedAt, agentRollup.dataUpdatedAt, projects.dataUpdatedAt].filter(Boolean);
    if (latest.length > 0) setLastUpdated(new Date(Math.max(...latest)));
  }, [sessions.dataUpdatedAt, agentRollup.dataUpdatedAt, projects.dataUpdatedAt]);

  const isColdStart = sessions.isSuccess && sessionRows.length === 0 && (projects.data?.length ?? 0) <= 1;
  const selectedSession = sessionRows.find((s) => s.session_id === selectedSessionId) ?? null;

  function handleRefresh() {
    sessions.refetch();
    agentRollup.refetch();
    skillRollup.refetch();
    modelRollup.refetch();
    toolRollup.refetch();
    mcpRollup.refetch();
    heatmap.refetch();
    usageLimitEvents.refetch();
    projects.refetch();
  }

  return (
    <div className="mx-auto max-w-[1180px] px-7 py-6.5" data-testid="dashboard">
      <Header lastUpdated={lastUpdated} onRefresh={handleRefresh} />

      {isColdStart ? (
        <EmptyState />
      ) : (
        <>
          <WarningBanner events={usageLimitEvents.data ?? []} onViewSession={setSelectedSessionId} />

          <div className="mb-5.5 grid grid-cols-1 gap-4.5 lg:grid-cols-[1.3fr_1fr]">
            <TokensPerDayPanel project={projectParam} />

            <Panel>
              <PanelTitle>Agents &amp; skills, {HBAR_RANGE}</PanelTitle>
              <HbarGroupLabel>tokens by agent</HbarGroupLabel>
              <HbarList
                data-testid="agent-rollup"
                rows={(agentRollup.data ?? []).map((r) => ({
                  label: r.key,
                  value: r.tokens,
                  display: formatTokens(r.tokens),
                }))}
              />
              <HbarGroupLabel>skills invoked</HbarGroupLabel>
              <HbarList
                data-testid="skill-rollup"
                rows={(skillRollup.data ?? []).map((r) => ({ label: r.key, value: r.count, display: `${r.count}×` }))}
                emptyText="No skills invoked yet."
              />
            </Panel>

            <Panel>
              <PanelTitle>Activity</PanelTitle>
              <p className="-mt-2 mb-1 text-[11px] text-(--ink-soft)">When calls happen, by hour of day — last 7 days.</p>
              <ActivityHeatmap calls={heatmap.data ?? []} />
            </Panel>

            <Panel>
              <PanelTitle>Tokens / model, {HBAR_RANGE}</PanelTitle>
              <HbarList
                data-testid="model-rollup"
                rows={(modelRollup.data ?? []).map((r) => ({
                  label: r.key,
                  value: r.tokens,
                  display: formatTokens(r.tokens),
                }))}
              />
            </Panel>

            <Panel>
              <PanelTitle>Tool calls, {HBAR_RANGE}</PanelTitle>
              <HbarList
                data-testid="tool-rollup"
                rows={(toolRollup.data ?? []).map((r) => ({ label: r.key, value: r.count, display: String(r.count) }))}
              />
            </Panel>

            <Panel>
              <PanelTitle>MCP calls, {HBAR_RANGE}</PanelTitle>
              <HbarList
                data-testid="mcp-rollup"
                rows={(mcpRollup.data ?? []).map((r) => ({ label: r.key, value: r.count, display: String(r.count) }))}
                emptyText="No MCP calls yet."
              />
            </Panel>

            {multiProject && <ProjectsPanel sessions={sessionRows} />}
          </div>

          <SessionsTable
            sessions={sessionRows}
            multiProject={multiProject}
            selectedSessionId={selectedSessionId}
            onSelect={setSelectedSessionId}
            projectFilter={projectFilter}
            onProjectFilterChange={setProjectFilter}
            projectLabels={(projects.data ?? []).map((p) => p.label)}
          />

          {selectedSession && (
            <SessionDrilldown session={selectedSession} project={projectParam} onOpenCall={onOpenCall} />
          )}
        </>
      )}

      {drawerCall && (
        <TraceDrawer
          sessionId={drawerCall.sessionId}
          n={drawerCall.n}
          project={projectParam}
          onClose={onCloseDrawer}
          onViewFullPage={onViewFullPage}
        />
      )}
    </div>
  );
}
