import http.server
import json
import sys
import threading
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402
import server  # noqa: E402


def make_call(**overrides):
    call = dict(
        request_id="req-1",
        session_id="sess-1",
        agent="main",
        model="claude-sonnet-5",
        timestamp="2026-08-28T12:00:00Z",
        input_tokens=100,
        output_tokens=200,
        cache_read_tokens=0,
        cache_write_5m_tokens=0,
        cache_write_1h_tokens=0,
    )
    call.update(overrides)
    return call


def make_tool_use(**overrides):
    tool_use = dict(
        tool_use_id="toolu-1",
        request_id="req-1",
        session_id="sess-1",
        agent="main",
        tool_name="Bash",
        timestamp="2026-08-28T12:00:00Z",
        detail=None,
    )
    tool_use.update(overrides)
    return tool_use


def make_project(tmp_path, name="proj", calls=(), tool_uses=(), events=()):
    root = tmp_path / name
    root.mkdir()
    conn = db.connect(root / ".cairn")
    for c in calls:
        db.insert_call(conn, **c)
    for t in tool_uses:
        db.insert_tool_use(conn, **t)
    for e in events:
        db.insert_usage_limit_event(conn, **e)
    conn.commit()
    conn.close()
    return root


# --------------------------------------------------------------------------
# Range windows
# --------------------------------------------------------------------------


def test_resolve_range_day_counts():
    now = datetime(2026, 8, 28, 15, 30, tzinfo=timezone.utc)

    since, until, bucket = server.resolve_range("today", now=now)
    assert (since, until, bucket) == ("2026-08-28T00:00:00Z", "2026-08-28T15:30:00Z", "hour")

    since, until, bucket = server.resolve_range("7d", now=now)
    assert since == "2026-08-22T00:00:00Z"
    assert bucket == "day"

    since, _, _ = server.resolve_range("30d", now=now)
    assert since == "2026-07-30T00:00:00Z"

    since, _, _ = server.resolve_range("month", now=now)
    assert since == "2026-08-01T00:00:00Z"

    since, _, _ = server.resolve_range("6m", now=now)
    assert since == "2026-02-28T00:00:00Z"  # 182 days inclusive of today


def test_range_bounds_life_has_no_lower_bound():
    since, until = server.range_bounds("life", now=datetime(2026, 8, 28, tzinfo=timezone.utc))
    assert since is None
    assert until == "2026-08-28T00:00:00Z"


def test_fetch_calls_includes_subsecond_timestamps_at_the_lower_boundary(tmp_path):
    root = make_project(
        tmp_path, "proj",
        calls=[
            make_call(request_id="r1", timestamp="2026-08-28T00:00:00.500Z", input_tokens=1, output_tokens=0),
            make_call(request_id="r2", timestamp="2026-08-27T23:59:59.900Z", input_tokens=2, output_tokens=0),
        ],
    )
    app = server.TokenMeteringApp(root)
    projects = app.projects()

    rows = app._fetch_calls(projects, since="2026-08-28T00:00:00Z", until="2026-08-29T00:00:00Z")

    # r1 is a sub-second instant just *after* the lower bound - included.
    # r2 is a sub-second instant just *before* it (the prior day) - excluded.
    assert {r["request_id"] for r in rows} == {"r1"}


# --------------------------------------------------------------------------
# Rollup correctness: agent, model, tool/skill/mcp, day, heatmap
# --------------------------------------------------------------------------


def test_rollup_group_by_agent_sums_tokens_and_cost():
    rows = [
        make_call(request_id="r1", agent="main", input_tokens=1_000_000, output_tokens=0),
        make_call(request_id="r2", agent="builder", input_tokens=500_000, output_tokens=0),
        make_call(request_id="r3", agent="builder", input_tokens=500_000, output_tokens=0),
    ]
    grouped = {g["key"]: g for g in server.rollup_group(rows, key_fn=lambda r: r["agent"])}

    assert grouped["main"]["calls"] == 1
    assert grouped["main"]["tokens"] == 1_000_000
    assert grouped["main"]["cost"] == pytest.approx(2.00)
    assert grouped["builder"]["calls"] == 2
    assert grouped["builder"]["tokens"] == 1_000_000


