import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pricing  # noqa: E402


def make_call(**overrides):
    call = dict(
        request_id="req-1",
        session_id="sess-1",
        agent="main",
        model="claude-sonnet-5",
        timestamp="2026-08-28T00:00:00Z",
        input_tokens=1_000_000,
        output_tokens=1_000_000,
        cache_read_tokens=0,
        cache_write_5m_tokens=0,
        cache_write_1h_tokens=0,
    )
    call.update(overrides)
    return call


def test_call_cost_known_model_computes_expected_dollar_amount():
    # claude-sonnet-5: $2.00/MTok input, $10.00/MTok output, $0.20/MTok
    # cache_read, $2.50/MTok cache_write_5m, $4.00/MTok cache_write_1h.
    row = make_call(
        model="claude-sonnet-5",
        input_tokens=1_000_000,
        output_tokens=500_000,
        cache_read_tokens=2_000_000,
        cache_write_5m_tokens=1_000_000,
        cache_write_1h_tokens=500_000,
    )

    cost = pricing.call_cost(row)

    expected = (2.00 * 1) + (10.00 * 0.5) + (0.20 * 2) + (2.50 * 1) + (4.00 * 0.5)
    assert cost == pytest.approx(expected)


def test_call_cost_unknown_model_returns_unknown():
    row = make_call(model="claude-nonexistent-9000")

    assert pricing.call_cost(row) == "unknown"


def test_group_cost_mixed_priced_and_unpriced_models_returns_none():
    rows = [
        make_call(request_id="req-1", model="claude-sonnet-5"),
        make_call(request_id="req-2", model="claude-nonexistent-9000"),
    ]

    assert pricing.group_cost(rows) is None


def test_group_cost_all_known_models_sums_each_row():
    rows = [
        make_call(request_id="req-1", model="claude-sonnet-5", input_tokens=1_000_000, output_tokens=0),
        make_call(request_id="req-2", model="claude-haiku-4-5-20251001", input_tokens=1_000_000, output_tokens=0),
    ]

    total = pricing.group_cost(rows)

    # $2.00 (sonnet-5 input) + $1.00 (haiku-4-5 input)
    assert total == pytest.approx(3.00)
