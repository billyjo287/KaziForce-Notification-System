"""Scores a classifier on the hand-written evaluation set (Sprint II baseline; Phase 9 reuses it).

    python -m training.evaluate_baseline            # from ml-service/, scores rules-v0

Reads evaluation/holdout-v1.csv (labels: evaluation/LABELLING.md), asks the classifier for each
row exactly as /predict would, and writes:
    evaluation/results/<model_version>/metrics.json   every number, plus run details
    evaluation/results/<model_version>/report.md      the same as readable tables, with every
                                                      wrong answer and the reason for its label

The set is used ONLY for evaluation: nothing is trained or tuned on it. Metrics follow the
proposal (section 3.2.4) and PRD success criteria: weighted F1 for priority (target >= 85%),
spam accuracy (>= 95%) and spam false positive rate (< 5%). Priority is scored on rows that are
not spam (spam is blocked, so its priority never matters).
"""

from __future__ import annotations

import csv
import hashlib
import json
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path

from app.classifiers.base import Classifier
from app.classifiers.rule_based import RULES_FILE, RuleBasedClassifier
from app.schemas import PredictRequest

ROOT = Path(__file__).resolve().parent.parent
DATASET = ROOT / "evaluation" / "holdout-v1.csv"
RESULTS = ROOT / "evaluation" / "results"
PRIORITIES = ["urgent", "medium", "low"]
SPAM_LABELS = [True, False]

TARGET_WEIGHTED_F1 = 0.85
TARGET_SPAM_ACCURACY = 0.95
TARGET_SPAM_FPR = 0.05


# ---------- metrics (plain Python, so the numbers are easy to check by hand) ----------


def confusion(truth: list, predicted: list, labels: list) -> list[list[int]]:
    """matrix[i][j] = how many rows labelled labels[i] were predicted as labels[j]."""
    index = {label: i for i, label in enumerate(labels)}
    matrix = [[0] * len(labels) for _ in labels]
    for t, p in zip(truth, predicted, strict=True):
        matrix[index[t]][index[p]] += 1
    return matrix


def per_class(matrix: list[list[int]], labels: list) -> dict:
    """Precision, recall, F1 and support (number of true rows) for each label."""
    scores = {}
    for i, label in enumerate(labels):
        tp = matrix[i][i]
        predicted = sum(row[i] for row in matrix)
        support = sum(matrix[i])
        precision = tp / predicted if predicted else 0.0
        recall = tp / support if support else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        scores[str(label)] = {
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "support": support,
        }
    return scores


def summary(truth: list, predicted: list, labels: list) -> dict:
    matrix = confusion(truth, predicted, labels)
    classes = per_class(matrix, labels)
    total = len(truth)
    correct = sum(matrix[i][i] for i in range(len(labels)))
    weighted_f1 = sum(c["f1"] * c["support"] for c in classes.values()) / total if total else 0.0
    macro_f1 = sum(c["f1"] for c in classes.values()) / len(labels)
    return {
        "rows": total,
        "accuracy": correct / total if total else 0.0,
        "weighted_f1": weighted_f1,
        "macro_f1": macro_f1,
        "per_class": classes,
        "labels": [str(label) for label in labels],
        "confusion_matrix": matrix,
    }


def spam_summary(truth: list[bool], predicted: list[bool]) -> dict:
    result = summary(truth, predicted, SPAM_LABELS)
    tn = result["confusion_matrix"][1][1]
    fp = result["confusion_matrix"][1][0]
    result["false_positive_rate"] = fp / (fp + tn) if fp + tn else 0.0
    return result


# ---------- evaluation ----------


def load_rows(path: Path = DATASET) -> list[dict]:
    with path.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    for row in rows:
        row["is_spam"] = row["is_spam"] == "true"
        row["deadline_minutes"] = int(row["deadline_minutes"]) if row["deadline_minutes"] else None
    return rows


