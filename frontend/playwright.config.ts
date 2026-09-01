import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

// Two independent server.py instances back this suite (plan.md's
// Actionable 5): "populated" is seeded via fixtures/seed.py (a project
// with calls/tool-uses/usage-limit events plus one on-demand transcript,
// under a scratch HOME so server.py's import-time
// `DEFAULT_CLAUDE_PROJECTS_DIR` resolution — computed once from
// `Path.home()` — redirects per-process); "cold-start" points at an
// empty, never-seeded project root so the dashboard renders its
// no-data/empty-state view. Both instances serve the same built
// `token-metering/static/` bundle (server.py's `static_dir` default),
// so `npm run build` must run before `playwright test`.
const FRONTEND_ROOT = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_METERING_ROOT = path.resolve(FRONTEND_ROOT, "..");
const SCRATCH_ROOT = path.resolve(FRONTEND_ROOT, ".e2e-scratch");
const POPULATED_SCRATCH = path.join(SCRATCH_ROOT, "populated");
const COLD_START_SCRATCH = path.join(SCRATCH_ROOT, "cold-start");
const COLD_START_ROOT = path.join(COLD_START_SCRATCH, "project");

const POPULATED_PORT = 4318;
const COLD_START_PORT = 4319;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "populated",
      testDir: "./e2e/populated",
      use: { ...devices["Desktop Chrome"], baseURL: `http://127.0.0.1:${POPULATED_PORT}` },
    },
    {
      name: "cold-start",
      testDir: "./e2e/cold-start",
      use: { ...devices["Desktop Chrome"], baseURL: `http://127.0.0.1:${COLD_START_PORT}` },
    },
  ],
  webServer: [
    {
      command: `python3 e2e/fixtures/seed.py "${POPULATED_SCRATCH}" && python3 "${TOKEN_METERING_ROOT}/server.py" "${POPULATED_SCRATCH}/project" ${POPULATED_PORT}`,
      url: `http://127.0.0.1:${POPULATED_PORT}/api/projects`,
      cwd: FRONTEND_ROOT,
      env: { HOME: POPULATED_SCRATCH },
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: `python3 "${TOKEN_METERING_ROOT}/server.py" "${COLD_START_ROOT}" ${COLD_START_PORT}`,
      url: `http://127.0.0.1:${COLD_START_PORT}/api/projects`,
      cwd: FRONTEND_ROOT,
      // Overridden too (not left pointing at the real machine's HOME) so
      // `DEFAULT_KNOWN_PROJECTS_PATH`/`DEFAULT_CLAUDE_PROJECTS_DIR` (both
      // computed once from `Path.home()` at import time) can't pick up
      // stray real projects and break the hermetic empty-state fixture.
      env: { HOME: COLD_START_SCRATCH },
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
