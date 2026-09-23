"""KaziForce ML service.

Phase 0: only /health. The /predict endpoint (rule-based classifier behind the contract in
app/schemas.py) arrives in Phase 4.
"""

from fastapi import FastAPI

from app.config import get_settings
from app.schemas import HealthResponse

settings = get_settings()

app = FastAPI(title="KaziForce ML service", version="0.1.0")


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", model_version=settings.model_version)
