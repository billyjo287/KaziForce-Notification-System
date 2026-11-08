"""Trains the priority classifier and the spam detector (Phase 9, docs/ml-training.md).

    python -m training.train            # writes models/ml-v1.joblib and models/ml-v1.json

Steps:
  1. Make the synthetic data (training/make_synthetic.py), also saved to data/synthetic-v1.csv.
  2. Split it 80/20 BY TEMPLATE (validation messages come from templates the model never saw).
  3. Compare two models with 5-fold cross-validation (also by template) on the 80%:
       TF-IDF + Logistic Regression  and  TF-IDF + Multinomial Naive Bayes.
     Keep the better one for each task (macro F1).
  4. Choose the decision thresholds on the 20%:
       urgent: the highest threshold that still finds 90% of urgent messages (recall first:
               missing an urgent job is worse than a false alarm);
       spam:   the lowest threshold whose precision is at least 95% (never hide real messages).
  5. Train the chosen models on ALL the synthetic data and save them with a model card (data
     hash, sizes, cross-validation and validation scores, thresholds, library versions).

The hand-written evaluation set (evaluation/holdout-v1.csv) is not used here at all: it is the
final test (training/evaluate_models.py).
"""

from __future__ import annotations

import hashlib
import json
import platform
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import sklearn
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score, precision_score, recall_score
from sklearn.model_selection import GroupKFold, GroupShuffleSplit
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import FeatureUnion, Pipeline
from sklearn.preprocessing import FunctionTransformer

from app.classifiers import features
from training import make_synthetic

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / "models"
VERSION = "ml-v1"
SEED = 2026
PRIORITIES = ["urgent", "medium", "low"]
URGENT_RECALL_TARGET = 0.90
SPAM_PRECISION_TARGET = 0.95


def build(kind: str) -> Pipeline:
    """Words (1-2), letter pieces (3-5, copes with Kiswahili/Sheng spellings) and meta tokens."""
    union = FeatureUnion(
        [
            (
                "word",
                Pipeline(
                    [
                        ("get", FunctionTransformer(features.texts)),
                        ("vec", TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True)),
                    ]
                ),
            ),
            (
                "char",
                Pipeline(
                    [
                        ("get", FunctionTransformer(features.texts)),
                        (
                            "vec",
                            TfidfVectorizer(
                                analyzer="char_wb", ngram_range=(3, 5), min_df=3, sublinear_tf=True
                            ),
                        ),
                    ]
                ),
            ),
            (
                "meta",
                Pipeline(
                    [
                        ("get", FunctionTransformer(features.metas)),
                        (
                            "vec",
                            TfidfVectorizer(token_pattern=r"\S+", lowercase=False, use_idf=False),
                        ),
                    ]
                ),
            ),
        ]
    )
    if kind == "logreg":
        model = LogisticRegression(class_weight="balanced", C=4.0, max_iter=3000, random_state=SEED)
    else:
        model = MultinomialNB(alpha=0.3)
    return Pipeline([("features", union), ("model", model)])


def requests_of(rows: list[dict]) -> list[dict]:
    keys = ["text", "type", "sender_role", "recipient_role", "created_at", "deadline_minutes"]
    return [{k: r[k] for k in keys} for r in rows]


def cross_validate(rows: list[dict], labels: list, kind: str) -> float:
    """Mean macro F1 over 5 folds, split by template."""
    groups = [r["template"] for r in rows]
    scores = []
    for train_idx, test_idx in GroupKFold(n_splits=5).split(rows, labels, groups):
        model = build(kind).fit(
            requests_of([rows[i] for i in train_idx]), [labels[i] for i in train_idx]
        )
        predicted = model.predict(requests_of([rows[i] for i in test_idx]))
        scores.append(f1_score([labels[i] for i in test_idx], predicted, average="macro"))
    return float(np.mean(scores))


def urgent_threshold(model: Pipeline, rows: list[dict], labels: list[str]) -> tuple[float, dict]:
    """Highest threshold with urgent recall >= target (else the one with the best recall)."""
    proba = model.predict_proba(requests_of(rows))
    classes = list(model.classes_)
    p_urgent = proba[:, classes.index("urgent")]
    truth = np.array(labels) == "urgent"
    best = None
    for t in np.round(np.arange(0.05, 0.91, 0.01), 2):
        recall = float((p_urgent[truth] >= t).mean()) if truth.any() else 0.0
        if recall >= URGENT_RECALL_TARGET:
            best = float(t)
    if best is None:
        best = 0.05
    predicted = predict_priority(proba, classes, best)
    return best, {
        "urgent_recall": recall_score(labels, predicted, labels=["urgent"], average="macro"),
        "weighted_f1": f1_score(labels, predicted, average="weighted"),
    }


