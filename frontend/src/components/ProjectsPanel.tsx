import type { SessionSummary } from "../api/types";
import { formatTokens } from "../lib/format";
import { HbarList } from "./HbarList";
import { Panel, PanelTitle } from "./ui/panel";

// Only meaningful for a user/local-scope install (multi-project); a
// project-scope install only ever captures its own repo, so this panel is
// hidden entirely rather than shown with one bar (03-architecture.md's
// Cross-project rollup; plan.md's Actionable 3). There's no dedicated
// per-project rollup endpoint - tokens are summed client-side from the
// already-fetched session rollup, which already carries a `project` label.
export function ProjectsPanel({ sessions }: { sessions: SessionSummary[] }) {
  const totals = new Map<string, number>();
  for (const s of sessions) {
    totals.set(s.project, (totals.get(s.project) ?? 0) + s.tokens);
  }
  const rows = [...totals.entries()]
    .map(([label, tokens]) => ({ label, value: tokens, display: formatTokens(tokens) }))
    .sort((a, b) => b.value - a.value);

  return (
    <Panel data-testid="projects-panel">
      <PanelTitle>Projects</PanelTitle>
      <p className="-mt-2 mb-3 text-[11.5px] text-(--ink-soft)">
        Only meaningful for a user- or local-scope install — a project-scope install only ever captures its own
        repo.
      </p>
      <HbarList rows={rows} />
    </Panel>
  );
}
