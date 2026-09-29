"""Settings read from environment variables (see .env.example)."""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    #: Which classifier answers /predict: "rules" (now) or "trained" (Phase 9).
    classifier: str
    #: Where the trained model files are (only used when classifier is "trained").
    model_path: str | None
    log_level: str


def get_settings() -> Settings:
    return Settings(
        classifier=os.getenv("CLASSIFIER", "rules"),
        model_path=os.getenv("MODEL_PATH") or None,
        log_level=os.getenv("LOG_LEVEL", "info"),
    )