def test_rollup_timeseries_zero_fills_and_buckets_by_day():
    rows = [
        make_call(request_id="r1", timestamp="2026-08-26T10:00:00Z", input_tokens=10, output_tokens=0),
        make_call(request_id="r2", timestamp="2026-08-26T18:00:00Z", input_tokens=20, output_tokens=0),
        make_call(request_id="r3", timestamp="2026-08-28T09:00:00Z", input_tokens=30, output_tokens=0),
    ]
    points = server.rollup_timeseries(rows, "2026-08-26T00:00:00Z", "2026-08-28T00:00:00Z", "day")
    by_bucket = {p["bucket"]: p for p in points}

    assert list(by_bucket) == ["2026-08-26", "2026-08-27", "2026-08-28"]
    assert by_bucket["2026-08-26"]["tokens"] == 30
    assert by_bucket["2026-08-26"]["calls"] == 2
    assert by_bucket["2026-08-27"]["tokens"] == 0
    assert by_bucket["2026-08-27"]["calls"] == 0
    assert by_bucket["2026-08-28"]["tokens"] == 30


def test_rollup_tool_group_separates_tool_skill_and_mcp_families():
    rows = [
        make_tool_use(tool_use_id="t1", tool_name="Bash"),
        make_tool_use(tool_use_id="t2", tool_name="Bash"),
        make_tool_use(tool_use_id="t3", tool_name="Skill", detail="review-pr"),
        make_tool_use(tool_use_id="t4", tool_name="Skill", detail="review-pr"),
        make_tool_use(tool_use_id="t5", tool_name="mcp__claude-in-chrome__navigate"),
    ]

    tools = {g["key"]: g["count"] for g in server.rollup_tool_group(rows, key_fn=server._tool_key)}
    skills = {g["key"]: g["count"] for g in server.rollup_tool_group(rows, key_fn=server._skill_key)}
    mcp = {g["key"]: g["count"] for g in server.rollup_tool_group(rows, key_fn=server._mcp_key)}

    assert tools == {"Bash": 2}
    assert skills == {"review-pr": 2}
    assert mcp == {"claude-in-chrome": 1}


def test_skill_key_buckets_unresolved_detail_instead_of_dropping_the_row():
    rows = [
        make_tool_use(tool_use_id="t1", tool_name="Skill", detail=None),
        make_tool_use(tool_use_id="t2", tool_name="Skill", detail="review-pr"),
    ]
    skills = {g["key"]: g["count"] for g in server.rollup_tool_group(rows, key_fn=server._skill_key)}
    assert skills == {"unknown": 1, "review-pr": 1}


def test_day_detail_accepts_an_unpadded_date_and_still_matches_zero_padded_rows(tmp_path):
    root = make_project(
        tmp_path, "proj",
        calls=[make_call(request_id="r1", timestamp="2026-08-05T10:00:00Z", input_tokens=100, output_tokens=0)],
    )
    app = server.TokenMeteringApp(root)

    detail = app.day_detail("2026-08-5")  # unpadded day, as a client might send

    assert detail["total_tokens"] == 100
    assert detail["by_model"][0]["calls"] == 1


def test_heatmap_buckets_by_day_of_week_and_hour():
    # 2026-08-24 is a Monday.
    rows = [
        make_call(request_id="r1", timestamp="2026-08-24T09:00:00Z"),
        make_call(request_id="r2", timestamp="2026-08-24T09:30:00Z"),
        make_call(request_id="r3", timestamp="2026-08-25T14:00:00Z"),  # Tuesday
    ]
    grid = {(c["day_of_week"], c["hour"]): c for c in server.rollup_heatmap(rows)}

    assert len(grid) == 7 * 24
    assert grid[(0, 9)]["calls"] == 2
    assert grid[(1, 14)]["calls"] == 1
    assert grid[(0, 10)]["calls"] == 0


# --------------------------------------------------------------------------
# Per-session trace ordering
# --------------------------------------------------------------------------


def test_session_trace_orders_calls_and_groups_by_agent():
    calls = [
        make_call(request_id="r-main-1", agent="main", timestamp="2026-08-27T14:00:00Z"),
        make_call(request_id="r-builder-1", agent="builder", timestamp="2026-08-27T14:05:00Z"),
        make_call(request_id="r-builder-2", agent="builder", timestamp="2026-08-27T14:15:00Z"),
        make_call(request_id="r-main-2", agent="main", timestamp="2026-08-27T14:20:00Z"),
    ]
    trace = server.build_session_trace("sess-1", calls)

    assert [a["agent"] for a in trace["agents"]] == ["main", "builder"]

    main_trace = trace["agents"][0]["trace"]
    assert [c["request_id"] for c in main_trace] == ["r-main-1", "r-main-2"]
    assert main_trace[0]["duration_seconds"] == pytest.approx(1200.0)  # 20 min later
    assert main_trace[1]["duration_seconds"] is None  # last call for this agent

    builder_trace = trace["agents"][1]["trace"]
    assert [c["request_id"] for c in builder_trace] == ["r-builder-1", "r-builder-2"]
    assert builder_trace[0]["duration_seconds"] == pytest.approx(600.0)  # 10 min later