def predict_priority(proba: np.ndarray, classes: list[str], threshold: float) -> list[str]:
    """Urgent when P(urgent) >= threshold; otherwise the likelier of medium and low."""
    iu, im, il = (classes.index(c) for c in ("urgent", "medium", "low"))
    out = []
    for p in proba:
        if p[iu] >= threshold:
            out.append("urgent")
        else:
            out.append("medium" if p[im] >= p[il] else "low")
    return out


def spam_threshold(model: Pipeline, rows: list[dict], labels: list[bool]) -> tuple[float, dict]:
    """Lowest threshold with spam precision >= target (catches the most spam safely)."""
    proba = model.predict_proba(requests_of(rows))[:, list(model.classes_).index(True)]
    truth = np.array(labels)
    chosen = 0.95
    for t in np.round(np.arange(0.95, 0.19, -0.01), 2):
        predicted = proba >= t
        if predicted.sum() == 0:
            continue
        if precision_score(truth, predicted, zero_division=0) >= SPAM_PRECISION_TARGET:
            chosen = float(t)
    predicted = proba >= chosen
    return chosen, {
        "precision": float(precision_score(truth, predicted, zero_division=0)),
        "recall": float(recall_score(truth, predicted, zero_division=0)),
    }


def sha256_rows(rows: list[dict]) -> str:
    digest = hashlib.sha256()
    for r in rows:
        digest.update(json.dumps(r, sort_keys=True, default=str).encode())
    return digest.hexdigest()


def main() -> None:
    rows = make_synthetic.generate()
    make_synthetic.main()  # also keep the CSV for inspection
    split = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=SEED)
    groups = [r["template"] for r in rows]
    train_idx, val_idx = next(split.split(rows, groups=groups))
    train = [rows[i] for i in train_idx]
    val = [rows[i] for i in val_idx]

    card: dict = {
        "version": VERSION,
        "trained_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "data": {
            "source": "synthetic (training/make_synthetic.py, seed 2026); no real messages",
            "rows": len(rows),
            "spam_rows": sum(r["is_spam"] for r in rows),
            "templates": len(set(groups)),
            "train_rows": len(train),
            "validation_rows": len(val),
            "sha256": sha256_rows(rows),
        },
        "libraries": {
            "python": platform.python_version(),
            "scikit-learn": sklearn.__version__,
            "numpy": np.__version__,
        },
    }

    # ----- priority (messages that are not spam) -----
    p_train = [r for r in train if not r["is_spam"]]
    p_val = [r for r in val if not r["is_spam"]]
    p_labels = [r["priority"] for r in p_train]
    cv = {kind: cross_validate(p_train, p_labels, kind) for kind in ("logreg", "naive_bayes")}
    p_kind = max(cv, key=cv.get)
    p_model = build(p_kind).fit(requests_of(p_train), p_labels)
    t_urgent, p_val_scores = urgent_threshold(p_model, p_val, [r["priority"] for r in p_val])
    card["priority"] = {
        "cv_macro_f1": cv,
        "chosen": p_kind,
        "urgent_threshold": t_urgent,
        "validation": p_val_scores,
    }

    # ----- spam (every message) -----
    s_labels = [r["is_spam"] for r in train]
    cv_s = {kind: cross_validate(train, s_labels, kind) for kind in ("logreg", "naive_bayes")}
    s_kind = max(cv_s, key=cv_s.get)
    s_model = build(s_kind).fit(requests_of(train), s_labels)
    t_spam, s_val_scores = spam_threshold(s_model, val, [r["is_spam"] for r in val])
    card["spam"] = {
        "cv_macro_f1": cv_s,
        "chosen": s_kind,
        "spam_threshold": t_spam,
        "validation": s_val_scores,
    }

    # ----- final models on ALL synthetic data, same choices and thresholds -----
    all_priority = [r for r in rows if not r["is_spam"]]
    priority_final = build(p_kind).fit(
        requests_of(all_priority), [r["priority"] for r in all_priority]
    )
    spam_final = build(s_kind).fit(requests_of(rows), [r["is_spam"] for r in rows])

    MODELS.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "version": VERSION,
            "priority": priority_final,
            "spam": spam_final,
            "urgent_threshold": t_urgent,
            "spam_threshold": t_spam,
        },
        MODELS / f"{VERSION}.joblib",
    )
    (MODELS / f"{VERSION}.json").write_text(json.dumps(card, indent=2) + "\n", encoding="utf-8")

    print(
        f"{VERSION} trained on {len(rows)} synthetic messages "
        f"({card['data']['templates']} templates)"
    )
    print(
        f"  priority: {p_kind}, CV macro F1 {cv[p_kind]:.3f}, urgent threshold {t_urgent}, "
        f"validation urgent recall {p_val_scores['urgent_recall']:.3f}"
    )
    print(
        f"  spam: {s_kind}, CV macro F1 {cv_s[s_kind]:.3f}, threshold {t_spam}, "
        f"validation precision {s_val_scores['precision']:.3f} recall {s_val_scores['recall']:.3f}"
    )
    print(f"  saved models/{VERSION}.joblib and models/{VERSION}.json")


if __name__ == "__main__":
    main()
