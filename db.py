#!/usr/bin/env python3
"""SQLite store for cairn's token-metering feature. stdlib only.

Usage:
    from db import connect, insert_call, insert_usage_limit_event, insert_tool_use
    conn = connect(cairn_dir)   # opens/creates cairn_dir/tokens.db with tables
"""
import sqlite3
from pathlib import Path

DB_FILENAME = "tokens.db"

CALLS_SCHEMA = """
CREATE TABLE IF NOT EXISTS calls (
    request_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    agent TEXT,
    model TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_5m_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_1h_tokens INTEGER NOT NULL DEFAULT 0
)
"""

USAGE_LIMIT_EVENTS_SCHEMA = """
CREATE TABLE IF NOT EXISTS usage_limit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    raw_entry TEXT NOT NULL
)
"""

TOOL_USES_SCHEMA = """
CREATE TABLE IF NOT EXISTS tool_uses (
    tool_use_id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    agent TEXT,
    tool_name TEXT NOT NULL,
    detail TEXT,
    timestamp TEXT NOT NULL
)
"""


def db_path(cairn_dir: Path) -> Path:
    return cairn_dir / DB_FILENAME


def connect(cairn_dir: Path) -> sqlite3.Connection:
    cairn_dir.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path(cairn_dir))
    conn.execute(CALLS_SCHEMA)
    conn.execute(USAGE_LIMIT_EVENTS_SCHEMA)
    conn.execute(TOOL_USES_SCHEMA)
    conn.commit()
    return conn


def insert_call(
    conn,
    *,
    request_id,
    session_id,
    agent,
    model,
    timestamp,
    input_tokens,
    output_tokens,
    cache_read_tokens=0,
    cache_write_5m_tokens=0,
    cache_write_1h_tokens=0,
):
    conn.execute(
        "INSERT OR IGNORE INTO calls "
        "(request_id, session_id, agent, model, timestamp, input_tokens, output_tokens, "
        "cache_read_tokens, cache_write_5m_tokens, cache_write_1h_tokens) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            request_id,
            session_id,
            agent,
            model,
            timestamp,
            input_tokens,
            output_tokens,
            cache_read_tokens,
            cache_write_5m_tokens,
            cache_write_1h_tokens,
        ),
    )


def insert_usage_limit_event(conn, *, session_id, timestamp, raw_entry):
    conn.execute(
        "INSERT INTO usage_limit_events (session_id, timestamp, raw_entry) VALUES (?, ?, ?)",
        (session_id, timestamp, raw_entry),
    )


def insert_tool_use(conn, *, tool_use_id, request_id, session_id, agent, tool_name, timestamp, detail=None):
    conn.execute(
        "INSERT OR IGNORE INTO tool_uses "
        "(tool_use_id, request_id, session_id, agent, tool_name, detail, timestamp) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (tool_use_id, request_id, session_id, agent, tool_name, detail, timestamp),
    )