def test_session_trace_returns_none_for_unknown_session():
    assert server.build_session_trace("sess-missing", []) is None


# --------------------------------------------------------------------------
# Unpriced-model null propagation
# --------------------------------------------------------------------------


def test_unpriced_model_group_reports_null_pure_group_reports_number_individual_reports_unknown():
    priced = make_call(request_id="r1", model="claude-sonnet-5", input_tokens=1_000_000, output_tokens=0)
    unpriced = make_call(request_id="r2", model="claude-nonexistent-9000", agent="main")

    mixed_group = server.rollup_group([priced, unpriced], key_fn=lambda r: r["agent"])
    assert mixed_group[0]["cost"] is None

    pure_priced_group = server.rollup_group([priced], key_fn=lambda r: r["agent"])
    assert pure_priced_group[0]["cost"] == pytest.approx(2.00)

    import pricing

    assert pricing.call_cost(unpriced) == "unknown"


# --------------------------------------------------------------------------
# Cross-project union
# --------------------------------------------------------------------------


def test_cross_project_union_combines_rollups_across_known_projects(tmp_path):
    root_a = make_project(
        tmp_path, "project-a",
        calls=[make_call(request_id="a1", session_id="sess-a", agent="main", input_tokens=1_000_000, output_tokens=0)],
    )
    root_b = make_project(
        tmp_path, "project-b",
        calls=[make_call(request_id="b1", session_id="sess-b", agent="main", input_tokens=2_000_000, output_tokens=0)],
    )

    known_projects_path = tmp_path / "known-projects.json"
    known_projects_path.write_text(json.dumps([str(root_b)]))

    app = server.TokenMeteringApp(root_a, known_projects_path=known_projects_path)
    projects = app.projects()
    assert {p.label for p in projects} == {"project-a", "project-b"}

    rows = app._ranged_calls("life", None)
    assert {r["project"] for r in rows} == {"project-a", "project-b"}
    grouped = server.rollup_group(rows, key_fn=lambda r: r["project"])
    totals = {g["key"]: g["tokens"] for g in grouped}
    assert totals == {"project-a": 1_000_000, "project-b": 2_000_000}


def test_discover_projects_disambiguates_colliding_last_segment_labels(tmp_path):
    org1 = tmp_path / "org1" / "backend"
    org2 = tmp_path / "org2" / "backend"
    org1.mkdir(parents=True)
    org2.mkdir(parents=True)

    known_projects_path = tmp_path / "known-projects.json"
    known_projects_path.write_text(json.dumps([str(org2)]))

    projects = server.discover_projects(org1, known_projects_path)

    labels = {p.label for p in projects}
    assert labels == {"org1/backend", "org2/backend"}


def test_call_detail_resolves_the_correct_project_when_labels_collide(tmp_path):
    org1_dir = tmp_path / "org1"
    org2_dir = tmp_path / "org2"
    org1_dir.mkdir()
    org2_dir.mkdir()
    root_a = make_project(org1_dir, "backend", calls=[make_call(request_id="a1", session_id="sess-a")])
    root_b = make_project(org2_dir, "backend", calls=[make_call(request_id="b1", session_id="sess-b")])

    known_projects_path = tmp_path / "known-projects.json"
    known_projects_path.write_text(json.dumps([str(root_b)]))

    app = server.TokenMeteringApp(root_a, known_projects_path=known_projects_path)
    assert {p.label for p in app.projects()} == {"org1/backend", "org2/backend"}

    detail_a = app.call_detail("sess-a", 1)
    detail_b = app.call_detail("sess-b", 1)

    assert detail_a["project"] == "org1/backend"
    assert detail_b["project"] == "org2/backend"


def test_absent_known_projects_file_means_project_scope_only(tmp_path):
    root = make_project(tmp_path, "solo-project")
    app = server.TokenMeteringApp(root, known_projects_path=tmp_path / "does-not-exist.json")
    assert [p.label for p in app.projects()] == ["solo-project"]


