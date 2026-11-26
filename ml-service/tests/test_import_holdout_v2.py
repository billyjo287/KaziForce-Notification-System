"""The importer for the volunteers' Google Form answers (ml-v2 final test set)."""

import csv

from training import import_holdout_v2
from training.evaluate_baseline import load_rows, to_request

HEADER = [
    "Timestamp",
    "Your volunteer code (given by Billy, e.g. V1)",
    "Language of the message",
    "Kind of message",
    "Who receives it?",
    "Who sends it?",
    "Job alerts only: in how many minutes do applications close? (e.g. 45)",
    "Time of day the message is sent",
    "The message (as the person would see it on their phone)",
    "Is it a scam?",
    "How urgent is it for the person who receives it? (answer even for scams)",
    "Why? (a few words)",
]


def test_turns_form_answers_into_the_test_set_format(tmp_path):
    source = tmp_path / "responses.csv"
    rows = [
        HEADER,
        [
            "11/27/2026 10:15:02", "v1", "Sheng or mixed", "Job alert (a new job is available)",
            "Worker", "Employer / business", "45", "2:30:00 PM",
            "Cleaner leo Kilimani\nTuna-need cleaner saa hii", "No",
            "Urgent: act within a few hours (today)", "closes in 45 minutes",
        ],
        [
            "11/27/2026 10:20:44", "V2", "Kiswahili",
            "Direct message (worker and employer chatting)",
            "Worker", "Worker", "", "09:05:00", "Tuma 500 upate kazi", "Yes",
            "Medium: within a day or two", "asks for a fee",
        ],
        ["11/27/2026 10:21:00", "V2", "English", "Announcement from KaziForce", "Worker",
         "KaziForce admin", "", "08:00:00", "", "No", "Low: no action needed", "empty"],
        [
            "11/27/2026 10:22:00", "V3", "English", "Announcement from KaziForce", "Worker",
            "KaziForce admin", "", "08:00:00", "Tuma 500 upate kazi", "Yes",
            "Low: no action needed", "repeat",
        ],
    ]  # fmt: skip
    with source.open("w", encoding="utf-8", newline="") as f:
        csv.writer(f).writerows(rows)
    out = tmp_path / "holdout-v2.csv"
    assert import_holdout_v2.main([str(source), "--out", str(out)]) == 0

    loaded = load_rows(out)
    assert len(loaded) == 2, "empty and repeated messages are dropped"
    first, second = loaded
    assert first["language"] == "sh" and first["type"] == "job_alert"
    assert first["sender_role"] == "business" and first["recipient_role"] == "worker"
    assert first["deadline_minutes"] == 45 and first["priority"] == "urgent"
    assert first["created_at"] == "2026-11-27T14:30:00+03:00"
    assert first["volunteer"] == "V1" and first["is_spam"] is False
    assert second["is_spam"] is True and second["type"] == "message"
    # Every row is a valid /predict request.
    for row in loaded:
        to_request(row)
