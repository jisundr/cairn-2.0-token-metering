import { expect, type Page, test } from "@playwright/test";
import { formatCost, formatTokens, shortId } from "../../src/lib/format";

// Against the "populated" webServer (fixtures/seed.py): a project with
// calls/tool-uses/a usage-limit event across three agents on one session,
// plus one older call on a second session (plan.md's Actionable 5).

// Mirrors fixtures/seed.py's SESSION_MAIN_LABEL - e2e-session-main has a
// saved label, e2e-session-other doesn't (so it still exercises the
// short-id fallback).
const SESSION_MAIN_LABEL = "Add a login page to the app";

// The SessionsTable/SessionDrilldown live under the Sessions tab
// (dashboard-fixup plan.md's Actionables 2-3) - the app defaults to the
// Dashboard tab, so any test that needs them switches first.
async function openSessionsTab(page: Page) {
  await page.getByTestId("app-tab-sessions").click();
  await expect(page.getByTestId("tab-panel-sessions")).toBeVisible();
}

// The drilldown now lives on its own page, reached by clicking a session
// row from the (list-only) Sessions tab.
async function openSessionDrilldown(page: Page, sessionId: string) {
  await openSessionsTab(page);
  await page.getByTestId(`session-row-${sessionId}`).click();
  await expect(page.getByTestId("session-drilldown")).toBeVisible();
}

