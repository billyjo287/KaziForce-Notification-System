"""Settings read from environment variables (see .env.example)."""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    model_version: str
    log_level: str


def get_settings() -> Settings:
    return Settings(
        model_version=os.getenv("MODEL_VERSION", "rules-v0"),
        log_level=os.getenv("LOG_LEVEL", "info"),
    )