def to_request(row: dict) -> PredictRequest:
    return PredictRequest(
        text=row["text"],
        type=row["type"],
        recipient_role=row["recipient_role"],
        sender_role=row["sender_role"],
        created_at=row["created_at"],
        deadline_minutes=row["deadline_minutes"],
    )


def evaluate(classifier: Classifier, rows: list[dict]) -> dict:
    answers = [classifier.predict(to_request(row)) for row in rows]
    pairs = list(zip(rows, answers, strict=True))
    honest = [(row, a) for row, a in pairs if not row["is_spam"]]

    def priority_for(subset):
        truth = [r["priority"] for r, _ in subset]
        return summary(truth, [a.priority for _, a in subset], PRIORITIES)

    results = {
        "model_version": answers[0].model_version if answers else "unknown",
        "priority": priority_for(honest),
        "spam": spam_summary([r["is_spam"] for r in rows], [a.is_spam for a in answers]),
        "by_language": {
            lang: {
                "priority": priority_for([(r, a) for r, a in honest if r["language"] == lang]),
                "spam": spam_summary(
                    [r["is_spam"] for r in rows if r["language"] == lang],
                    [a.is_spam for r, a in pairs if r["language"] == lang],
                ),
            }
            for lang in sorted({r["language"] for r in rows})
        },
        "mistakes": [
            {
                "id": int(row["id"]),
                "language": row["language"],
                "type": row["type"],
                "text": row["text"],
                "label_priority": row["priority"],
                "predicted_priority": answer.priority,
                "label_spam": row["is_spam"],
                "predicted_spam": answer.is_spam,
                "why": row["why"],
                "explanation": [e.feature for e in answer.explanation],
            }
            for row, answer in zip(rows, answers, strict=True)
            if row["is_spam"] != answer.is_spam
            or (not row["is_spam"] and row["priority"] != answer.priority)
        ],
    }
    results["targets"] = {
        "priority_weighted_f1": {
            "target": TARGET_WEIGHTED_F1,
            "met": results["priority"]["weighted_f1"] >= TARGET_WEIGHTED_F1,
        },
        "spam_accuracy": {
            "target": TARGET_SPAM_ACCURACY,
            "met": results["spam"]["accuracy"] >= TARGET_SPAM_ACCURACY,
        },
        "spam_false_positive_rate": {
            "target": TARGET_SPAM_FPR,
            "met": results["spam"]["false_positive_rate"] < TARGET_SPAM_FPR,
        },
    }
    return results


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


# ---------- report ----------


def pct(x: float) -> str:
    return f"{x * 100:.1f}%"


def matrix_table(result: dict, names: dict[str, str]) -> str:
    labels = result["labels"]
    head = "| Labelled \\ Predicted | " + " | ".join(names[label] for label in labels) + " |"
    lines = [head, "| --- |" + " ---: |" * len(labels)]
    for label, row in zip(labels, result["confusion_matrix"], strict=True):
        lines.append(f"| **{names[label]}** | " + " | ".join(str(v) for v in row) + " |")
    return "\n".join(lines)


def class_table(result: dict, names: dict[str, str]) -> str:
    lines = ["| Class | Precision | Recall | F1 | Rows |", "| --- | ---: | ---: | ---: | ---: |"]
    for label, s in result["per_class"].items():
        lines.append(
            f"| {names[label]} | {pct(s['precision'])} | {pct(s['recall'])} | {pct(s['f1'])} "
            f"| {s['support']} |"
        )
    return "\n".join(lines)


