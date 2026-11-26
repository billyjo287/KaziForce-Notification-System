"""Turns the volunteers' Google Form answers into the final test set, evaluation/holdout-v2.csv.

    python -m training.import_holdout_v2 path/to/responses.csv

The CSV is the form's response sheet (Google Sheets: File > Download > Comma-separated values).
Each form response is one message written and labelled by a volunteer who never saw the training
generator (docs/ml-v2-plan.md, step 2). Columns are found by the start of each question, so the
order of the sheet does not matter. Rows with no message text are skipped; exact repeats of a
message are kept once. Nothing is changed in the volunteers' words or labels.
"""

from __future__ import annotations

import argparse
import csv
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "evaluation" / "holdout-v2.csv"
NAIROBI = timezone(timedelta(hours=3))

QUESTIONS = {
    "timestamp": "Timestamp",
    "volunteer": "Your volunteer code",
    "language": "Language of the message",
    "kind": "Kind of message",
    "recipient": "Who receives it",
    "sender": "Who sends it",
    "deadline": "Job alerts only",
    "time": "Time of day the message is sent",
    "text": "The message",
    "spam": "Is it a scam",
    "priority": "How urgent is it",
    "why": "Why?",
}
LANGUAGE = {"english": "en", "kiswahili": "sw", "sheng or mixed": "sh"}
KIND = {
    "job alert": "job_alert",
    "application update": "status_update",
    "direct message": "message",
    "announcement": "announcement",
}
RECIPIENT = {"worker": "worker", "employer": "business"}
SENDER = {
    "employer": "business",
    "worker": "worker",
    "kaziforce admin": "admin",
    "the app": "system",
}
PRIORITY = {"urgent": "urgent", "medium": "medium", "low": "low"}
FIELDS = [
    "id", "language", "type", "recipient_role", "sender_role", "created_at",
    "deadline_minutes", "text", "priority", "is_spam", "why", "volunteer",
]  # fmt: skip


def by_prefix(mapping: dict[str, str], answer: str) -> str:
    answer = answer.strip().lower()
    for prefix, value in mapping.items():
        if answer.startswith(prefix):
            return value
    raise ValueError(f"unexpected answer {answer!r}")


def columns(header: list[str]) -> dict[str, int]:
    found = {}
    for key, start in QUESTIONS.items():
        matches = [i for i, h in enumerate(header) if h.strip().startswith(start)]
        if not matches:
            raise SystemExit(f"Column not found: a question starting with {start!r}")
        found[key] = matches[0]
    return found


def parse_time(day: str, time_of_day: str) -> str:
    """Form timestamp's date (Nairobi) + the time the volunteer chose, as ISO 8601."""
    date = None
    for fmt in ("%m/%d/%Y %H:%M:%S", "%d/%m/%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            date = datetime.strptime(day.strip(), fmt).date()
            break
        except ValueError:
            continue
    if date is None:
        raise ValueError(f"unexpected timestamp {day!r}")
    for fmt in ("%H:%M:%S", "%H:%M", "%I:%M:%S %p", "%I:%M %p"):
        try:
            t = datetime.strptime(time_of_day.strip(), fmt).time()
            return datetime.combine(date, t, tzinfo=NAIROBI).isoformat()
        except ValueError:
            continue
    raise ValueError(f"unexpected time {time_of_day!r}")


def convert(rows: list[list[str]]) -> tuple[list[dict], list[str]]:
    col = columns(rows[0])
    out, problems, seen = [], [], set()
    for n, r in enumerate(rows[1:], start=2):
        text = r[col["text"]].strip()
        if not text:
            continue
        if text in seen:
            problems.append(f"row {n}: same message as an earlier row, kept once")
            continue
        try:
            deadline = r[col["deadline"]].strip()
            item = {
                "language": by_prefix(LANGUAGE, r[col["language"]]),
                "type": by_prefix(KIND, r[col["kind"]]),
                "recipient_role": by_prefix(RECIPIENT, r[col["recipient"]]),
                "sender_role": by_prefix(SENDER, r[col["sender"]]),
                "created_at": parse_time(r[col["timestamp"]], r[col["time"]]),
                "deadline_minutes": str(int(float(deadline))) if deadline else "",
                "text": text[:1000],
                "priority": by_prefix(PRIORITY, r[col["priority"]]),
                "is_spam": "true" if r[col["spam"]].strip().lower() == "yes" else "false",
                "why": r[col["why"]].strip(),
                "volunteer": r[col["volunteer"]].strip().upper(),
            }
        except ValueError as error:
            problems.append(f"row {n}: skipped ({error})")
            continue
        seen.add(text)
        out.append({"id": str(len(out) + 1), **item})
    return out, problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Import the volunteers' test messages.")
    parser.add_argument("responses", type=Path, help="the form's responses as CSV")
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args(argv)
    with args.responses.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))
    out, problems = convert(rows)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(out)
    for p in problems:
        print(p)
    langs = {k: sum(r["language"] == k for r in out) for k in ("en", "sw", "sh")}
    spam = sum(r["is_spam"] == "true" for r in out)
    volunteers = len({r["volunteer"] for r in out})
    print(
        f"{len(out)} messages from {volunteers} volunteers ({langs}, {spam} scams) -> "
        f"{args.out.as_posix()}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
