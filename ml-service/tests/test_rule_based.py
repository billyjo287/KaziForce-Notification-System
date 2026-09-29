"""Rule-based classifier v0 against 28 example messages (English and Kiswahili, real alert wording
and fake-job scams). The same file is used by the backend's fallback tests, so both give exactly
the same answers."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.classifiers import load_classifier
from app.classifiers.rule_based import RuleBasedClassifier, normalize
from app.config import Settings
from app.main import app
from app.schemas import PredictRequest

EXAMPLES = json.loads(
    (Path(__file__).parent / "fixtures" / "rules_v0_examples.json").read_text(encoding="utf-8")
)
classifier = RuleBasedClassifier()
client = TestClient(app)


def test_there_are_at_least_20_examples_with_scams_and_kiswahili():
    assert len(EXAMPLES) >= 20
    assert sum(e["expected"]["is_spam"] for e in EXAMPLES) >= 5
    assert sum("Kiswahili" in e["name"] for e in EXAMPLES) >= 5


@pytest.mark.parametrize("example", EXAMPLES, ids=[e["name"] for e in EXAMPLES])
def test_example(example):
    result = classifier.predict(PredictRequest(**example["request"])).model_dump()
    assert result == example["expected"]


@pytest.mark.parametrize("example", EXAMPLES[:5] + EXAMPLES[-8:], ids=lambda e: e["name"])
def test_predict_endpoint_answers_the_same(example):
    response = client.post("/predict", json=example["request"])
    assert response.status_code == 200
    assert response.json() == example["expected"]


def test_answer_says_which_rules_fired():
    scam = next(e for e in EXAMPLES if e["name"].startswith("Scam: registration fee"))
    features = [
        item["feature"]
        for item in client.post("/predict", json=scam["request"]).json()["explanation"]
    ]
    assert "spam:payment_request:registration fee,send ksh" in features
    assert "spam:excessive_punctuation" in features


def test_every_answer_is_labelled_rules_v0():
    response = client.post("/predict", json=EXAMPLES[0]["request"])
    body = response.json()
    assert body["model_version"] == "rules-v0"
    assert body["source"] == "rules"
    assert client.get("/health").json()["model_version"] == "rules-v0"


def test_bad_request_is_refused():
    response = client.post("/predict", json={"text": "", "type": "message"})
    assert response.status_code == 422


def test_words_are_matched_whole_not_inside_other_words():
    # "leo" (today) must not match inside "Leonard"; "t.co" must not match "best.company.co.ke".
    request = PredictRequest(
        text="Leonard sent directions: https://best.company.co.ke/map",
        type="message",
        recipient_role="worker",
        created_at="2026-10-02T09:00:00+03:00",
        sender_role="business",
    )
    result = classifier.predict(request)
    assert result.priority == "medium"
    features = [item.feature for item in result.explanation]
    assert "spam:link_shortener" not in features
    assert "spam:suspicious_link" in features


def test_normalize():
    assert (
        normalize("CONGRATULATIONS!!! You're hired, M-Pesa")
        == " congratulations you re hired m pesa "
    )


def test_classifier_is_chosen_by_setting_only():
    rules = load_classifier(Settings(classifier="rules", model_path=None, log_level="info"))
    assert rules.version == "rules-v0"
    with pytest.raises(RuntimeError, match="Phase 9"):
        load_classifier(
            Settings(classifier="trained", model_path="models/x.joblib", log_level="info")
        )
    with pytest.raises(ValueError, match="Unknown CLASSIFIER"):
        load_classifier(Settings(classifier="magic", model_path=None, log_level="info"))
