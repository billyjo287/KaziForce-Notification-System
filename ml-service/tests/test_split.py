"""The evaluation rules: split by situation, and priority, urgent recall and spam scored apart."""

import csv
import json
from pathlib import Path

from sklearn.model_selection import GroupKFold, GroupShuffleSplit

from training import make_synthetic_v2
from training.train import SEED

ROOT = Path(__file__).resolve().parent.parent


def test_training_and_validation_share_no_situation():
    rows = make_synthetic_v2.generate(per_situation=6)
    groups = [r["template"] for r in rows]
    train, val = next(
        GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=SEED).split(rows, groups=groups)
    )
    assert {groups[i] for i in train}.isdisjoint({groups[i] for i in val})
    for tr, te in GroupKFold(n_splits=5).split(rows, groups=groups):
        assert {groups[i] for i in tr}.isdisjoint({groups[i] for i in te})


def test_no_hand_written_test_message_is_in_the_training_data():
    rows = make_synthetic_v2.generate()
    texts = {r["text"].strip().lower() for r in rows}
    for name in ("holdout-v1.csv", "holdout-v2.csv"):
        path = ROOT / "evaluation" / name
        if path.exists():
            with path.open(encoding="utf-8") as f:
                held = {r["text"].strip().lower() for r in csv.DictReader(f)}
            assert texts.isdisjoint(held), name


def test_results_report_priority_urgent_recall_and_spam_separately():
    metrics = json.loads((ROOT / "evaluation/results/ml-v2/metrics.json").read_text())
    priority, spam = metrics["priority"], metrics["spam"]
    assert {"accuracy", "weighted_f1"} <= set(priority)
    assert "recall" in priority["per_class"]["urgent"]
    assert {"accuracy", "per_class", "false_positive_rate"} <= set(spam)
    # Priority is scored on honest messages only, so scams do not blur the urgency numbers.
    assert priority["rows"] < spam["rows"]
