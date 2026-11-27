"""Turns the A/B test download into the numbers for the report (docs/ml-v2-plan.md step 8).

    python -m training.ab_report kaziforce-ab-test-2026-11-28.csv

Group A: every alert the same way (in the app + email). Group B: priority routing.
Prints, per group: people, alerts, share opened, median minutes to open (all alerts and urgent
ones), share of urgent alerts opened within 30 minutes, and the opt-out rate (people who switched
a channel or a category off, replied STOP or asked to delete their account since joining).
The Mann-Whitney U test compares time to open between the groups (alerts never opened count as
the slowest). With few volunteers the result is a pilot: report the numbers and the p-value, not
a firm conclusion.
"""

from __future__ import annotations

import argparse
import csv
import statistics
import sys
from pathlib import Path

from scipy.stats import mannwhitneyu

QUICK_SECONDS = 30 * 60


def load(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def minutes(rows: list[dict]) -> float | None:
    opened = [int(r["seconds_to_open"]) / 60 for r in rows if r["seconds_to_open"]]
    return round(statistics.median(opened), 1) if opened else None


def summary(rows: list[dict]) -> dict:
    people = {r["user_token"] for r in rows}
    opted = {r["user_token"] for r in rows if r["user_opted_out"] == "true"}
    urgent = [r for r in rows if r["priority"] == "urgent"]
    quick = [
        r for r in urgent if r["seconds_to_open"] and int(r["seconds_to_open"]) <= QUICK_SECONDS
    ]
    return {
        "people": len(people),
        "alerts": len(rows),
        "opened_share": round(sum(r["opened"] == "true" for r in rows) / len(rows), 3)
        if rows
        else None,
        "median_minutes_to_open": minutes(rows),
        "urgent_alerts": len(urgent),
        "urgent_median_minutes": minutes(urgent),
        "urgent_opened_within_30_min": round(len(quick) / len(urgent), 3) if urgent else None,
        "opt_out_rate": round(len(opted) / len(people), 3) if people else None,
    }


def seconds_or_slowest(rows: list[dict], slowest: float) -> list[float]:
    return [float(r["seconds_to_open"]) if r["seconds_to_open"] else slowest for r in rows]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="A/B test results")
    parser.add_argument("csv", type=Path)
    args = parser.parse_args(argv)
    rows = load(args.csv)
    groups = {g: [r for r in rows if r["group"] == g] for g in ("A", "B")}
    print("| | Group A (same for all) | Group B (priority routing) |")
    print("| --- | ---: | ---: |")
    results = {g: summary(rs) for g, rs in groups.items()}
    for key in results["A"]:
        print(f"| {key} | {results['A'][key]} | {results['B'][key]} |")
    every = [float(r["seconds_to_open"]) for r in rows if r["seconds_to_open"]]
    slowest = (max(every) if every else 0) + 1
    for label, pick in (
        ("all alerts", lambda r: True),
        ("urgent", lambda r: r["priority"] == "urgent"),
    ):
        a = seconds_or_slowest([r for r in groups["A"] if pick(r)], slowest)
        b = seconds_or_slowest([r for r in groups["B"] if pick(r)], slowest)
        if a and b:
            p = mannwhitneyu(a, b, alternative="two-sided").pvalue
            print(f"\nTime to open, {label}: Mann-Whitney U p = {p:.3f} (A {len(a)} vs B {len(b)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
