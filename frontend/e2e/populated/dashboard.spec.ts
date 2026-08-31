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

  test("opens the trace drawer with an available transcript", async ({ page }) => {
    await page.getByTestId("agent-row-toggle-main").click();
    await page.getByTestId("trace-toggle-e2e-session-main-1").click();

    const drawer = page.getByTestId("trace-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId("transcript-available")).toBeVisible();
    await expect(drawer.getByTestId("trace-detail-prompt")).toContainText("Add a login page to the app.");
    await expect(drawer.getByTestId("trace-detail-response")).toContainText("Sure — adding a login page now.");
  });

  test("opens the trace drawer with an unavailable transcript for a call with no transcript entry", async ({
    page,
  }) => {
    await page.getByTestId("agent-row-toggle-builder").click();
    await page.getByTestId("trace-toggle-e2e-session-main-1").click();

    const drawer = page.getByTestId("trace-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId("transcript-unavailable")).toBeVisible();
    await expect(drawer.getByTestId("transcript-unavailable")).toContainText("Transcript unavailable");
  });

  test("drawer's full-page link navigates to the standalone call page, in-app", async ({ page }) => {
    await page.getByTestId("agent-row-toggle-main").click();
    await page.getByTestId("trace-toggle-e2e-session-main-1").click();
    await page.getByTestId("trace-drawer-fullpage-link").click();

    await expect(page.getByTestId("call-page")).toBeVisible();
    await expect(page).toHaveURL(/\/call\/e2e-session-main\/1$/);
    await expect(page.getByTestId("transcript-available")).toBeVisible();
  });

  test("drawer closes via its backdrop", async ({ page }) => {
    await page.getByTestId("agent-row-toggle-main").click();
    await page.getByTestId("trace-toggle-e2e-session-main-1").click();
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
