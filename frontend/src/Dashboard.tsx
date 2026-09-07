import { useEffect, useState } from "react";
import {
  useAgentRollup,
  useHeatmap,
  useMcpRollup,
  useModelRollup,
  useProjects,
  useSessions,
  useSkillRollup,
  useTimeseries,
  useToolRollup,
  useUsageLimitEvents,
} from "./api/hooks";
import type { RangeKey } from "./api/types";
import { ActivityHeatmap } from "./components/ActivityHeatmap";
import { EmptyState } from "./components/EmptyState";
import { HbarGroupLabel, HbarList } from "./components/HbarList";
import { type DashboardTab, Header } from "./components/Header";
import { ProjectsPanel } from "./components/ProjectsPanel";
import { SessionDrilldown } from "./components/SessionDrilldown";
import { SessionsTable } from "./components/SessionsTable";
import { Panel, PanelTitle } from "./components/ui/panel";
import { Skeleton } from "./components/ui/skeleton";
import { TokensPerDayPanel } from "./components/TokensPerDayPanel";
import { WarningBanner } from "./components/WarningBanner";
import { formatCost, formatTokens } from "./lib/format";

const HBAR_RANGE = "7d" as const;
const DEFAULT_SESSIONS_RANGE: RangeKey = "30d";

function pathForTab(tab: DashboardTab): string {
  return tab === "sessions" ? "/sessions" : "/";
}

function tabFromPath(pathname: string): DashboardTab {
  return pathname.startsWith("/sessions") ? "sessions" : "dashboard";
}

