"""Placeholder for the trained classifier (Phase 9). Nothing is trained or loaded yet.

In Phase 9 this class will load the saved models from MODEL_PATH (joblib files produced by
ml-service/training, e.g. models/priority-ml-v1.joblib and models/spam-ml-v1.joblib), and
`predict` will return the same PredictResponse as the rules, with source="ml" and explanation
from SHAP. Switching to it is then a setting only: CLASSIFIER=trained and MODEL_PATH=...
"""

from app.schemas import PredictRequest, PredictResponse


class TrainedClassifier:
    version = "not-trained"

    def __init__(self, model_path: str | None) -> None:
        raise RuntimeError(
            "No trained model exists yet: training happens in Phase 9. "
            f"Keep CLASSIFIER=rules for now (MODEL_PATH was {model_path!r})."
        )

    def predict(self, request: PredictRequest) -> PredictResponse:  # pragma: no cover
        raise NotImplementedError
