// @tanstack/react-query wrappers, one per api.ts entry point, all polling
// at 15s (03-architecture.md's Serving side: capture only ever happens on
// a Stop event, so faster polling wouldn't surface data sooner - 15s still
// feels live without hammering the sqlite read path).
import { useQuery } from "@tanstack/react-query";
import { api, ApiNotFoundError, type RangeParams } from "./client";

export const POLL_INTERVAL_MS = 15_000;

function rangeKey(prefix: string, { range, project }: RangeParams) {
  return [prefix, range, project ?? "all"] as const;
}

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: api.projects,
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useTimeseries(params: RangeParams) {
  return useQuery({
    queryKey: rangeKey("timeseries", params),
    queryFn: () => api.timeseries(params),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useDayDetail(date: string | null, project?: string) {
  return useQuery({
    queryKey: ["day-detail", date, project ?? "all"],
    queryFn: () => api.dayDetail(date as string, project),
    enabled: date !== null,
  });
}

export function useSessions(params: RangeParams) {
  return useQuery({
    queryKey: rangeKey("sessions", params),
    queryFn: () => api.sessions(params),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useAgentRollup(params: RangeParams) {
  return useQuery({
    queryKey: rangeKey("agent-rollup", params),
    queryFn: () => api.agentRollup(params),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useModelRollup(params: RangeParams) {
  return useQuery({
    queryKey: rangeKey("model-rollup", params),
    queryFn: () => api.modelRollup(params),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useToolRollup(params: RangeParams) {
  return useQuery({
    queryKey: rangeKey("tool-rollup", params),
    queryFn: () => api.toolRollup(params),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useSkillRollup(params: RangeParams) {
  return useQuery({
    queryKey: rangeKey("skill-rollup", params),
    queryFn: () => api.skillRollup(params),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useMcpRollup(params: RangeParams) {
  return useQuery({
    queryKey: rangeKey("mcp-rollup", params),
    queryFn: () => api.mcpRollup(params),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useHeatmap(params: RangeParams) {
  return useQuery({
    queryKey: rangeKey("heatmap", params),
    queryFn: () => api.heatmap(params),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useUsageLimitEvents(params: RangeParams) {
  return useQuery({
    queryKey: rangeKey("usage-limit-events", params),
    queryFn: () => api.usageLimitEvents(params),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useSessionTrace(sessionId: string | null, project?: string) {
  return useQuery({
    queryKey: ["session-trace", sessionId, project ?? "all"],
    queryFn: () => api.sessionTrace(sessionId as string, project),
    enabled: sessionId !== null,
    retry: (failureCount, error) => !(error instanceof ApiNotFoundError) && failureCount < 2,
  });
}

export function useCallDetail(sessionId: string | null, n: number | null, project?: string) {
  return useQuery({
    queryKey: ["call-detail", sessionId, n, project ?? "all"],
    queryFn: () => api.callDetail(sessionId as string, n as number, project),
    enabled: sessionId !== null && n !== null,
    retry: (failureCount, error) => !(error instanceof ApiNotFoundError) && failureCount < 2,
  });
}
