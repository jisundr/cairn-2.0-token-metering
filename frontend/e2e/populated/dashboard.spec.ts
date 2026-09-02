import { expect, test } from "@playwright/test";

// Against the "populated" webServer (fixtures/seed.py): a project with
// calls/tool-uses/a usage-limit event across three agents on one session,
// plus one older call on a second session (plan.md's Actionable 5).

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
  });

  test("lists both seeded sessions", async ({ page }) => {
    await expect(page.getByTestId("session-row-e2e-session-main")).toBeVisible();
    await expect(page.getByTestId("session-row-e2e-session-other")).toBeVisible();
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
    await expect(page.getByTestId("sessions-range-30d")).toHaveClass(/border-\(--blue\)/);

    await page.getByTestId("sessions-range-life").click();
    await expect.poll(() => lastRangeParam).toBe("life");
    await expect(page.getByTestId("sessions-range-life")).toHaveClass(/border-\(--blue\)/);
  });

  test("sessions table sits in a bounded, scrollable container", async ({ page }) => {
    const table = page.getByTestId("sessions-table");
    const overflowY = await table.evaluate((el) => getComputedStyle(el.parentElement as Element).overflowY);
    expect(overflowY).toBe("auto");
  });

  test("shows the usage-limit warning banner for the flagged session", async ({ page }) => {
    const banner = page.getByTestId("usage-limit-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("e2e-session-main");
    await page.getByTestId("usage-limit-view-session").click();
    await expect(page.getByTestId("session-drilldown")).toContainText("e2e-session-main");
  });

  test("tokens/day range tabs swap chart shape", async ({ page }) => {
    // Default range is 7d - daily click-through bars.
    await expect(page.getByTestId("chart-daily-click")).toBeVisible();

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

  test("expands an agent row and shows its call trace", async ({ page }) => {
    await page.getByTestId("agent-row-toggle-main").click();
    const trace = page.getByTestId("agent-trace-main");
    await expect(trace).toBeVisible();
    await expect(trace.getByTestId("trace-row-e2e-session-main-1")).toBeVisible();
  });

  test("drilldown auto-expands the token-dominant agent and shows a non-duplicate summary", async ({ page }) => {
    const drilldown = page.getByTestId("session-drilldown");
    await expect(drilldown).toBeVisible();

    // builder has the most tokens across e2e-session-main's calls, so its
    // row is expanded without any click; main (fewer tokens) stays closed.
    await expect(page.getByTestId("agent-trace-builder")).toBeVisible();
    await expect(page.getByTestId("agent-trace-main")).toHaveCount(0);

    await expect(drilldown).toContainText("runtime");
    await expect(drilldown).toContainText("builder dominant");
    // The redundant started/agents-count/tokens/cost summary (already shown
    // in the sessions table row) is gone from the header.
    await expect(drilldown).not.toContainText("agents ·");
  });

  test("opens the trace drawer with an available transcript", async ({ page }) => {
    await page.getByTestId("agent-row-toggle-main").click();
    // builder is also auto-expanded by default (most tokens) and has its
    // own per-agent position 1, so scope to main's own trace table.
    await page.getByTestId("agent-trace-main").getByTestId("trace-toggle-e2e-session-main-1").click();

    const drawer = page.getByTestId("trace-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId("transcript-available")).toBeVisible();
    await expect(drawer.getByTestId("trace-detail-prompt")).toContainText("Add a login page to the app.");
    await expect(drawer.getByTestId("trace-detail-response")).toContainText("Sure — adding a login page now.");
  });

  test("wraps a long subagent name's badge onto its own line, without overflowing the name column", async ({
    page,
  }) => {
    const row = page.getByTestId("agent-row-cairn:planner");
    await expect(row).toBeVisible();

    const nameBox = await row.getByText("cairn:planner").boundingBox();
    const badgeBox = await row.getByText("subagent").boundingBox();
    expect(nameBox).not.toBeNull();
    expect(badgeBox).not.toBeNull();

    // Wrapped onto its own line: the badge sits below the name, not beside
    // it on the same line.
    expect(badgeBox!.y).toBeGreaterThan(nameBox!.y);
    // Neither element spills past the shared 110px name column into the
    // token-bar column beside it.
    const bar = page.getByTestId("agent-row-toggle-cairn:planner").locator("> div");
    const barBox = await bar.boundingBox();
    expect(barBox).not.toBeNull();
    expect(nameBox!.x + nameBox!.width).toBeLessThanOrEqual(barBox!.x);
    expect(badgeBox!.x + badgeBox!.width).toBeLessThanOrEqual(barBox!.x);
  });

  test("main row (no badge) renders unchanged", async ({ page }) => {
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

  test("opens the trace drawer with an unavailable transcript for a call with no transcript entry", async ({
    page,
  }) => {
    // builder has the most tokens in this session, so its row is
    // auto-expanded by default (SessionDrilldown.tsx) - no toggle click needed.
    await expect(page.getByTestId("agent-trace-builder")).toBeVisible();
    await page.getByTestId("trace-toggle-e2e-session-main-1").click();

    const drawer = page.getByTestId("trace-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId("transcript-unavailable")).toBeVisible();
    await expect(drawer.getByTestId("transcript-unavailable")).toContainText("Transcript unavailable");
  });

  test("drawer's full-page link navigates to the standalone call page, in-app", async ({ page }) => {
    await page.getByTestId("agent-row-toggle-main").click();
    await page.getByTestId("agent-trace-main").getByTestId("trace-toggle-e2e-session-main-1").click();
    await page.getByTestId("trace-drawer-fullpage-link").click();

    await expect(page.getByTestId("call-page")).toBeVisible();
    await expect(page).toHaveURL(/\/call\/e2e-session-main\/1$/);
    await expect(page.getByTestId("transcript-available")).toBeVisible();
  });

  test("drawer closes via its backdrop", async ({ page }) => {
    await page.getByTestId("agent-row-toggle-main").click();
    await page.getByTestId("agent-trace-main").getByTestId("trace-toggle-e2e-session-main-1").click();
    await expect(page.getByTestId("trace-drawer")).toBeVisible();

    await page.getByTestId("trace-drawer-backdrop").click();
    await expect(page.getByTestId("trace-drawer")).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("call detail deep link", () => {
  test("direct load of /call/<session>/<n> renders the standalone page, not the drawer", async ({ page }) => {
    await page.goto("/call/e2e-session-main/1");

    await expect(page.getByTestId("call-page")).toBeVisible();
    await expect(page.getByTestId("trace-drawer")).toHaveCount(0);
    await expect(page.getByTestId("transcript-available")).toBeVisible();

    await page.getByTestId("call-page-back").click();
    await expect(page.getByTestId("dashboard")).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("direct load of a call with no transcript entry shows unavailable, standalone", async ({ page }) => {
    // Global position 2 in e2e-session-main is UNAVAILABLE_REQUEST_ID
    // (builder's first call, chronologically second overall).
    await page.goto("/call/e2e-session-main/2");

    await expect(page.getByTestId("call-page")).toBeVisible();
    await expect(page.getByTestId("transcript-unavailable")).toBeVisible();
  });
});
