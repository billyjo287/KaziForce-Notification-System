"""KaziForce ML service: priority classification and spam detection behind /predict.

The contract (app/schemas.py) is fixed; which classifier answers is chosen by the CLASSIFIER
setting (app/classifiers). The backend waits at most 500 ms for an answer, then uses its own copy
of the same rules.
"""

from fastapi import FastAPI

from app.classifiers import load_classifier
from app.config import get_settings
from app.schemas import HealthResponse, PredictRequest, PredictResponse

settings = get_settings()
classifier = load_classifier(settings)

app = FastAPI(title="KaziForce ML service", version="0.4.0")


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", model_version=classifier.version)


@app.post("/predict", response_model=PredictResponse)
def predict(request: PredictRequest) -> PredictResponse:
    return classifier.predict(request)
