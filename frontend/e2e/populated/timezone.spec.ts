import { expect, test } from "@playwright/test";

// Against the "populated" webServer (fixtures/seed.py), but each test here
// intercepts the specific /api/* route it exercises with a fixed response -
// 05-utc-time-localization.md's assertions need a *known* UTC instant (to
// hand-compute the expected local string) and, for the heatmap, a fixed
// 7-day-range payload that doesn't drift in or out of range depending on
// when the suite happens to run. Playwright's `timezoneId` context option
// (first use in this repo) fixes the browser's time zone per test.

test.describe("formatTimeOfDay/formatStarted render local time, not UTC", () => {
  test.use({ timezoneId: "America/New_York" });

  test("formatTimeOfDay in the drilldown's per-call metadata line", async ({ page }) => {
    // 2026-06-15T13:45:30Z is during EDT (UTC-4): local 09:45:30. Ported
    // from the removed standalone call page onto SessionDrilldown.tsx's
    // inline per-call metadata line, which now carries this formatting
    // instead (plan.md's Actionable 9).
    await page.route("**/api/rollup/session**", (route) =>
      route.fulfill({
        json: {
          data: [
            {
              session_id: "tz-demo",
              project: "proj",
              started: "2026-06-15T13:45:30Z",
              ended: "2026-06-15T13:45:30Z",
              agents: ["main"],
              calls: 1,
              tokens: 150,
              cost: 0.01,
              usage_limit_hit: false,
            },
          ],
          meta: { generated_at: "2026-06-15T13:46:00Z" },
        },
      }),
    );
    await page.route("**/api/session/tz-demo/trace**", (route) =>
      route.fulfill({
        json: {
          data: {
            session_id: "tz-demo",
            started: "2026-06-15T13:45:30Z",
            ended: "2026-06-15T13:45:30Z",
            agents: [
              {
                agent: "main",
                calls: 1,
                tokens: 150,
                cost: 0.01,
                trace: [
                  {
                    position: 1,
                    global_position: 1,
                    request_id: "r1",
                    timestamp: "2026-06-15T13:45:30Z",
                    model: "claude-sonnet-5",
                    input_tokens: 100,
                    output_tokens: 50,
                    cache_read_tokens: 0,
                    cache_write_5m_tokens: 0,
                    cache_write_1h_tokens: 0,
                    cost: 0.01,
                    duration_seconds: null,
                  },
                ],
              },
            ],
            label: "",
          },
          meta: { generated_at: "2026-06-15T13:46:00Z" },
        },
      }),
    );
    await page.route("**/api/call/tz-demo/1**", (route) =>
      route.fulfill({
        json: {
          data: {
            position: 1,
            total: 1,
            session_id: "tz-demo",
            project: "proj",
            agent: "main",
            request_id: "r1",
            timestamp: "2026-06-15T13:45:30Z",
            model: "claude-sonnet-5",
            input_tokens: 100,
            output_tokens: 50,
            cache_read_tokens: 0,
            cache_write_5m_tokens: 0,
            cache_write_1h_tokens: 0,
            cost: 0.01,
            available: false,
            prompt: null,
            response: null,
            tool_calls: [],
          },
          meta: { generated_at: "2026-06-15T13:46:00Z" },
        },
      }),
    );

    await page.goto("/");
    await page.getByTestId("app-tab-sessions").click();
    // The drilldown lives on its own page now (plan.md's Actionable 7) -
    // click the auto-selected session's row to open it.
    await page.getByTestId("session-row-tz-demo").click();

    const turn = page.getByTestId("chat-turn-tz-demo-1");
    await expect(turn).toContainText("09:45:30");
    await expect(turn).not.toContainText("13:45:30");
  });

  test("formatStarted on the sessions table", async ({ page }) => {
    // 2026-06-15T13:45:00Z is during EDT (UTC-4): local 09:45.
    await page.route("**/api/rollup/session**", (route) =>
      route.fulfill({
        json: {
          data: [
            {
              session_id: "tz-demo",
              project: "proj",
              started: "2026-06-15T13:45:00Z",
              ended: "2026-06-15T13:50:00Z",
              agents: ["main"],
              calls: 1,
              tokens: 100,
              cost: 0.01,
              usage_limit_hit: false,
            },
          ],
          meta: { generated_at: "2026-06-15T13:50:30Z" },
        },
      }),
    );

    await page.goto("/");
    // SessionsTable lives under the Sessions tab (dashboard-fixup plan.md's
    // Actionables 2-3); the app defaults to the Dashboard tab.
    await page.getByTestId("app-tab-sessions").click();

    const row = page.getByTestId("session-row-tz-demo");
    await expect(row).toContainText("06/15 09:45");
    await expect(row).not.toContainText("13:45");
  });
});

