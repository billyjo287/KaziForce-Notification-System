"""The trained classifier (Phase 9): same contract as the rules, and its guardrails work.

A small model is trained on the spot from the synthetic generator (version 2), so these tests do
not need models/ml-v2.joblib to exist.
"""

import joblib
import pytest

from app.classifiers.trained import TrainedClassifier
from app.schemas import PredictRequest, PredictResponse
from training import make_synthetic, make_synthetic_v2, train


@pytest.fixture(scope="module")
def model_path(tmp_path_factory):
    rows = make_synthetic_v2.generate(per_situation=6)
    priority_rows = [r for r in rows if not r["is_spam"]]
    bundle = {
        "version": "ml-test",
        "priority": train.build("logreg").fit(
            train.requests_of(priority_rows), [r["priority"] for r in priority_rows]
        ),
        "spam": train.build("logreg").fit(train.requests_of(rows), [r["is_spam"] for r in rows]),
        "urgent_threshold": 0.4,
        "spam_threshold": 0.6,
    }
    path = tmp_path_factory.mktemp("models") / "ml-v2.joblib"
    joblib.dump(bundle, path)
    return path


def request(**overrides) -> PredictRequest:
    base = {
        "text": "Application reviewed\nNeema Catering looked at your application.",
        "type": "status_update",
        "recipient_role": "worker",
        "sender_role": "business",
        "created_at": "2026-11-08T07:00:00Z",
        "deadline_minutes": None,
    }
    return PredictRequest(**{**base, **overrides})


def test_answers_with_the_fixed_contract(model_path):
    answer = TrainedClassifier(str(model_path)).predict(request())
    assert isinstance(answer, PredictResponse)
    assert answer.source == "ml"
    assert answer.model_version == "ml-test"
    assert answer.priority in {"urgent", "medium", "low"}
    assert 0 <= answer.priority_confidence <= 1 and 0 <= answer.spam_score <= 1
    assert answer.explanation, "the model says why"


def test_a_fee_request_is_spam_and_says_why(model_path):
    answer = TrainedClassifier(str(model_path)).predict(
        request(
            type="job_alert",
            text="Jobs in Dubai\nPay KES 1,500 registration fee to 0712345678 to secure it!!!",
            deadline_minutes=600,
        )
    )
    assert answer.is_spam
    assert any(
        e.feature.startswith("spam:") or e.feature.startswith("guardrail:spam")
        for e in answer.explanation
    )


def test_guardrail_a_job_closing_within_3_hours_is_urgent(model_path):
    text = "Cleaner needed in Karen\nTumaini Cleaners needs a cleaner. Pay KSh 1,000."
    guarded = TrainedClassifier(str(model_path)).predict(
        request(type="job_alert", text=text, deadline_minutes=150)
    )
    assert guarded.priority == "urgent"


def test_model_only_version_is_named_so(model_path):
    assert TrainedClassifier(str(model_path), guardrails=False).version == "ml-test-model-only"


def test_missing_model_says_how_to_make_one(tmp_path):
    with pytest.raises(RuntimeError, match="training.train"):
        TrainedClassifier(str(tmp_path / "nothing.joblib"))


def test_synthetic_data_has_no_real_people_and_keeps_templates():
    rows = make_synthetic.generate(
        counts={"urgent": 20, "medium": 20, "low": 20, "spam": 20}, hard_each=2
    )
    assert all(r["template"] for r in rows)
    assert {r["language"] for r in rows} >= {"en", "sw", "sh"}
    # Same seed, same data.
    again = make_synthetic.generate(
        counts={"urgent": 20, "medium": 20, "low": 20, "spam": 20}, hard_each=2
    )
    assert rows == again


def test_generator_v2_has_150_situations_three_languages_and_hard_negatives():
    situations = make_synthetic_v2.SITUATIONS
    assert len(situations) >= 150
    assert len({s.id for s in situations}) == len(situations), "situation ids are unique"
    assert {s.label for s in situations} == {"urgent", "medium", "low", "spam"}
    assert sum(s.hard for s in situations) >= 12
    for s in situations:
        assert s.en and s.sw and s.sh, f"{s.id} is written in all three languages"
        if s.type == "job_alert":
            assert s.deadline, f"{s.id}: a job alert needs a deadline range"
    rows = make_synthetic_v2.generate(per_situation=3)
    assert rows == make_synthetic_v2.generate(per_situation=3), "same seed, same data"
    assert {r["language"] for r in rows} == {"en", "sw", "sh"}
    # Job-alert labels agree with the written rules (LABELLING.md): urgent closes within a day of
    # starting, low closes in more than 2 days.
    for r in rows:
        if r["type"] == "job_alert" and not r["is_spam"]:
            if r["priority"] == "low":
                assert r["deadline_minutes"] > 2880
            if r["priority"] == "urgent":
                assert r["deadline_minutes"] <= 600
