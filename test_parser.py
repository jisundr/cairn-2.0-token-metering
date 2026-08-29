import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402
import parser  # noqa: E402


def write_jsonl(path: Path, lines):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as f:
        for line in lines:
            if isinstance(line, str):
                f.write(line + "\n")
            else:
                f.write(json.dumps(line) + "\n")


def make_usage(**overrides):
    usage = dict(
        input_tokens=10,
        output_tokens=20,
        cache_read_input_tokens=5,
        cache_creation={"ephemeral_5m_input_tokens": 1, "ephemeral_1h_input_tokens": 2},
    )
    usage.update(overrides)
    return usage


def make_call_entry(request_id, tool_use_id=None, tool_name="Read",
                     timestamp="2026-08-28T00:00:00Z", **usage_overrides):
    content = []
    if tool_use_id:
        content.append({"type": "tool_use", "id": tool_use_id, "name": tool_name, "input": {}})
    return {
        "type": "assistant",
        "requestId": request_id,
        "timestamp": timestamp,
        "message": {
            "role": "assistant",
            "model": "claude-sonnet-5",
            "usage": make_usage(**usage_overrides),
            "content": content,
        },
    }


def make_dispatch_entry(tool_use_id, subagent_type, request_id="req-dispatch"):
    return {
        "type": "assistant",
        "requestId": request_id,
        "timestamp": "2026-08-28T00:00:00Z",
        "message": {
            "role": "assistant",
            "model": "claude-sonnet-5",
            "usage": make_usage(),
            "content": [
                {
                    "type": "tool_use",
                    "id": tool_use_id,
                    "name": "Task",
                    "input": {"subagent_type": subagent_type, "description": "do work"},
                }
            ],
        },
    }


def make_dispatch_result_entry(tool_use_id, agent_id):
    return {
        "type": "user",
        "message": {
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": tool_use_id,
                    "content": [{"type": "text", "text": f"Dispatched. agentId: {agent_id}"}],
                }
            ],
        },
    }


def test_build_agent_map_maps_subagent_type_to_agent_id():
    main_entries = [
        make_dispatch_entry("toolu_1", "builder"),
        make_dispatch_result_entry("toolu_1", "abc123def"),
    ]
    agent_map = parser.build_agent_map(main_entries)
    assert agent_map == {"abc123def": "builder"}


def test_build_agent_map_skips_unresolved_dispatch():
    main_entries = [make_dispatch_entry("toolu_1", "builder")]
    agent_map = parser.build_agent_map(main_entries)
    assert agent_map == {}


def test_parse_session_attributes_main_and_subagent_entries(tmp_path):
    cairn_dir = tmp_path / ".cairn"
    transcript_path = tmp_path / "session.jsonl"

    write_jsonl(transcript_path, [
        make_dispatch_entry("toolu_dispatch", "builder"),
        make_dispatch_result_entry("toolu_dispatch", "abc123"),
        make_call_entry("req-main", tool_use_id="toolu_main", tool_name="Read"),
    ])
    write_jsonl(tmp_path / "session" / "subagents" / "agent-abc123.jsonl", [
        make_call_entry("req-sub", tool_use_id="toolu_sub", tool_name="Write"),
    ])

    parser.parse_session(cairn_dir, transcript_path, "sess-1")

    conn = db.connect(cairn_dir)
    calls = {row[0]: row[1] for row in conn.execute("SELECT request_id, agent FROM calls")}
    tool_uses = {row[0]: row[1] for row in conn.execute("SELECT tool_use_id, agent FROM tool_uses")}

    assert calls["req-main"] == "main"
    assert calls["req-sub"] == "builder"
    assert tool_uses["toolu_main"] == "main"
    assert tool_uses["toolu_sub"] == "builder"


def test_parse_session_tags_unmatched_subagent_as_unknown(tmp_path):
    cairn_dir = tmp_path / ".cairn"
    transcript_path = tmp_path / "session.jsonl"

    write_jsonl(transcript_path, [
        make_call_entry("req-main", tool_use_id="toolu_main"),
    ])
    write_jsonl(tmp_path / "session" / "subagents" / "agent-zzz999.jsonl", [
        make_call_entry("req-sub", tool_use_id="toolu_sub"),
    ])

    parser.parse_session(cairn_dir, transcript_path, "sess-1")

    conn = db.connect(cairn_dir)
    agent = conn.execute("SELECT agent FROM calls WHERE request_id = 'req-sub'").fetchone()[0]
    assert agent == "unknown"