test.describe("populated dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("dashboard")).toBeVisible();
  });

  test("renders rollup panels with seeded data, not the empty state", async ({ page }) => {
    await expect(page.getByTestId("empty-state")).toHaveCount(0);

    await expect(page.getByTestId("agent-rollup")).toContainText("builder");
    await expect(page.getByTestId("model-rollup")).toContainText("claude-sonnet-5");
    await expect(page.getByTestId("tool-rollup")).toContainText("Bash");
    await expect(page.getByTestId("skill-rollup")).toContainText("commit-msg-lint");
    // server.py's `_mcp_key` reduces "mcp__context7__get-library-docs" to
    // its server name ("context7") for this rollup.
    await expect(page.getByTestId("mcp-rollup")).toContainText("context7");
    await expect(page.getByTestId("activity-heatmap")).toBeVisible();
    // One cell per calendar day in the 7-day window (arranged into 1-2 week
    // columns), not the former 7x24 dow-hour grid (168 cells).
    await expect(page.locator('[data-testid^="heatmap-cell-"]')).toHaveCount(7);
  });

  test("switches between the Dashboard and Sessions tab panels", async ({ page }) => {
    await expect(page.getByTestId("tab-panel-dashboard")).toBeVisible();
    await expect(page.getByTestId("tab-panel-sessions")).toHaveCount(0);
    await expect(page.getByTestId("app-tab-dashboard")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("app-tab-sessions")).toHaveAttribute("aria-pressed", "false");

    await page.getByTestId("app-tab-sessions").click();
    await expect(page.getByTestId("tab-panel-sessions")).toBeVisible();
    await expect(page.getByTestId("tab-panel-dashboard")).toHaveCount(0);
    await expect(page.getByTestId("app-tab-sessions")).toHaveAttribute("aria-pressed", "true");
    // Sessions tab is list-only - the drilldown lives on its own page now,
    // reached by clicking a row (see the session-page tests below).
    await expect(page.getByTestId("sessions-table")).toBeVisible();

    await page.getByTestId("app-tab-dashboard").click();
    await expect(page.getByTestId("tab-panel-dashboard")).toBeVisible();
    await expect(page.getByTestId("tab-panel-sessions")).toHaveCount(0);
  });

  test("lists both seeded sessions", async ({ page }) => {
    await openSessionsTab(page);
    await expect(page.getByTestId("session-row-e2e-session-main")).toBeVisible();
    await expect(page.getByTestId("session-row-e2e-session-other")).toBeVisible();
  });

  test("session label: saved title is the primary label, falling back to a short id when none is saved", async ({
    page,
  }) => {
    await openSessionsTab(page);

    // e2e-session-main has a saved label - shown as-is, in both the table
    // row and (once its row is clicked, opening the session page) the
    // drilldown header, instead of any id.
    const mainRow = page.getByTestId("session-row-e2e-session-main");
    await expect(mainRow).toContainText(SESSION_MAIN_LABEL);
    await mainRow.click();
    await expect(page.getByTestId("session-drilldown")).toContainText(SESSION_MAIN_LABEL);

    // e2e-session-other has no saved label - falls back to its short id in
    // both places instead.
    await page.getByTestId("back-to-sessions").click();
    const otherRow = page.getByTestId("session-row-e2e-session-other");
    await expect(otherRow).toContainText(shortId("e2e-session-other"));

    await otherRow.click();
    await expect(page.getByTestId("session-drilldown")).toContainText(shortId("e2e-session-other"));
  });

  test("sessions table defaults to the last-30-days range and switches to all time", async ({ page }) => {
    let lastRangeParam: string | null = null;
    await page.route("**/api/rollup/session**", (route) => {
      lastRangeParam = new URL(route.request().url()).searchParams.get("range");
      route.continue();
    });

    await page.goto("/");
    await expect(page.getByTestId("dashboard")).toBeVisible();
    await expect.poll(() => lastRangeParam).toBe("30d");

    await openSessionsTab(page);
    await expect(page.getByTestId("sessions-range-30d")).toHaveClass(/bg-\(--accent\)/);

    await page.getByTestId("sessions-range-life").click();
    await expect.poll(() => lastRangeParam).toBe("life");
    await expect(page.getByTestId("sessions-range-life")).toHaveClass(/bg-\(--accent\)/);
  });

  test("sessions table sits in a bounded, scrollable container", async ({ page }) => {
    await openSessionsTab(page);
    const table = page.getByTestId("sessions-table");
    const overflowY = await table.evaluate((el) => getComputedStyle(el.parentElement as Element).overflowY);
    expect(overflowY).toBe("auto");
  });

  test("shows the usage-limit warning banner for the flagged session", async ({ page }) => {
    const banner = page.getByTestId("usage-limit-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("e2e-session-main");
    await page.getByTestId("usage-limit-view-session").click();
    // Clicking "view session" from the Dashboard tab lands directly on the
    // session's own full-page drilldown, addressed by URL. The header shows
    // e2e-session-main's saved label rather than its raw id.
    await expect(page.getByTestId("session-drilldown")).toBeVisible();
    await expect(page.getByTestId("session-drilldown")).toContainText(SESSION_MAIN_LABEL);
    expect(new URL(page.url()).pathname).toBe("/sessions/e2e-session-main");
  });

  test("meter row shows today/cost/7d totals matching the seeded timeseries data", async ({ page }) => {
    // Read the same endpoint the meter row's two new useTimeseries calls
    // hit, independently of the app's own in-flight request, rather than
    // hand-computing the seeded fixture's token/cost totals (fragile
    // against pricing/rounding). Responses are enveloped as { data, meta }
    // (client.ts's apiGet unwraps this at runtime).
    const today = (await (await page.request.get("/api/rollup/timeseries?range=today")).json()).data;
    const sevenDay = (await (await page.request.get("/api/rollup/timeseries?range=7d")).json()).data;

    // Seeded fixture puts every call in the last 2 hours, so "today" is
    // non-zero; the older second session (2 days back) only shows up once
    // the range widens to 7d.
    expect(today.total_tokens).toBeGreaterThan(0);

    await expect(page.getByTestId("meter-tokens-today")).toContainText(formatTokens(today.total_tokens));
    await expect(page.getByTestId("meter-cost-today")).toContainText(formatCost(today.total_cost));
    await expect(page.getByTestId("meter-tokens-7d")).toContainText(formatTokens(sevenDay.total_tokens));
  });

  test("tokens/day range tabs swap chart shape", async ({ page }) => {
    // Default range is 7d - daily click-through bars.
    await expect(page.getByTestId("chart-daily-click")).toBeVisible();
    // Hovering a bar reveals the recharts-native hover tooltip.
    const firstBar = page.locator('[data-testid^="day-bar-"]').first();
    await firstBar.hover();
    await expect(page.getByTestId("chart-tooltip")).toBeVisible();

    await page.getByTestId("range-tabs-today").click();
    await expect(page.getByTestId("chart-hourly")).toBeVisible();

    await page.getByTestId("range-tabs-30d").click();
    await expect(page.getByTestId("chart-sparkline")).toBeVisible();

    await page.getByTestId("range-tabs-7d").click();
    await expect(page.getByTestId("chart-daily-click")).toBeVisible();
  });

  test("7d day-detail panel shows seeded and empty days", async ({ page }) => {
    // Most-recent bucket (today, seeded) is auto-selected.
    const panel = page.getByTestId("day-detail-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("day-detail-model-row").first()).toBeVisible();

    // At least one of the other 6 daily bars has zero calls - clicking it
    // switches the detail panel to the empty state.
    const dayBars = page.locator('[data-testid^="day-bar-"]');
    const count = await dayBars.count();
    let sawEmptyDay = false;
    for (let i = 0; i < count; i++) {
      await dayBars.nth(i).click();
      if (await page.getByTestId("day-detail-empty").isVisible()) {
        sawEmptyDay = true;
        break;
      }
    }
    expect(sawEmptyDay).toBe(true);
  });

  test("drilldown shows a global_position-ordered chat-thread merging every agent's calls", async ({ page }) => {
    await openSessionDrilldown(page, "e2e-session-main");

    // e2e-session-main's calls in chronological (global_position) order:
    // main (#1, global 1), builder (#1, global 2 - unavailable transcript),
    // builder (#2, global 3), reviewer (#1, global 4), cairn:planner (#1,
    // global 5) - the thread merges every agent's calls into one sequence.
    const thread = page.getByTestId("chat-thread");
    await expect(thread).toBeVisible();
    for (const globalPosition of [1, 2, 3, 4, 5]) {
      await expect(page.getByTestId(`chat-turn-e2e-session-main-${globalPosition}`)).toBeVisible();
    }

    // DOM order follows global_position, not agent grouping.
    const turnAgents = await thread.locator("[data-testid^='chat-turn-']").evaluateAll((nodes) =>
      nodes.map((n) => n.querySelector("[data-testid='call-agent-name']")?.textContent),
    );
    expect(turnAgents).toEqual(["main", "builder", "builder", "reviewer", "cairn:planner"]);
  });

  test("drilldown renders inline tool-action lines, with no dangling response bubble for a pure tool-use call", async ({
    page,
  }) => {
    await openSessionDrilldown(page, "e2e-session-main");

    // main's turn (global_position 1, fixtures/seed.py's AVAILABLE_REQUEST_ID)
    // has a transcript-available Read tool_use plus a text reply - "Read"
    // must render bare (not "Edited", which only Write/Edit map to) with its
    // file_path summary appended, and the turn's own text reply still shows.
    const mainTurn = page.getByTestId("chat-turn-e2e-session-main-1");
    await expect(mainTurn).toContainText("Read src/login.py");
    await expect(mainTurn.getByTestId("chat-bubble-response")).toBeVisible();

    // builder's second turn (global_position 3, fixtures/seed.py's
    // PURE_TOOL_USE_REQUEST_ID) has a transcript-available tool_use block
    // and no text block at all - its tool-action line still renders, but no
    // empty/dangling response bubble ever appears in its place (Goal 5).
    const pureToolUseTurn = page.getByTestId("chat-turn-e2e-session-main-3");
    await expect(pureToolUseTurn).toContainText("Ran npm test");
    await expect(pureToolUseTurn.getByTestId("chat-bubble-response")).toHaveCount(0);
  });

  test("drilldown renders an unpriced call's cost as 'unknown' without crashing", async ({ page }) => {
    // e2e-session-other's one call is on "claude-haiku-4.5", which isn't a
    // key in prices.json (only "claude-haiku-4-5-20251001" is priced) - so
    // pricing.call_cost returns the string "unknown", not a number, for
    // this call. formatCost must handle that sentinel without crashing
    // (regression test for the `e.toFixed is not a function` bug).
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await openSessionDrilldown(page, "e2e-session-other");

    const drilldown = page.getByTestId("session-drilldown");
    await expect(drilldown).toBeVisible();
    // e2e-session-other has no saved label, so its header falls back to a
    // short id rather than the raw session_id.
    await expect(drilldown).toContainText(shortId("e2e-session-other"));

    // e2e-session-other has one call, one agent ("main"), global_position 1.
    const turn = page.getByTestId("chat-turn-e2e-session-other-1");
    await expect(turn).toBeVisible();
    await expect(turn).toContainText("unknown");

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("drilldown calls out the token-dominant agent and shows a non-duplicate summary", async ({ page }) => {
    await openSessionDrilldown(page, "e2e-session-main");
    const drilldown = page.getByTestId("session-drilldown");

    // Every agent's stats row is visible by default (no accordion) -
    // builder has the most tokens across e2e-session-main's calls.
    await expect(page.getByTestId("agent-row-main")).toBeVisible();
    await expect(page.getByTestId("agent-row-builder")).toBeVisible();
    await expect(page.getByTestId("agent-row-reviewer")).toBeVisible();

    // The stacked share bar renders one segment per agent, above the legend.
    await expect(page.getByTestId("agent-share-segment-main")).toBeVisible();
    await expect(page.getByTestId("agent-share-segment-builder")).toBeVisible();

    await expect(drilldown).toContainText("runtime");
    await expect(drilldown).toContainText("builder dominant");
    // The redundant started/agents-count/tokens/cost summary (already shown
    // in the sessions table row) is gone from the header.
    await expect(drilldown).not.toContainText("agents ·");
  });

  test("checking an agent dims other agents' chat-thread turns, in place", async ({ page }) => {
    await openSessionDrilldown(page, "e2e-session-main");

    const mainTurn = page.getByTestId("chat-turn-e2e-session-main-1"); // main's only call
    const builderTurn = page.getByTestId("chat-turn-e2e-session-main-2"); // builder's first call

    // Nothing selected - every turn renders at full opacity.
    await expect(mainTurn).toHaveCSS("opacity", "1");
    await expect(builderTurn).toHaveCSS("opacity", "1");
    await expect(page.getByTestId("agent-select-main")).toHaveAttribute("aria-pressed", "false");

    // Selecting "main" dims (not removes) every other agent's turns, in place.
    await page.getByTestId("agent-row-main").click();
    await expect(page.getByTestId("agent-select-main")).toHaveAttribute("aria-pressed", "true");
    await expect(mainTurn).toHaveCSS("opacity", "1");
    await expect(builderTurn).toHaveCSS("opacity", "0.32");
    await expect(builderTurn).toBeVisible();

    // Checking a second agent ("builder" too) un-dims its own turns again.
    await page.getByTestId("agent-row-builder").click();
    await expect(builderTurn).toHaveCSS("opacity", "1");

    // Unchecking both restores the default all-visible state.
    await page.getByTestId("agent-row-main").click();
    await page.getByTestId("agent-row-builder").click();
    await expect(mainTurn).toHaveCSS("opacity", "1");
    await expect(builderTurn).toHaveCSS("opacity", "1");
  });

  test("wraps a long subagent name's badge onto its own line, without overflowing the name column", async ({
    page,
  }) => {
    await openSessionDrilldown(page, "e2e-session-main");
    const row = page.getByTestId("agent-row-cairn:planner");
    await expect(row).toBeVisible();

    const nameBox = await row.getByText("cairn:planner").boundingBox();
    const badgeBox = await row.getByText("subagent").boundingBox();
    expect(nameBox).not.toBeNull();
    expect(badgeBox).not.toBeNull();

    // Wrapped onto its own line: the badge sits below the name, not beside
    // it on the same line.
    expect(badgeBox!.y).toBeGreaterThan(nameBox!.y);
    // Neither element spills past the flexible name column into the
    // calls/tokens/cost meta trio beside it.
    const meta = row.getByTestId("agent-row-meta-cairn:planner");
    const metaBox = await meta.boundingBox();
    expect(metaBox).not.toBeNull();
    expect(nameBox!.x + nameBox!.width).toBeLessThanOrEqual(metaBox!.x);
    expect(badgeBox!.x + badgeBox!.width).toBeLessThanOrEqual(metaBox!.x);
  });

  test("main row (no badge) renders unchanged", async ({ page }) => {
    await openSessionDrilldown(page, "e2e-session-main");
    const row = page.getByTestId("agent-row-main");
    await expect(row).toBeVisible();
    await expect(row.getByText("subagent")).toHaveCount(0);

    const nameBox = await row.getByText("main", { exact: true }).boundingBox();
    expect(nameBox).not.toBeNull();
    // A single-child flex wrapper with no badge lays out identically to a
    // plain span: exactly one line, no wrapping.
    expect(nameBox!.height).toBeLessThan(20);
  });

  test("tool-rollup panel caps at maxRows with a '+N more' indicator when over-cap", async ({ page }) => {
    const panel = page.getByTestId("tool-rollup");
    await expect(panel).toBeVisible();

    const rowCount = await panel.locator(":scope > div").count();
    expect(rowCount).toBe(8);

    const more = page.getByTestId("tool-rollup-more");
    await expect(more).toBeVisible();
    // 20 seeded distinct plain tool names (Bash, Read + 18 extras) - 8 visible = 12 hidden.
    await expect(more).toHaveText("+12 more");
  });

  test("skill-rollup panel (under cap) shows no '+N more' indicator", async ({ page }) => {
    const panel = page.getByTestId("skill-rollup");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("commit-msg-lint");
    await expect(page.getByTestId("skill-rollup-more")).toHaveCount(0);
  });

});
