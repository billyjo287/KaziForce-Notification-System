"""The one interface every classifier implements.

/predict only ever talks to a `Classifier`, so the rule-based classifier (now) and a trained model
(Phase 9) are interchangeable: which one answers is chosen by the CLASSIFIER setting alone.
"""

from typing import Protocol

from app.schemas import PredictRequest, PredictResponse


class Classifier(Protocol):
    #: Stored on every notification and registered in the MLMetadata table, e.g. "rules-v0".
    version: str

    def predict(self, request: PredictRequest) -> PredictResponse:
        """Priority (urgent/medium/low) and spam verdict for one notification."""
        ...
