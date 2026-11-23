"""Model health check for ml-v1: is it overfitting or underfitting, and does it work in both
languages? Read-only: it trains copies of the models on the synthetic data and never changes
models/ or the test set.

Run from ml-service/:  python -m training.diagnostics

What it reports (docs/ml-training.md, section "Model health check"):
1. Fit on the training data itself vs unseen templates (the overfitting gap).
2. Random 5-fold vs template-grouped 5-fold cross-validation (memorising templates vs learning).
3. A learning curve: more templates -> better unseen-template score?
4. A regularisation sweep (C for logistic regression, alpha for Naive Bayes).
5. How close each test message is to its nearest training message (leakage check).
6. Results by language on the hand-written test set.

Only steps 1-4 are used for decisions; the test set (step 5-6) is reported, never tuned on.
"""

from __future__ import annotations

import collections
import json

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import f1_score
from sklearn.model_selection import GroupKFold, GroupShuffleSplit, KFold

from app.classifiers import features
from app.classifiers.trained import TrainedClassifier
from training import make_synthetic
from training.evaluate_baseline import load_rows, to_request
from training.train import SEED, build, requests_of


def _fit_score(kind, tr_rows, tr_y, te_rows, te_y, params=None):
    model = build(kind)
    if params:
        model.set_params(**params)
    model.fit(requests_of(tr_rows), tr_y)
    return f1_score(te_y, model.predict(requests_of(te_rows)), average="macro")


def _cv(kind, rows, labels, splitter, groups=None, params=None):
    scores = []
    for a, b in splitter.split(rows, labels, groups):
        scores.append(
            _fit_score(
                kind,
                [rows[i] for i in a],
                [labels[i] for i in a],
                [rows[i] for i in b],
                [labels[i] for i in b],
                params,
            )
        )
    return round(float(np.mean(scores)), 3), round(float(np.std(scores)), 3)


def main() -> None:
    rows = make_synthetic.generate()
    groups_all = [r["template"] for r in rows]
    tr_idx, _ = next(
        GroupShuffleSplit(1, test_size=0.2, random_state=SEED).split(rows, groups=groups_all)
    )
    train = [rows[i] for i in tr_idx]
    out: dict = {"languages_in_training": dict(collections.Counter(r["language"] for r in train))}

    tasks = {
        "priority": ("logreg", [r for r in train if not r["is_spam"]], lambda r: r["priority"]),
        "spam": ("naive_bayes", train, lambda r: r["is_spam"]),
    }
    for task, (kind, data, label) in tasks.items():
        y = [label(r) for r in data]
        g = [r["template"] for r in data]
        res: dict = {}
        res["train_fit_macro_f1"] = round(_fit_score(kind, data, y, data, y), 3)
        res["random_5fold"] = _cv(kind, data, y, KFold(5, shuffle=True, random_state=SEED))
        res["template_grouped_5fold"] = _cv(kind, data, y, GroupKFold(5), g)
        # learning curve over the number of templates (grouped folds, smaller training parts)
        templates = sorted(set(g))
        rng = np.random.default_rng(SEED)
        curve = {}
        for frac in (0.4, 0.6, 0.8, 1.0):
            keep = set(rng.permutation(templates)[: max(5, int(len(templates) * frac))])
            sub = [r for r in data if r["template"] in keep]
            curve[f"{int(frac * 100)}% of templates ({len(keep)})"] = _cv(
                kind, sub, [label(r) for r in sub], GroupKFold(5), [r["template"] for r in sub]
            )
        res["learning_curve_grouped"] = curve
        sweep = {}
        grid = (
            ({"model__C": c} for c in (0.1, 0.5, 1.0, 4.0, 16.0))
            if kind == "logreg"
            else ({"model__alpha": a} for a in (0.03, 0.1, 0.3, 1.0, 3.0))
        )
        for params in grid:
            sweep[str(list(params.values())[0])] = _cv(kind, data, y, GroupKFold(5), g, params)
        res["regularisation_sweep_grouped"] = sweep
        out[task] = res

    # leakage check: nearest training message for every test message (character TF-IDF cosine)
    test = load_rows()
    vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True)
    a = vec.fit_transform(features.texts(requests_of(rows)))
    b = vec.transform(features.texts([to_request(r).model_dump(mode="json") for r in test]))
    nearest = (b @ a.T).max(axis=1).toarray().ravel()
    out["test_nearest_training_similarity"] = {
        "median": round(float(np.median(nearest)), 3),
        "share_above_0.9": round(float((nearest > 0.9).mean()), 3),
        "max": round(float(nearest.max()), 3),
    }

    # by language on the hand-written test (report only)
    clf = TrainedClassifier()
    by_lang: dict = {}
    for lang in ("en", "sw"):
        sub = [r for r in test if r["language"] == lang]
        ans = [clf.predict(to_request(r)) for r in sub]
        legit = [(r, x) for r, x in zip(sub, ans, strict=True) if not r["is_spam"]]
        urg = [(r, x) for r, x in legit if r["priority"] == "urgent"]
        spam = [(r, x) for r, x in zip(sub, ans, strict=True) if r["is_spam"]]
        honest = [(r, x) for r, x in zip(sub, ans, strict=True) if not r["is_spam"]]
        by_lang[lang] = {
            "messages": len(sub),
            "priority_weighted_f1": round(
                f1_score(
                    [r["priority"] for r, _ in legit],
                    [x.priority for _, x in legit],
                    average="weighted",
                ),
                3,
            ),
            "urgent_recall": f"{sum(x.priority == 'urgent' for _, x in urg)}/{len(urg)}",
            "scams_caught": f"{sum(x.is_spam for _, x in spam)}/{len(spam)}",
            "honest_blocked": f"{sum(x.is_spam for _, x in honest)}/{len(honest)}",
        }
    out["test_by_language"] = by_lang
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
