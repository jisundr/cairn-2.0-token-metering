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

  test("formatTimeOfDay on the standalone call page", async ({ page }) => {
    // 2026-06-15T13:45:30Z is during EDT (UTC-4): local 09:45:30.
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
          },
          meta: { generated_at: "2026-06-15T13:46:00Z" },
        },
      }),
    );

    await page.goto("/call/tz-demo/1");

    await expect(page.getByTestId("call-page")).toContainText("09:45:30");
    await expect(page.getByTestId("call-page")).not.toContainText("13:45:30");
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

test.describe("activity heatmap buckets by local day-of-week/hour, not UTC", () => {
  test.use({ timezoneId: "America/New_York" });

  test("a DST spring-forward transition buckets each side into the correct local hour", async ({ page }) => {
    // 2024-03-10: US spring-forward. At 07:00 UTC, EST (UTC-5) becomes EDT
    // (UTC-4) - local 2am never occurs that day. A UTC-bucket-shift
    // approach can't get this right without knowing the DST rule itself;
    // a real per-row Date does, for free.
    await mockHeatmap(page, [
      { timestamp: "2024-03-10T06:59:00Z", tokens: 500 }, // 01:59 EST
      { timestamp: "2024-03-10T07:01:00Z", tokens: 700 }, // 03:01 EDT
    ]);

    await page.goto("/");
    await expect(page.getByTestId("activity-heatmap")).toBeVisible();

    await expect(page.getByTestId("heatmap-cell-6-1")).toHaveAttribute("title", "Sun 1:00 — 1 calls");
    await expect(page.getByTestId("heatmap-cell-6-2")).not.toHaveAttribute("title");
    await expect(page.getByTestId("heatmap-cell-6-3")).toHaveAttribute("title", "Sun 3:00 — 1 calls");
  });

  test("a DST fall-back transition buckets both sides of the repeated hour together", async ({ page }) => {
    // 2024-11-03: US fall-back. Local 1:00-1:59am occurs twice (as EDT,
    // then again as EST) - two calls an hour apart in UTC both land in the
    // same local hour=1 bucket.
    await mockHeatmap(page, [
      { timestamp: "2024-11-03T05:30:00Z", tokens: 300 }, // 01:30 EDT
      { timestamp: "2024-11-03T06:30:00Z", tokens: 400 }, // 01:30 EST
    ]);

    await page.goto("/");
    await expect(page.getByTestId("heatmap-cell-6-1")).toHaveAttribute("title", "Sun 1:00 — 2 calls");
  });
});

test.describe("activity heatmap buckets by local calendar day, not UTC", () => {
  test.use({ timezoneId: "Pacific/Honolulu" }); // fixed UTC-10, no DST.

  test("a call crosses the local calendar-day boundary relative to its UTC day", async ({ page }) => {
    // 2026-01-05T05:00:00Z is Monday in UTC, but Sunday 19:00 in Honolulu.
    await mockHeatmap(page, [{ timestamp: "2026-01-05T05:00:00Z", tokens: 250 }]);

    await page.goto("/");

    await expect(page.getByTestId("heatmap-cell-6-19")).toHaveAttribute("title", "Sun 19:00 — 1 calls");
    // The naive UTC-day cell (Mon 05:00) must stay empty - proves bucketing
    // used the local day, not the UTC one.
    await expect(page.getByTestId("heatmap-cell-0-5")).not.toHaveAttribute("title");
  });
});
