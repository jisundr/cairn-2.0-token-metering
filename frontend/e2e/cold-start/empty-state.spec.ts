import { expect, test } from "@playwright/test";

// Against the "cold-start" webServer: a project root with no `.cairn/
// tokens.db` at all (03-architecture.md's Cold-start / empty tokens.db).

test("shows the cold-start empty state instead of rollup panels", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("dashboard")).toBeVisible();
  await expect(page.getByTestId("empty-state")).toBeVisible();
  await expect(page.getByTestId("empty-state")).toContainText("No sessions captured yet");

  await expect(page.getByTestId("sessions-table")).toHaveCount(0);
  await expect(page.getByTestId("usage-limit-banner")).toHaveCount(0);
});