def test_empty_known_projects_file_means_project_scope_only(tmp_path):
    root = make_project(tmp_path, "solo-project")
    known_projects_path = tmp_path / "known-projects.json"
    known_projects_path.write_text("")
    app = server.TokenMeteringApp(root, known_projects_path=known_projects_path)
    assert [p.label for p in app.projects()] == ["solo-project"]


# --------------------------------------------------------------------------
# Cold start: empty/missing tokens.db
# --------------------------------------------------------------------------


def test_cold_start_missing_db_returns_empty_results(tmp_path):
    root = tmp_path / "fresh-project"
    root.mkdir()
    app = server.TokenMeteringApp(root)

    assert app.agent_rollup("7d") == []
    assert app.sessions("7d") == []
    assert app.tool_rollup("7d") == []
    heatmap = app.heatmap("7d")
    assert len(heatmap) == 7 * 24
    assert all(c["calls"] == 0 for c in heatmap)

    timeseries = app.timeseries("life")
    assert timeseries["points"] == []
    assert timeseries["total_tokens"] == 0
    assert timeseries["total_cost"] == 0.0


def test_cold_start_empty_db_returns_empty_results(tmp_path):
    root = make_project(tmp_path, "empty-project")  # db.connect() ran, no rows inserted
    app = server.TokenMeteringApp(root)

    assert app.agent_rollup("30d") == []
    assert app.sessions("30d") == []
    assert app.usage_limit_events("30d") == []


def test_handle_api_404s_for_unknown_session_and_call_without_crashing(tmp_path):
    root = make_project(tmp_path, "empty-project")
    app = server.TokenMeteringApp(root)

    status, body = app.handle_api("/api/session/no-such-session/trace", {})
    assert status == 404

    status, body = app.handle_api("/api/call/no-such-session/1", {})
    assert status == 404


def test_handle_api_rejects_unknown_range():
    app = server.TokenMeteringApp(Path("/nonexistent"))
    status, body = app.handle_api("/api/rollup/agent", {"range": ["bogus"]})
    assert status == 400
    assert "unknown range" in body["error"]


# --------------------------------------------------------------------------
# usage_limit_events surfaced separately from calls
# --------------------------------------------------------------------------


def test_usage_limit_events_surfaced_separately_and_not_counted_as_calls(tmp_path):
    root = make_project(
        tmp_path, "proj",
        calls=[make_call(request_id="r1", session_id="sess-1")],
        events=[dict(session_id="sess-1", timestamp="2026-08-28T12:30:00Z", raw_entry='{"isApiErrorMessage": true}')],
    )
    app = server.TokenMeteringApp(root)

    events = app.usage_limit_events("life")
    assert len(events) == 1
    assert events[0]["session_id"] == "sess-1"

    sessions = app.sessions("life")
    assert len(sessions) == 1
    assert sessions[0]["calls"] == 1  # the usage-limit event isn't a call
    assert sessions[0]["usage_limit_hit"] is True


def test_rollup_sessions_normalizes_a_null_agent_instead_of_crashing():
    calls = [
        make_call(request_id="r1", session_id="sess-1", agent=None),
        make_call(request_id="r2", session_id="sess-1", agent="builder"),
    ]
    for row in calls:
        row["project"] = "proj"

    sessions = server.rollup_sessions(calls, [])

    assert sessions[0]["agents"] == ["builder", "unknown"]


def test_session_without_usage_limit_event_reports_false():
    events = []
    calls = [make_call(request_id="r1", session_id="sess-1")]
    for row in calls:
        row["project"] = "proj"
    sessions = server.rollup_sessions(calls, events)
    assert sessions[0]["usage_limit_hit"] is False


# --------------------------------------------------------------------------
# Transcript unavailable / available
# --------------------------------------------------------------------------


def test_call_detail_transcript_unavailable_still_reports_correct_tokens_and_cost(tmp_path):
    root = make_project(
        tmp_path, "proj",
        calls=[make_call(request_id="r1", session_id="sess-1", input_tokens=1_000_000, output_tokens=0)],
    )
    claude_projects_dir = tmp_path / "claude-home" / "projects"  # deliberately never populated
    app = server.TokenMeteringApp(root, claude_projects_dir=claude_projects_dir)

    detail = app.call_detail("sess-1", 1)

    assert detail["available"] is False
    assert detail["prompt"] is None
    assert detail["response"] is None
    assert detail["input_tokens"] == 1_000_000
    assert detail["cost"] == pytest.approx(2.00)