async function mockHeatmap(page: import("@playwright/test").Page, rows: { timestamp: string; tokens: number }[]) {
  await page.route("**/api/heatmap**", (route) =>
    route.fulfill({ json: { data: rows, meta: { generated_at: "2026-01-01T00:00:00Z" } } }),
  );
}

test.describe("activity heatmap buckets by local calendar day, not UTC", () => {
  test.use({ timezoneId: "America/New_York" });

  test("a DST spring-forward transition still buckets both calls into the same local day", async ({ page }) => {
    // 2024-03-10: US spring-forward. At 07:00 UTC, EST (UTC-5) becomes EDT
    // (UTC-4) - local 2am never occurs that day. The heatmap only buckets
    // by calendar day now (Actionable 3) - a real per-row Date's local
    // getters place both calls in the same March-10 cell regardless, no
    // manual DST-rule handling needed.
    await page.clock.setFixedTime(new Date("2024-03-10T12:00:00Z"));
    await mockHeatmap(page, [
      { timestamp: "2024-03-10T06:59:00Z", tokens: 500 }, // 01:59 EST
      { timestamp: "2024-03-10T07:01:00Z", tokens: 700 }, // 03:01 EDT
    ]);

    await page.goto("/");
    await expect(page.getByTestId("activity-heatmap")).toBeVisible();

    const tooltip = page.getByTestId("heatmap-tooltip-2024-03-10");
    await expect(tooltip).toContainText("03-10");
    await expect(tooltip).toContainText("2 calls");
    await expect(tooltip).toContainText("1.2k tokens");
  });

  test("a DST fall-back transition buckets both sides of the repeated local hour into one day", async ({ page }) => {
    // 2024-11-03: US fall-back. Local 1:00-1:59am occurs twice (as EDT,
    // then again as EST) - two calls an hour apart in UTC still land in
    // the same local calendar-day cell.
    await page.clock.setFixedTime(new Date("2024-11-03T12:00:00Z"));
    await mockHeatmap(page, [
      { timestamp: "2024-11-03T05:30:00Z", tokens: 300 }, // 01:30 EDT
      { timestamp: "2024-11-03T06:30:00Z", tokens: 400 }, // 01:30 EST
    ]);

    await page.goto("/");
    const tooltip = page.getByTestId("heatmap-tooltip-2024-11-03");
    await expect(tooltip).toContainText("2 calls");
    await expect(tooltip).toContainText("700 tokens");
  });
});

test.describe("activity heatmap buckets by local calendar day, not the UTC one", () => {
  test.use({ timezoneId: "Pacific/Honolulu" }); // fixed UTC-10, no DST.

  test("a call crosses the local calendar-day boundary relative to its UTC day", async ({ page }) => {
    // Frozen "now" is 2026-01-05T12:00:00Z - Monday in UTC, but still
    // 2026-01-05 02:00 in Honolulu (UTC-10), so "today" is the same local
    // date either way. The seeded call, 2026-01-05T05:00:00Z, is also
    // Monday in UTC but Sunday 19:00 in Honolulu - a different local date
    // from "today".
    await page.clock.setFixedTime(new Date("2026-01-05T12:00:00Z"));
    await mockHeatmap(page, [{ timestamp: "2026-01-05T05:00:00Z", tokens: 250 }]);

    await page.goto("/");

    const tooltip = page.getByTestId("heatmap-tooltip-2026-01-04");
    await expect(tooltip).toContainText("01-04");
    await expect(tooltip).toContainText("1 calls");
    await expect(tooltip).toContainText("250 tokens");
    // The naive UTC-day cell (2026-01-05) must stay empty - proves
    // bucketing used the local day, not the UTC one.
    await expect(page.getByTestId("heatmap-tooltip-2026-01-05")).toHaveCount(0);
  });
});
