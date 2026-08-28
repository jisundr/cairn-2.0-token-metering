## Stack
- Python 3.11+ — stdlib only (`sqlite3`, `http.server`), no runtime pip deps
- Frontend: React 19 + Vite + Recharts + Tailwind + shadcn/ui + `@tanstack/react-query`, dev-only — Node/npm never required by a consumer, only by maintainers building `static/`

## Layering
- `db.py` — schema + insert helpers, no parsing logic
- `parser.py` — transcript walker, writes via `db.py` only
- `pricing.py` + `prices.json` — read-time cost lookup, no write path
- `server.py` — stdlib HTTP server + JSON API over `db.py`'s tables, binds `localhost` only
- `frontend/` — dev source; `static/` — compiled output, the only frontend artifact that ships

## Boundaries
- No cairn-specific coupling: every module takes explicit paths/args from its caller (a `cairn_dir`, a `transcript_path`) rather than assuming cairn's own layout
- `server.py` never writes to `tokens.db` — capture and serving are separate call paths

## Data
- SQLite file, path supplied by the caller — this repo makes no assumption about where it lives on disk
- No remote/shared datastore; no data leaves the machine
