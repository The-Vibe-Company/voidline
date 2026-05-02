"""Regression test for modal_app._flag_count.

Schema v2 oracle reports emit warnings under ``payload['oracle']['warnings']``
as a flat list. The legacy v1 schema used ``payload['flags']`` as a dict of
list values. Both must be counted so old reports living in the volume keep
flagCount semantics across schema migrations.
"""

from voidline_rl.modal_app import _flag_count


def test_flag_count_reads_oracle_warnings_v2():
    payload = {
        "schemaVersion": 2,
        "oracle": {
            "warnings": [
                {"kind": "op-pick", "subject": "upgrade:foo"},
                {"kind": "dead-pick", "subject": "relic:bar"},
            ]
        },
    }
    assert _flag_count(payload) == 2


def test_flag_count_reads_legacy_flags_v1():
    payload = {
        "schemaVersion": 1,
        "flags": {
            "balance": [{"kind": "op-pick"}],
            "design": [{"kind": "dominant"}, {"kind": "dead"}],
        },
    }
    assert _flag_count(payload) == 3


def test_flag_count_zero_when_no_warnings():
    payload = {"schemaVersion": 2, "oracle": {"warnings": []}}
    assert _flag_count(payload) == 0


def test_flag_count_zero_on_empty_payload():
    assert _flag_count({}) == 0


def test_flag_count_sums_both_schemas_simultaneously():
    payload = {
        "schemaVersion": 2,
        "oracle": {"warnings": [{"kind": "op"}]},
        "flags": {"legacy": [{"kind": "x"}, {"kind": "y"}]},
    }
    assert _flag_count(payload) == 3