def test_call_detail_reads_prompt_and_response_from_transcript_when_present(tmp_path):
    root = make_project(
        tmp_path, "proj",
        calls=[make_call(request_id="r1", session_id="sess-1", timestamp="2026-08-28T12:00:00Z")],
    )
    claude_projects_dir = tmp_path / "claude-home" / "projects"
    encoded = server.encode_project_path(root)
    transcript_dir = claude_projects_dir / encoded
    transcript_dir.mkdir(parents=True)
    transcript_path = transcript_dir / "sess-1.jsonl"
    entries = [
        {"type": "user", "message": {"role": "user", "content": "What's the token total?"}},
        {
            "type": "assistant",
            "requestId": "r1",
            "timestamp": "2026-08-28T12:00:00Z",
            "message": {"role": "assistant", "content": [{"type": "text", "text": "It's 300 tokens."}]},
        },
    ]
    with transcript_path.open("w") as f:
        for entry in entries:
            f.write(json.dumps(entry) + "\n")

    app = server.TokenMeteringApp(root, claude_projects_dir=claude_projects_dir)
    detail = app.call_detail("sess-1", 1)

    assert detail["available"] is True
    assert detail["prompt"] == "What's the token total?"
    assert detail["response"] == "It's 300 tokens."


def test_extract_call_content_skips_tool_result_echo_to_find_the_real_prompt():
    entries = [
        {"type": "user", "message": {"role": "user", "content": "real question"}},
        {
            "type": "assistant",
            "requestId": "r1",
            "message": {"role": "assistant", "content": [{"type": "tool_use", "id": "t1", "name": "Bash", "input": {}}]},
        },
        {
            "type": "user",
            "message": {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "t1", "content": "output"}]},
        },
        {
            "type": "assistant",
            "requestId": "r2",
            "message": {"role": "assistant", "content": [{"type": "text", "text": "the answer"}]},
        },
    ]

    assert server._extract_call_content(entries, "r2") == ("real question", "the answer")


def test_call_detail_falls_back_to_subagent_transcript(tmp_path):
    root = make_project(
        tmp_path, "proj",
        calls=[make_call(request_id="r-sub", session_id="sess-1", agent="builder")],
    )
    claude_projects_dir = tmp_path / "claude-home" / "projects"
    encoded = server.encode_project_path(root)
    subagents_dir = claude_projects_dir / encoded / "sess-1" / "subagents"
    subagents_dir.mkdir(parents=True)
    (claude_projects_dir / encoded / "sess-1.jsonl").write_text("")  # main transcript, no matching request

    entries = [
        {"type": "user", "message": {"role": "user", "content": "Do the thing."}},
        {
            "type": "assistant",
            "requestId": "r-sub",
            "timestamp": "2026-08-28T12:00:00Z",
            "message": {"role": "assistant", "content": [{"type": "text", "text": "Done."}]},
        },
    ]
    with (subagents_dir / "agent-abc123.jsonl").open("w") as f:
        for entry in entries:
            f.write(json.dumps(entry) + "\n")

    app = server.TokenMeteringApp(root, claude_projects_dir=claude_projects_dir)
    detail = app.call_detail("sess-1", 1)

    assert detail["available"] is True
    assert detail["response"] == "Done."


# --------------------------------------------------------------------------
# HTTP smoke tests (thin dispatch layer only - correctness is covered above)
# --------------------------------------------------------------------------


def _start_server(app):
    handler_cls = server.make_handler(app)
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler_cls)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd, thread


def _stop_server(httpd, thread):
    httpd.shutdown()
    httpd.server_close()
    thread.join(timeout=2)


def test_http_smoke_rollup_timeseries_endpoint(tmp_path):
    root = make_project(tmp_path, "proj", calls=[make_call()])
    app = server.TokenMeteringApp(root)
    httpd, thread = _start_server(app)
    try:
        port = httpd.server_address[1]
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/rollup/timeseries?range=life") as resp:
            assert resp.status == 200
            body = json.loads(resp.read())
            assert body["data"]["range"] == "life"
            assert body["data"]["total_tokens"] == 300
    finally:
        _stop_server(httpd, thread)


def test_http_smoke_catch_all_serves_placeholder_when_static_missing(tmp_path):
    root = make_project(tmp_path, "proj")
    app = server.TokenMeteringApp(root, static_dir=tmp_path / "nonexistent-static")
    httpd, thread = _start_server(app)
    try:
        port = httpd.server_address[1]
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/call/sess-1/1") as resp:
            assert resp.status == 200
            assert "text/html" in resp.headers.get("Content-Type", "")
    finally:
        _stop_server(httpd, thread)
