"""Guards the fixed /predict contract from PRD section 5 against accidental changes."""

import pytest
from pydantic import ValidationError

from app.schemas import PredictRequest, PredictResponse


def test_valid_request_is_accepted():
    request = PredictRequest(
        text="Warehouse packers needed today in Industrial Area",
        type="job_alert",
        recipient_role="worker",
        created_at="2026-09-24T08:30:00+03:00",
        sender_role="business",
        deadline_minutes=45,
    )
    assert request.deadline_minutes == 45


def test_deadline_is_optional():
    request = PredictRequest(
        text="Your application was reviewed",
        type="status_update",
        recipient_role="worker",
        created_at="2026-09-24T08:30:00+03:00",
        sender_role="system",
    )
    assert request.deadline_minutes is None


@pytest.mark.parametrize(
    "overrides",
    [
        {"text": ""},
        {"text": "x" * 1001},
        {"type": "promotion"},
        {"recipient_role": "admin"},
    ],
)
def test_invalid_request_is_rejected(overrides):
    data = {
        "text": "Hello",
        "type": "message",
        "recipient_role": "worker",
        "created_at": "2026-09-24T08:30:00+03:00",
        "sender_role": "business",
        **overrides,
    }
    with pytest.raises(ValidationError):
        PredictRequest(**data)


def test_response_shape():
    response = PredictResponse(
        priority="urgent",
        priority_confidence=0.9,
        is_spam=False,
        spam_score=0.02,
        model_version="rules-v0",
        source="rules",
        explanation=[{"feature": "deadline_minutes<=60", "weight": 1.0}],
    )
    assert set(response.model_dump()) == {
        "priority",
        "priority_confidence",
        "is_spam",
        "spam_score",
        "model_version",
        "source",
        "explanation",
    }
