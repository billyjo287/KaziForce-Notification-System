"""The A/B results script reads the admin download and compares the two groups."""

import csv

from training import ab_report

COLUMNS = [
    "user_token", "group", "role", "priority", "type", "category", "created_at",
    "channels_sent", "opened", "seconds_to_open", "marked_not_important",
    "user_opted_out", "user_opt_outs",
]  # fmt: skip


def row(user, group, priority, seconds, opted="false"):
    return {
        "user_token": user, "group": group, "role": "worker", "priority": priority,
        "type": "job_alert", "category": "new_job", "created_at": "2026-11-27T08:00:00Z",
        "channels_sent": "in_app", "opened": "true" if seconds is not None else "false",
        "seconds_to_open": "" if seconds is None else str(seconds),
        "marked_not_important": "false", "user_opted_out": opted, "user_opt_outs": "",
    }  # fmt: skip


def test_summary_per_group(tmp_path, capsys):
    rows = [
        row("u1", "A", "urgent", 3600),
        row("u1", "A", "low", None),
        row("u2", "A", "urgent", 600, opted="true"),
        row("u3", "B", "urgent", 120),
        row("u3", "B", "low", 7200),
        row("u4", "B", "urgent", 300),
    ]
    path = tmp_path / "ab.csv"
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(rows)
    a = ab_report.summary([r for r in rows if r["group"] == "A"])
    b = ab_report.summary([r for r in rows if r["group"] == "B"])
    assert a["people"] == 2 and a["opt_out_rate"] == 0.5 and a["opened_share"] == 0.667
    assert a["urgent_opened_within_30_min"] == 0.5
    assert b["urgent_median_minutes"] == 3.5 and b["opt_out_rate"] == 0.0
    assert ab_report.main([str(path)]) == 0
    assert "Mann-Whitney" in capsys.readouterr().out