def test_parse_session_dedupes_duplicate_request_id(tmp_path):
    cairn_dir = tmp_path / ".cairn"
    transcript_path = tmp_path / "session.jsonl"

    write_jsonl(transcript_path, [
        make_call_entry("req-dup", tool_use_id="toolu_1"),
        make_call_entry("req-dup", tool_use_id="toolu_2", output_tokens=999),
    ])

    parser.parse_session(cairn_dir, transcript_path, "sess-1")

    conn = db.connect(cairn_dir)
    rows = conn.execute("SELECT output_tokens FROM calls WHERE request_id = 'req-dup'").fetchall()
    assert len(rows) == 1
    assert rows[0][0] == 20


def test_parse_session_dedupes_duplicate_tool_use_id(tmp_path):
    cairn_dir = tmp_path / ".cairn"
    transcript_path = tmp_path / "session.jsonl"

    write_jsonl(transcript_path, [
        make_call_entry("req-1", tool_use_id="toolu_dup", tool_name="Read"),
        make_call_entry("req-2", tool_use_id="toolu_dup", tool_name="Write"),
    ])

    parser.parse_session(cairn_dir, transcript_path, "sess-1")

    conn = db.connect(cairn_dir)
    rows = conn.execute("SELECT tool_name FROM tool_uses WHERE tool_use_id = 'toolu_dup'").fetchall()
    assert len(rows) == 1
    assert rows[0][0] == "Read"


def test_isapi_error_message_routes_to_usage_limit_events(tmp_path):
    cairn_dir = tmp_path / ".cairn"
    transcript_path = tmp_path / "session.jsonl"

    write_jsonl(transcript_path, [
        {"isApiErrorMessage": True, "timestamp": "2026-08-28T00:00:00Z"},
    ])

    parser.parse_session(cairn_dir, transcript_path, "sess-1")

    conn = db.connect(cairn_dir)
    calls = conn.execute("SELECT COUNT(*) FROM calls").fetchone()[0]
    events = conn.execute("SELECT session_id FROM usage_limit_events").fetchall()
    assert calls == 0
    assert events == [("sess-1",)]


def test_malformed_json_line_does_not_block_surrounding_entries(tmp_path):
    cairn_dir = tmp_path / ".cairn"
    transcript_path = tmp_path / "session.jsonl"

    write_jsonl(transcript_path, [
        make_call_entry("req-1", tool_use_id="toolu_1"),
        "{not valid json",
        make_call_entry("req-2", tool_use_id="toolu_2"),
    ])

    parser.parse_session(cairn_dir, transcript_path, "sess-1")

    conn = db.connect(cairn_dir)
    request_ids = {row[0] for row in conn.execute("SELECT request_id FROM calls")}
    assert request_ids == {"req-1", "req-2"}


def test_parse_session_is_idempotent_on_rerun(tmp_path):
    cairn_dir = tmp_path / ".cairn"
    transcript_path = tmp_path / "session.jsonl"

    write_jsonl(transcript_path, [
        make_call_entry("req-1", tool_use_id="toolu_1"),
    ])

    parser.parse_session(cairn_dir, transcript_path, "sess-1")
    conn = db.connect(cairn_dir)
    first_calls = conn.execute("SELECT COUNT(*) FROM calls").fetchone()[0]
    first_tool_uses = conn.execute("SELECT COUNT(*) FROM tool_uses").fetchone()[0]

    parser.parse_session(cairn_dir, transcript_path, "sess-1")
    second_calls = conn.execute("SELECT COUNT(*) FROM calls").fetchone()[0]
    second_tool_uses = conn.execute("SELECT COUNT(*) FROM tool_uses").fetchone()[0]

    assert first_calls == second_calls == 1
    assert first_tool_uses == second_tool_uses == 1
