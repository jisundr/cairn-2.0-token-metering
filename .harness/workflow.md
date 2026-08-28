## Gates
- `pytest test_*.py` clean before any commit
- Frontend: `npm run build` inside `frontend/` regenerates `static/` — commit the rebuilt `static/`, never hand-edit it
- One artifact per commit

## Testing
- Python: `tmp_path`-based fixtures, one `test_*.py` per module, no shared test database
- Frontend: no automated tests — manual check against the parent repo's approved mockup states
