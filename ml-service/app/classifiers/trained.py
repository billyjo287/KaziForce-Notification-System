"""The trained classifier (Phase 9, docs/ml-training.md): CLASSIFIER=trained.

Loads models/ml-v1.joblib (made by training/train.py) and answers /predict with exactly the same
PredictResponse as the rules, with source="ml". Two small safety rules sit on top of the model
("guardrails", explained in docs/ml-training.md):

  - a job alert that closes within 3 hours is always urgent (the written label definition,
    evaluation/LABELLING.md: "a job that closes within 3 hours ... is urgent");
  - a message the rule-based scam check blocks is blocked (those rules never blocked an honest
    message in the evaluation: 0% false positives), so the model only ADDS caught scams.

`guardrails=False` gives the model alone (used to report both in the evaluation).
The explanation lists the words and signals that pushed the model most towards its answer.
"""

from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np

from app.classifiers.rule_based import RuleBasedClassifier
from app.schemas import ExplanationItem, PredictRequest, PredictResponse

#: A job alert closing this soon is urgent, whatever the model says (LABELLING.md).
URGENT_DEADLINE_MINUTES = 180

DEFAULT_MODEL = Path(__file__).resolve().parents[2] / "models" / "ml-v1.joblib"


def _feature_names(pipeline) -> list[str]:
    union = pipeline.named_steps["features"]
    names: list[str] = []
    for name, branch in union.transformer_list:
        vocab = branch.named_steps["vec"].get_feature_names_out()
        names.extend(f"{name}:{v}" for v in vocab)
    return names


def _top_reasons(
    pipeline, names: list[str], row: dict, cls, prefix: str = ""
) -> list[ExplanationItem]:
    """The features of this message that pushed the model most towards class `cls`."""
    x = pipeline.named_steps["features"].transform([row])
    model = pipeline.named_steps["model"]
    classes = list(model.classes_)
    k = classes.index(cls)
    if hasattr(model, "coef_"):
        weights = model.coef_[0] if len(classes) == 2 else model.coef_[k]
        if len(classes) == 2 and k == 0:
            weights = -weights
    else:  # Naive Bayes: how much more likely each feature is in this class than the others
        log = model.feature_log_prob_
        weights = log[k] - np.delete(log, k, axis=0).mean(axis=0)
    x = x.tocsr()
    contributions = [
        (names[j], float(v * weights[j])) for j, v in zip(x.indices, x.data, strict=True)
    ]
    contributions.sort(key=lambda item: item[1], reverse=True)
    return [
        ExplanationItem(feature=f"{prefix}{name}", weight=round(w, 3))
        for name, w in contributions[:4]
        if w > 0
    ]


class TrainedClassifier:
    def __init__(self, model_path: str | None = None, guardrails: bool = True) -> None:
        path = Path(model_path) if model_path else DEFAULT_MODEL
        if path.is_dir():
            path = path / "ml-v1.joblib"
        if not path.exists():
            raise RuntimeError(
                f"No trained model at {path}. "
                "Run: python -m training.train (see docs/ml-training.md)."
            )
        bundle = joblib.load(path)
        self.priority = bundle["priority"]
        self.spam = bundle["spam"]
        self.urgent_threshold = float(bundle["urgent_threshold"])
        self.spam_threshold = float(bundle["spam_threshold"])
        self.guardrails = guardrails
        self.version = bundle["version"] if guardrails else f"{bundle['version']}-model-only"
        self._priority_names = _feature_names(self.priority)
        self._spam_names = _feature_names(self.spam)
        self._rules = RuleBasedClassifier() if guardrails else None

    def predict(self, request: PredictRequest) -> PredictResponse:
        row = request.model_dump(mode="json")

        # ----- spam -----
        spam_classes = list(self.spam.classes_)
        spam_score = float(self.spam.predict_proba([row])[0][spam_classes.index(True)])
        is_spam = spam_score >= self.spam_threshold
        explanation: list[ExplanationItem] = []
        rules_answer = self._rules.predict(request) if self._rules else None
        if rules_answer and rules_answer.is_spam and not is_spam:
            is_spam = True
            spam_score = max(spam_score, rules_answer.spam_score)
            explanation.extend(
                ExplanationItem(feature=f"guardrail:{e.feature}", weight=e.weight)
                for e in rules_answer.explanation
                if e.feature.startswith("spam:")
            )
        if is_spam:
            explanation = (
                _top_reasons(self.spam, self._spam_names, row, True, "spam:") + explanation
            )

        # ----- priority -----
        classes = list(self.priority.classes_)
        proba = self.priority.predict_proba([row])[0]
        p = dict(zip(classes, (float(v) for v in proba), strict=True))
        if p["urgent"] >= self.urgent_threshold:
            priority = "urgent"
        else:
            priority = "medium" if p["medium"] >= p["low"] else "low"
        confidence = p[priority]
        deadline = request.deadline_minutes
        if (
            self.guardrails
            and priority != "urgent"
            and request.type == "job_alert"
            and deadline is not None
            and deadline <= URGENT_DEADLINE_MINUTES
        ):
            priority = "urgent"
            confidence = max(confidence, 0.9)
            explanation.append(
                ExplanationItem(feature="guardrail:closes_within_3_hours", weight=1.0)
            )
        explanation = _top_reasons(self.priority, self._priority_names, row, priority) + explanation

        return PredictResponse(
            priority=priority,
            priority_confidence=round(min(max(confidence, 0.0), 1.0), 3),
            is_spam=is_spam,
            spam_score=round(min(max(spam_score, 0.0), 1.0), 3),
            model_version=self.version,
            source="ml",
            explanation=explanation[:10],
        )