export function Dashboard() {
  const [projectFilter, setProjectFilter] = useState("all");
  const [sessionsRange, setSessionsRange] = useState<RangeKey>(DEFAULT_SESSIONS_RANGE);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTabState] = useState<DashboardTab>(() => tabFromPath(window.location.pathname));

  // Tab state lives in the URL path (no router library) so a hard reload of
  // /sessions lands back on the Sessions tab instead of resetting to Dashboard.
  function navigateToTab(tab: DashboardTab) {
    setActiveTabState(tab);
    if (pathForTab(tab) !== window.location.pathname) {
      window.history.pushState(null, "", pathForTab(tab));
    }
  }

  useEffect(() => {
    window.history.replaceState(null, "", pathForTab(activeTab));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onPopState() {
      setActiveTabState(tabFromPath(window.location.pathname));
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const projectParam = projectFilter === "all" ? undefined : projectFilter;

  const projects = useProjects();
  const sessions = useSessions({ range: sessionsRange, project: projectParam });
  const usageLimitEvents = useUsageLimitEvents({ range: "7d", project: projectParam });
  const todayTimeseries = useTimeseries({ range: "today", project: projectParam });
  const sevenDayTimeseries = useTimeseries({ range: "7d", project: projectParam });
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

  // The warning banner's "view session" link lives on the Dashboard tab but
  // points at a session's drilldown, which now renders on the Sessions tab -
  // select it there too so the existing jump-to-session behavior still works.
  function handleViewSession(sessionId: string) {
    setSelectedSessionId(sessionId);
    navigateToTab("sessions");
  }

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8" data-testid="dashboard">
      <Header lastUpdated={lastUpdated} onRefresh={handleRefresh} activeTab={activeTab} onTabChange={navigateToTab} />

      {isColdStart ? (
        <EmptyState />
      ) : (
        <>
          {activeTab === "dashboard" && (
            <div data-testid="tab-panel-dashboard">
              <WarningBanner events={usageLimitEvents.data ?? []} onViewSession={handleViewSession} />

              <div className="mb-4.5 flex flex-wrap gap-3" data-testid="meter-row">
                <MeterBox
                  label="Tokens today"
                  value={formatTokens(todayTimeseries.data?.total_tokens ?? 0)}
                  testId="meter-tokens-today"
                  isLoading={todayTimeseries.isLoading}
                />
                <MeterBox
                  label="Cost today"
                  value={todayTimeseries.data ? formatCost(todayTimeseries.data.total_cost) : formatCost(0)}
                  testId="meter-cost-today"
                  isLoading={todayTimeseries.isLoading}
                />
                <MeterBox
                  label="Tokens 7D"
                  value={formatTokens(sevenDayTimeseries.data?.total_tokens ?? 0)}
                  testId="meter-tokens-7d"
                  isLoading={sevenDayTimeseries.isLoading}
                />
              </div>

              <div className="mb-5.5 grid grid-cols-1 gap-4.5 lg:grid-cols-[1.3fr_1fr]">
                <TokensPerDayPanel project={projectParam} />

                <Panel>
                  <PanelTitle>Agents &amp; skills, {HBAR_RANGE}</PanelTitle>
                  <HbarGroupLabel>tokens by agent</HbarGroupLabel>
                  <HbarList
                    data-testid="agent-rollup"
                    isLoading={agentRollup.isLoading}
                    rows={(agentRollup.data ?? []).map((r) => ({
                      label: r.key,
                      value: r.tokens,
                      display: formatTokens(r.tokens),
                    }))}
                  />
                  <HbarGroupLabel>skills invoked</HbarGroupLabel>
                  <HbarList
                    data-testid="skill-rollup"
                    isLoading={skillRollup.isLoading}
                    rows={(skillRollup.data ?? []).map((r) => ({
                      label: r.key,
                      value: r.count,
                      display: `${r.count}×`,
                    }))}
                    emptyText="No skills invoked yet."
                  />
                </Panel>

                <Panel>
                  <PanelTitle>Activity</PanelTitle>
                  <p className="-mt-2 mb-1 text-[11px] text-(--ink-soft)">Calls per day — last 7 days.</p>
                  <ActivityHeatmap calls={heatmap.data ?? []} />
                </Panel>

                <Panel>
                  <PanelTitle>Tokens / model, {HBAR_RANGE}</PanelTitle>
                  <HbarList
                    data-testid="model-rollup"
                    isLoading={modelRollup.isLoading}
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
                    isLoading={toolRollup.isLoading}
                    rows={(toolRollup.data ?? []).map((r) => ({
                      label: r.key,
                      value: r.count,
                      display: String(r.count),
                    }))}
                  />
                </Panel>

                <Panel>
                  <PanelTitle>MCP calls, {HBAR_RANGE}</PanelTitle>
                  <HbarList
                    data-testid="mcp-rollup"
                    isLoading={mcpRollup.isLoading}
                    rows={(mcpRollup.data ?? []).map((r) => ({
                      label: r.key,
                      value: r.count,
                      display: String(r.count),
                    }))}
                    emptyText="No MCP calls yet."
                  />
                </Panel>

                {multiProject && <ProjectsPanel sessions={sessionRows} />}
              </div>
            </div>
          )}

          {activeTab === "sessions" && (
            <div data-testid="tab-panel-sessions">
              <SessionsTable
                sessions={sessionRows}
                multiProject={multiProject}
                selectedSessionId={selectedSessionId}
                onSelect={setSelectedSessionId}
                projectFilter={projectFilter}
                onProjectFilterChange={setProjectFilter}
                projectLabels={(projects.data ?? []).map((p) => p.label)}
                sessionsRange={sessionsRange}
                onSessionsRangeChange={setSessionsRange}
              />

              {selectedSession && <SessionDrilldown session={selectedSession} project={projectParam} />}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MeterBox({
  label,
  value,
  testId,
  isLoading,
}: {
  label: string;
  value: string;
  testId: string;
  isLoading?: boolean;
}) {
  return (
    <div
      data-testid={testId}
      className="flex-1 basis-[170px] rounded-lg border border-(--border) bg-(--surface) px-4 py-3.5"
    >
      <span className="block text-[11px] font-medium text-(--ink-soft)">{label}</span>
      {isLoading ? (
        <Skeleton className="mt-1 h-[27px] w-16" />
      ) : (
        <span className="font-mono block text-[27px] font-semibold tabular-nums text-(--ink)">{value}</span>
      )}
    </div>
  );
}
