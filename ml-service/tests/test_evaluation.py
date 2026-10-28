"""The baseline evaluation (training/evaluate_baseline.py): metrics checked by hand, and the
hand-written evaluation set kept valid and balanced."""

import pytest

from app.classifiers.rule_based import RuleBasedClassifier
from training.evaluate_baseline import (
    PRIORITIES,
    confusion,
    evaluate,
    load_rows,
    spam_summary,
    summary,
    to_request,
)


def test_confusion_and_scores_match_a_hand_calculation():
    truth = ["urgent", "urgent", "medium", "low", "low", "low"]
    predicted = ["urgent", "low", "medium", "low", "low", "medium"]
    assert confusion(truth, predicted, PRIORITIES) == [[1, 0, 1], [0, 1, 0], [0, 1, 2]]

    result = summary(truth, predicted, PRIORITIES)
    assert result["accuracy"] == pytest.approx(4 / 6)
    urgent = result["per_class"]["urgent"]
    assert (urgent["precision"], urgent["recall"]) == (1.0, 0.5)
    assert urgent["f1"] == pytest.approx(2 / 3)
    low = result["per_class"]["low"]
    assert (low["precision"], low["recall"]) == (pytest.approx(2 / 3), pytest.approx(2 / 3))
    # weighted F1 = (2/3*2 + 2/3*1 + 2/3*3) / 6
    assert result["weighted_f1"] == pytest.approx(2 / 3)


def test_spam_false_positive_rate_counts_honest_messages_blocked():
    truth = [True, True, False, False, False, False]
    predicted = [True, False, True, False, False, False]
    result = spam_summary(truth, predicted)
    assert result["false_positive_rate"] == pytest.approx(1 / 4)
    assert result["per_class"]["True"]["recall"] == 0.5


def test_the_evaluation_set_is_valid_balanced_and_bilingual():
    rows = load_rows()
    assert len(rows) >= 150
    for row in rows:
        to_request(row)  # every row is a valid /predict request
        assert row["priority"] in PRIORITIES
        assert row["why"], f"row {row['id']} has no reason for its label"
    honest = [r for r in rows if not r["is_spam"]]
    counts = {p: sum(r["priority"] == p for r in honest) for p in PRIORITIES}
    assert min(counts.values()) >= 0.25 * len(honest), counts  # no class under a quarter
    assert sum(r["is_spam"] for r in rows) >= 25
    assert sum(r["language"] == "sw" for r in rows) >= 0.25 * len(rows)
    assert len({r["text"] for r in rows}) == len(rows), "duplicate messages"


def test_rules_v0_baseline_is_scored_on_every_row():
    rows = load_rows()
    results = evaluate(RuleBasedClassifier(), rows)
    assert results["model_version"] == "rules-v1"
    assert results["priority"]["rows"] == sum(not r["is_spam"] for r in rows)
    assert results["spam"]["rows"] == len(rows)
    assert 0 <= results["priority"]["weighted_f1"] <= 1
    # Each listed mistake really is a mistake.
    for m in results["mistakes"]:
        wrong_spam = m["label_spam"] != m["predicted_spam"]
        assert wrong_spam or m["label_priority"] != m["predicted_priority"]