def report(results: dict, run: dict) -> str:
    p, s = results["priority"], results["spam"]
    prio_names = {"urgent": "Urgent", "medium": "Important", "low": "For later"}
    spam_names = {"True": "Spam", "False": "Not spam"}
    t = results["targets"]

    def yes(met: bool) -> str:
        return "met" if met else "**not met**"

    out = [
        f"# Baseline evaluation: {results['model_version']}",
        "",
        "Generated by `python -m training.evaluate_baseline` (do not edit by hand).",
        f"Run {run['run_at']} · dataset `{run['dataset']}` "
        f"(SHA-256 `{run['dataset_sha256'][:12]}…`, {run['rows']} rows) · "
        f"rules file SHA-256 `{run['rules_sha256'][:12]}…` · Python {run['python']}.",
        "",
        "## Against the targets (proposal 3.4.5, PRD success criteria)",
        "",
        "| Measure | Result | Target | |",
        "| --- | ---: | ---: | --- |",
        f"| Priority, weighted F1 | {pct(p['weighted_f1'])} | ≥ 85% "
        f"| {yes(t['priority_weighted_f1']['met'])} |",
        f"| Spam, accuracy | {pct(s['accuracy'])} | ≥ 95% | {yes(t['spam_accuracy']['met'])} |",
        f"| Spam, false positive rate (honest messages blocked) | {pct(s['false_positive_rate'])} "
        f"| < 5% | {yes(t['spam_false_positive_rate']['met'])} |",
        "",
        f"## Priority ({p['rows']} messages that are not spam)",
        "",
        f"Accuracy {pct(p['accuracy'])} · weighted F1 {pct(p['weighted_f1'])} · "
        f"macro F1 {pct(p['macro_f1'])}",
        "",
        class_table(p, prio_names),
        "",
        matrix_table(p, prio_names),
        "",
        f"## Spam ({s['rows']} messages)",
        "",
        f"Accuracy {pct(s['accuracy'])} · false positive rate {pct(s['false_positive_rate'])}",
        "",
        class_table(s, spam_names),
        "",
        matrix_table(s, spam_names),
        "",
        "## By language",
        "",
        "| Language | Priority rows | Priority weighted F1 | Spam rows | Spam accuracy "
        "| Spam recall |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for lang, r in results["by_language"].items():
        out.append(
            f"| {'English' if lang == 'en' else 'Kiswahili'} | {r['priority']['rows']} "
            f"| {pct(r['priority']['weighted_f1'])} | {r['spam']['rows']} "
            f"| {pct(r['spam']['accuracy'])} | {pct(r['spam']['per_class']['True']['recall'])} |"
        )
    out += [
        "",
        f"## Every wrong answer ({len(results['mistakes'])})",
        "",
        "| # | Lang | Type | Message (first line) | Label | Predicted | Why labelled so "
        "| Rules used |",
        "| ---: | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for m in results["mistakes"]:
        label = "spam" if m["label_spam"] else prio_names[m["label_priority"]]
        predicted = "spam" if m["predicted_spam"] else prio_names[m["predicted_priority"]]
        first = m["text"].split("\n")[0].replace("|", "/")
        out.append(
            f"| {m['id']} | {m['language']} | {m['type']} | {first} | {label} | {predicted} "
            f"| {m['why']} | {', '.join(m['explanation']) or '-'} |"
        )
    out.append("")
    return "\n".join(out)


def main() -> None:
    classifier = RuleBasedClassifier()
    rows = load_rows()
    results = evaluate(classifier, rows)
    run = {
        "run_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "dataset": DATASET.relative_to(ROOT).as_posix(),
        "dataset_sha256": sha256(DATASET),
        "rules_sha256": sha256(RULES_FILE),
        "rows": len(rows),
        "python": platform.python_version(),
    }
    folder = RESULTS / results["model_version"]
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "metrics.json").write_text(
        json.dumps({"run": run, **results}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (folder / "report.md").write_text(report(results, run), encoding="utf-8")

    p, s = results["priority"], results["spam"]
    print(f"{results['model_version']} on {len(rows)} hand-written messages:")
    print(f"  priority weighted F1 {pct(p['weighted_f1'])} (target 85%)")
    print(f"  spam accuracy {pct(s['accuracy'])} (target 95%)")
    print(f"  honest messages blocked {pct(s['false_positive_rate'])} (target under 5%)")
    print(f"  report: {(folder / 'report.md').relative_to(ROOT).as_posix()}")


if __name__ == "__main__":
    sys.exit(main())
