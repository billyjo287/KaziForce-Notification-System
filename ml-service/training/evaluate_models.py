"""The final test (Phase 9, docs/ml-training.md): rules vs trained model on the hand-written set.

    python -m training.evaluate_models

Scores three classifiers on evaluation/holdout-v1.csv (177 hand-written messages, English and
Kiswahili, never used for training or tuning):
    rules-v1            the rule-based classifier in use until now
    ml-v1-model-only    the trained models alone
    ml-v1               the trained models + two guardrails (what /predict serves)
Writes evaluation/results/<version>/{metrics.json, report.md} for each (same format as the
Sprint II baseline) and evaluation/results/comparison.md with 95% bootstrap confidence intervals
(the set is small: one message is about half a percentage point).
"""

from __future__ import annotations

import json
import platform
import random
from datetime import datetime, timezone

from app.classifiers.rule_based import RULES_FILE, RuleBasedClassifier
from app.classifiers.trained import DEFAULT_MODEL, TrainedClassifier
from training.evaluate_baseline import (
    DATASET,
    RESULTS,
    ROOT,
    evaluate,
    load_rows,
    pct,
    report,
    sha256,
    to_request,
)

BOOTSTRAP = 2000
SEED = 7


def answers_of(classifier, rows):
    return [classifier.predict(to_request(r)) for r in rows]


def metrics(rows, answers) -> dict:
    """The four headline numbers, computed directly (also used for the bootstrap)."""
    pairs = [(r, a) for r, a in zip(rows, answers, strict=True) if not r["is_spam"]]
    urgent = [(r, a) for r, a in pairs if r["priority"] == "urgent"]
    urgent_recall = sum(a.priority == "urgent" for _, a in urgent) / len(urgent) if urgent else 0.0
    # weighted F1 over urgent/medium/low
    f1s, total = 0.0, len(pairs)
    for label in ("urgent", "medium", "low"):
        tp = sum(r["priority"] == label and a.priority == label for r, a in pairs)
        pred = sum(a.priority == label for _, a in pairs)
        sup = sum(r["priority"] == label for r, _ in pairs)
        p = tp / pred if pred else 0.0
        rc = tp / sup if sup else 0.0
        f1 = 2 * p * rc / (p + rc) if p + rc else 0.0
        f1s += f1 * sup
    weighted_f1 = f1s / total if total else 0.0
    spam_true = [r["is_spam"] for r in rows]
    spam_pred = [a.is_spam for a in answers]
    tp = sum(t and p for t, p in zip(spam_true, spam_pred, strict=True))
    fp = sum((not t) and p for t, p in zip(spam_true, spam_pred, strict=True))
    fn = sum(t and not p for t, p in zip(spam_true, spam_pred, strict=True))
    tn = sum((not t) and not p for t, p in zip(spam_true, spam_pred, strict=True))
    return {
        "urgent_recall": urgent_recall,
        "priority_weighted_f1": weighted_f1,
        "spam_recall": tp / (tp + fn) if tp + fn else 0.0,
        "spam_precision": tp / (tp + fp) if tp + fp else 1.0,
        "spam_false_positive_rate": fp / (fp + tn) if fp + tn else 0.0,
        "spam_accuracy": (tp + tn) / len(rows),
    }


def bootstrap(rows, answers) -> dict:
    rng = random.Random(SEED)
    n = len(rows)
    samples: dict[str, list[float]] = {}
    for _ in range(BOOTSTRAP):
        idx = [rng.randrange(n) for _ in range(n)]
        m = metrics([rows[i] for i in idx], [answers[i] for i in idx])
        for k, v in m.items():
            samples.setdefault(k, []).append(v)
    out = {}
    for k, values in samples.items():
        values.sort()
        out[k] = (values[int(0.025 * BOOTSTRAP)], values[int(0.975 * BOOTSTRAP) - 1])
    return out


TARGETS = {
    "urgent_recall": (">= 90%", lambda v: v >= 0.90),
    "priority_weighted_f1": (">= 85%", lambda v: v >= 0.85),
    "spam_recall": (">= 80%", lambda v: v >= 0.80),
    "spam_precision": (">= 95%", lambda v: v >= 0.95),
    "spam_false_positive_rate": ("< 5%", lambda v: v < 0.05),
    "spam_accuracy": (">= 95%", lambda v: v >= 0.95),
}
NAMES = {
    "urgent_recall": "Urgent recall (urgent messages caught)",
    "priority_weighted_f1": "Priority, weighted F1",
    "spam_recall": "Spam recall (scams caught)",
    "spam_precision": "Spam precision (blocked that really were scams)",
    "spam_false_positive_rate": "Honest messages blocked",
    "spam_accuracy": "Spam accuracy",
}


def main() -> None:
    rows = load_rows()
    classifiers = [
        RuleBasedClassifier(),
        TrainedClassifier(str(DEFAULT_MODEL), guardrails=False),
        TrainedClassifier(str(DEFAULT_MODEL), guardrails=True),
    ]
    run = {
        "run_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "dataset": DATASET.relative_to(ROOT).as_posix(),
        "dataset_sha256": sha256(DATASET),
        "rules_sha256": sha256(RULES_FILE),
        "model_sha256": sha256(DEFAULT_MODEL),
        "rows": len(rows),
        "python": platform.python_version(),
    }
    table = {}
    for c in classifiers:
        results = evaluate(c, rows)
        folder = RESULTS / results["model_version"]
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "metrics.json").write_text(
            json.dumps({"run": run, **results}, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        (folder / "report.md").write_text(report(results, run), encoding="utf-8")
        answers = answers_of(c, rows)
        table[c.version] = (metrics(rows, answers), bootstrap(rows, answers))

    versions = list(table)
    lines = [
        "# Rules vs trained model on the hand-written test set",
        "",
        f"{len(rows)} hand-written messages (`{run['dataset']}`), never used for training or "
        "tuning. Ranges are 95% bootstrap confidence intervals "
        f"({BOOTSTRAP} resamples). Run: {run['run_at']}.",
        "",
        "| Measure | Target | " + " | ".join(versions) + " |",
        "| --- | --- | " + " | ".join("---" for _ in versions) + " |",
    ]
    for key, name in NAMES.items():
        target, ok = TARGETS[key]
        cells = []
        for v in versions:
            value, (lo, hi) = table[v][0][key], table[v][1][key]
            mark = "✅" if ok(value) else "❌"
            cells.append(f"{mark} **{pct(value)}** ({pct(lo)}–{pct(hi)})")
        lines.append(f"| {name} | {target} | " + " | ".join(cells) + " |")
    lines += [
        "",
        "- **rules-v1**: the rule-based classifier (Sprint II).",
        "- **ml-v1-model-only**: TF-IDF + the chosen model, trained on synthetic data only.",
        "- **ml-v1**: the same model with two guardrails (a job alert closing within 3 hours is "
        "urgent, as the label definition says; anything the rule-based scam check blocks stays "
        "blocked). This is what "
        "`CLASSIFIER=trained` serves.",
        "",
        "Every wrong answer is listed in each version's `report.md`.",
        "",
    ]
    (RESULTS / "comparison.md").write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
