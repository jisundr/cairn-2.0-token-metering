#!/usr/bin/env python3
"""Seeds the Playwright "populated" webServer's fixture project: a
`.cairn/tokens.db` (via db.py's insert helpers, mirroring test_server.py's
`make_project` fixture pattern) plus one transcript `.jsonl` under a
scratch HOME so server.py's on-demand transcript lookup resolves
"available" for exactly one call and "unavailable" for every other
(plan.md's Actionable 5). Timestamps are relative to the run's current
time, not hardcoded, since server.py's range windows are wall-clock-
relative.

Usage: python3 seed.py <scratch_dir>
`<scratch_dir>/project` becomes the project root passed to server.py;
`<scratch_dir>` is also this webServer's HOME env override, so
`Path.home() / ".claude" / "projects"` resolves under it.
"""
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

TOKEN_METERING_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(TOKEN_METERING_ROOT))
import db  # noqa: E402
import server  # noqa: E402

SESSION_MAIN = "e2e-session-main"
SESSION_OTHER = "e2e-session-other"
AVAILABLE_REQUEST_ID = "req-available-1"
UNAVAILABLE_REQUEST_ID = "req-unavailable-2"


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def seed_db(project_root: Path, now: datetime) -> None:
    conn = db.connect(project_root / ".cairn")

    calls = [
        dict(
            request_id=AVAILABLE_REQUEST_ID,
            session_id=SESSION_MAIN,
            agent="main",
            model="claude-sonnet-5",
            timestamp=iso(now - timedelta(hours=2)),
            input_tokens=1200,
            output_tokens=600,
        ),
        dict(
            request_id=UNAVAILABLE_REQUEST_ID,
            session_id=SESSION_MAIN,
            agent="builder",
            model="claude-sonnet-5",
            timestamp=iso(now - timedelta(hours=1, minutes=50)),
            input_tokens=800,
            output_tokens=1400,
            cache_read_tokens=200,
        ),
        dict(
            request_id="req-3",
            session_id=SESSION_MAIN,
            agent="builder",
            model="claude-opus-5",
            timestamp=iso(now - timedelta(hours=1, minutes=40)),
            input_tokens=500,
            output_tokens=900,
        ),
        dict(
            request_id="req-4",
            session_id=SESSION_MAIN,
            agent="reviewer",
            model="claude-sonnet-5",
            timestamp=iso(now - timedelta(hours=1, minutes=20)),
            input_tokens=400,
            output_tokens=300,
        ),
        dict(
            request_id="req-5",
            session_id=SESSION_OTHER,
            agent="main",
            model="claude-haiku-4.5",
            timestamp=iso(now - timedelta(days=2, hours=3)),
            input_tokens=300,
            output_tokens=150,
        ),
    ]
    for call in calls:
        db.insert_call(conn, **call)

    tool_uses = [
        dict(
            tool_use_id="tu-1",
            request_id=UNAVAILABLE_REQUEST_ID,
            session_id=SESSION_MAIN,
            agent="builder",
            tool_name="Bash",
            timestamp=iso(now - timedelta(hours=1, minutes=50)),
        ),
        dict(
            tool_use_id="tu-2",
            request_id=UNAVAILABLE_REQUEST_ID,
            session_id=SESSION_MAIN,
            agent="builder",
            tool_name="Read",
            timestamp=iso(now - timedelta(hours=1, minutes=49)),
        ),
        dict(
            tool_use_id="tu-3",
            request_id="req-3",
            session_id=SESSION_MAIN,
            agent="builder",
            tool_name="Skill",
            detail="commit-msg-lint",
            timestamp=iso(now - timedelta(hours=1, minutes=39)),
        ),
        dict(
            tool_use_id="tu-4",
            request_id="req-4",
            session_id=SESSION_MAIN,
            agent="reviewer",
            tool_name="mcp__context7__get-library-docs",
            timestamp=iso(now - timedelta(hours=1, minutes=19)),
        ),
    ]
    for tool_use in tool_uses:
        db.insert_tool_use(conn, **tool_use)

    db.insert_usage_limit_event(
        conn,
        session_id=SESSION_MAIN,
        timestamp=iso(now - timedelta(hours=1, minutes=45)),
        raw_entry=json.dumps({"isApiErrorMessage": True}),
    )
    conn.commit()
    conn.close()


def seed_transcript(scratch: Path, project_root: Path) -> None:
    claude_projects_dir = scratch / ".claude" / "projects"
    transcript_path = server.transcript_path_for(claude_projects_dir, project_root, SESSION_MAIN)
    transcript_path.parent.mkdir(parents=True, exist_ok=True)

    # The preceding entry (no requestId) is the real prompt; the entry
    # carrying `requestId` is the API call itself - server.py's
    # `_extract_call_content` walks backward from the first entry sharing
    # `requestId` to find it. `UNAVAILABLE_REQUEST_ID` has no entry here at
    # all, so it naturally resolves "unavailable".
    entries = [
        {"message": {"role": "user", "content": "Add a login page to the app."}},
        {
            "requestId": AVAILABLE_REQUEST_ID,
            "message": {
                "role": "assistant",
                "content": [{"type": "text", "text": "Sure — adding a login page now."}],
            },
        },
    ]
    with transcript_path.open("w") as f:
        for entry in entries:
            f.write(json.dumps(entry) + "\n")


def main() -> None:
    scratch = Path(sys.argv[1]).resolve()
    project_root = scratch / "project"
    project_root.mkdir(parents=True, exist_ok=True)

    now = datetime.now(timezone.utc)
    seed_db(project_root, now)
    seed_transcript(scratch, project_root)
    print(project_root)


if __name__ == "__main__":
    main()
