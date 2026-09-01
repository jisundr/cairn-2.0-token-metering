## Gates
- `pytest test_*.py` clean before any commit
- Frontend: `npm run build` inside `frontend/` regenerates `static/` — commit the rebuilt `static/`, never hand-edit it
- Frontend: `npx playwright test` inside `frontend/` (against the build above) clean before any commit
- One artifact per commit

## Testing
- Python: `tmp_path`-based fixtures, one `test_*.py` per module, no shared test database
- Frontend: `frontend/e2e/` (Playwright) against two `server.py` instances started by `playwright.config.ts` — "populated" (seeded by `e2e/fixtures/seed.py` via `db.py`'s insert helpers, plus one fixture transcript under a scratch `HOME` so exactly one call resolves an available transcript) and "cold-start" (an empty, never-seeded project root). Both serve the same built `static/`, so `npm run build` must precede `playwright test`. The 15s poll's actual refresh-without-reload behavior is manual-only — confirm via `cairn:run` against a live session, not part of this suite or its gate.
