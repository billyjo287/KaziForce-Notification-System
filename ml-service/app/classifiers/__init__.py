"""Chooses the classifier behind /predict from the CLASSIFIER setting.

    CLASSIFIER=rules    the rule-based classifier v0 (default, used until Phase 9)
    CLASSIFIER=trained  a trained model loaded from MODEL_PATH (Phase 9; see trained.py)

Adding a trained model later means adding it to CLASSIFIERS and changing the setting: nothing
outside /ml-service changes, because every classifier answers with the same PredictResponse.
"""

from collections.abc import Callable

from app.classifiers.base import Classifier
from app.config import Settings


def _rules(_settings: Settings) -> Classifier:
    from app.classifiers.rule_based import RuleBasedClassifier

    return RuleBasedClassifier()


def _trained(settings: Settings) -> Classifier:
    from app.classifiers.trained import TrainedClassifier

    return TrainedClassifier(settings.model_path)


CLASSIFIERS: dict[str, Callable[[Settings], Classifier]] = {
    "rules": _rules,
    "trained": _trained,
}


def load_classifier(settings: Settings) -> Classifier:
    try:
        factory = CLASSIFIERS[settings.classifier]
    except KeyError:
        choices = ", ".join(CLASSIFIERS)
        raise ValueError(
            f"Unknown CLASSIFIER {settings.classifier!r}; use one of: {choices}"
        ) from None
    return factory(settings)


__all__ = ["Classifier", "load_classifier"]
