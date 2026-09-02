import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402


def make_call(**overrides):
    call = dict(
        request_id="req-1",
        session_id="sess-1",
        agent="main",
        model="claude-sonnet-5",
        timestamp="2026-08-28T00:00:00Z",
        input_tokens=2,
        output_tokens=498,
        cache_read_tokens=0,
        cache_write_5m_tokens=0,
        cache_write_1h_tokens=85386,
    )
    call.update(overrides)
    return call


def make_tool_use(**overrides):
    tool_use = dict(
        tool_use_id="toolu-1",
        request_id="req-1",
        session_id="sess-1",
        agent="main",
        tool_name="Read",
        timestamp="2026-08-28T00:00:00Z",
        detail=None,
    )
    tool_use.update(overrides)
    return tool_use


def test_connect_creates_db_file_and_tables(tmp_path):
    cairn_dir = tmp_path / ".cairn"
    conn = db.connect(cairn_dir)
    assert db.db_path(cairn_dir).exists()

    tables = {
        row[0]
        for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    assert "calls" in tables
    assert "usage_limit_events" in tables
    assert "tool_uses" in tables


def test_insert_call_round_trips_fields(tmp_path):
    conn = db.connect(tmp_path / ".cairn")
    db.insert_call(conn, **make_call())
    conn.commit()

    row = conn.execute("SELECT * FROM calls WHERE request_id = 'req-1'").fetchone()
    assert row is not None
    columns = [d[0] for d in conn.execute("SELECT * FROM calls").description]
    record = dict(zip(columns, row))
    assert record["agent"] == "main"
    assert record["model"] == "claude-sonnet-5"
    assert record["output_tokens"] == 498
    assert record["cache_write_1h_tokens"] == 85386


def test_insert_call_dedupes_on_request_id(tmp_path):
    conn = db.connect(tmp_path / ".cairn")
    db.insert_call(conn, **make_call())
    db.insert_call(conn, **make_call(output_tokens=999))
    conn.commit()

    rows = conn.execute("SELECT output_tokens FROM calls WHERE request_id = 'req-1'").fetchall()
    assert len(rows) == 1
    assert rows[0][0] == 498


def test_insert_call_defaults_optional_cache_fields(tmp_path):
    conn = db.connect(tmp_path / ".cairn")
    db.insert_call(
        conn,
        request_id="req-2",
        session_id="sess-1",
        agent="unknown",
        model="claude-sonnet-5",
        timestamp="2026-08-28T00:00:00Z",
        input_tokens=1,
        output_tokens=1,
    )
    conn.commit()

    row = conn.execute(
        "SELECT cache_read_tokens, cache_write_5m_tokens, cache_write_1h_tokens "
        "FROM calls WHERE request_id = 'req-2'"
    ).fetchone()
    assert row == (0, 0, 0)


def test_insert_usage_limit_event(tmp_path):
    conn = db.connect(tmp_path / ".cairn")
    db.insert_usage_limit_event(
        conn,
        session_id="sess-1",
        timestamp="2026-08-28T00:00:00Z",
        raw_entry='{"isApiErrorMessage": true}',
    )
    conn.commit()

    row = conn.execute("SELECT session_id, raw_entry FROM usage_limit_events").fetchone()
    assert row == ("sess-1", '{"isApiErrorMessage": true}')


def test_connect_is_idempotent_across_calls(tmp_path):
    cairn_dir = tmp_path / ".cairn"
    conn1 = db.connect(cairn_dir)
    db.insert_call(conn1, **make_call())
    conn1.commit()
    conn1.close()

    conn2 = db.connect(cairn_dir)
    row = conn2.execute("SELECT request_id FROM calls").fetchone()
    assert row == ("req-1",)

    indexes = [
        row[0]
        for row in conn2.execute("SELECT name FROM sqlite_master WHERE type='index'")
    ]
    assert indexes.count("idx_calls_session_id") == 1
    assert indexes.count("idx_calls_timestamp_trunc") == 1
    assert indexes.count("idx_tool_uses_session_id") == 1
    assert indexes.count("idx_usage_limit_events_session_id") == 1


def test_connect_creates_expected_indexes(tmp_path):
    conn = db.connect(tmp_path / ".cairn")

    indexes = {
        row[0]
        for row in conn.execute("SELECT name FROM sqlite_master WHERE type='index'")
    }
    assert "idx_calls_session_id" in indexes
    assert "idx_calls_timestamp_trunc" in indexes
    assert "idx_tool_uses_session_id" in indexes
    assert "idx_usage_limit_events_session_id" in indexes


def test_insert_tool_use_round_trips_fields(tmp_path):
    conn = db.connect(tmp_path / ".cairn")
    db.insert_tool_use(conn, **make_tool_use(detail=None))
    conn.commit()

    row = conn.execute("SELECT * FROM tool_uses WHERE tool_use_id = 'toolu-1'").fetchone()
    assert row is not None
    columns = [d[0] for d in conn.execute("SELECT * FROM tool_uses").description]
    record = dict(zip(columns, row))
    assert record["request_id"] == "req-1"
    assert record["agent"] == "main"
    assert record["tool_name"] == "Read"
    assert record["detail"] is None


def test_insert_tool_use_round_trips_non_null_detail(tmp_path):
    conn = db.connect(tmp_path / ".cairn")
    db.insert_tool_use(conn, **make_tool_use(
        tool_use_id="toolu-2", tool_name="Skill", detail="cairn:start",
    ))
    conn.commit()

    row = conn.execute(
        "SELECT detail FROM tool_uses WHERE tool_use_id = 'toolu-2'"
    ).fetchone()
    assert row == ("cairn:start",)


def test_insert_tool_use_dedupes_on_tool_use_id(tmp_path):
    conn = db.connect(tmp_path / ".cairn")
    db.insert_tool_use(conn, **make_tool_use())
    db.insert_tool_use(conn, **make_tool_use(tool_name="Write"))
    conn.commit()

    rows = conn.execute(
        "SELECT tool_name FROM tool_uses WHERE tool_use_id = 'toolu-1'"
    ).fetchall()
    assert len(rows) == 1
    assert rows[0][0] == "Read"
