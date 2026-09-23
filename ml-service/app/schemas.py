"""The fixed /predict contract (PRD section 5).

The rule-based classifier (Phase 4) and the trained models (Phase 9) both answer with exactly
these shapes, so swapping one for the other changes nothing outside /ml-service.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

NotificationType = Literal["job_alert", "status_update", "message", "announcement"]
RecipientRole = Literal["worker", "business"]
SenderRole = Literal["business", "worker", "admin", "system"]
Priority = Literal["urgent", "medium", "low"]
PredictionSource = Literal["rules", "ml"]


class PredictRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
    type: NotificationType
    recipient_role: RecipientRole
    created_at: datetime
    sender_role: SenderRole
    deadline_minutes: int | None = None


class ExplanationItem(BaseModel):
    feature: str
    weight: float


class PredictResponse(BaseModel):
    priority: Priority
    priority_confidence: float = Field(ge=0, le=1)
    is_spam: bool
    spam_score: float = Field(ge=0, le=1)
    model_version: str
    source: PredictionSource
    explanation: list[ExplanationItem] = []


class HealthResponse(BaseModel):
    status: Literal["ok"]
    model_version: str
