"""KaziForce ML service: priority classification and spam detection behind /predict.

The contract (app/schemas.py) is fixed; which classifier answers is chosen by the CLASSIFIER
setting (app/classifiers). The backend waits at most 500 ms for an answer, then uses its own copy
of the same rules.
"""

import logging
import time

from fastapi import FastAPI, Response

from app.classifiers import load_classifier
from app.config import get_settings
from app.schemas import HealthResponse, PredictRequest, PredictResponse

settings = get_settings()
classifier = load_classifier(settings)
logger = logging.getLogger("kaziforce.ml")
logging.basicConfig(level=settings.log_level.upper())

#: A prediction slower than this is written to the log (the backend gives up after 500 ms).
SLOW_MS = 100.0

app = FastAPI(title="KaziForce ML service", version="0.4.0")


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", model_version=classifier.version)


@app.post("/predict", response_model=PredictResponse)
def predict(request: PredictRequest, response: Response) -> PredictResponse:
    started = time.perf_counter()
    answer = classifier.predict(request)
    ms = (time.perf_counter() - started) * 1000
    # How long the model itself took, for latency evidence (BT-23): readable by any client and
    # shown in browser developer tools. Slow ones are also logged.
    response.headers["Server-Timing"] = f"predict;dur={ms:.1f}"
    if ms > SLOW_MS:
        logger.warning("Slow prediction: %.1f ms (model %s)", ms, classifier.version)
    return answer
