# Rules vs trained model on the hand-written test set

177 hand-written messages (`evaluation/holdout-v1.csv`), never used for training or tuning. Ranges are 95% bootstrap confidence intervals (2000 resamples). Run: 2026-11-08 11:27 UTC.

| Measure | Target | rules-v1 | ml-v1-model-only | ml-v1 |
| --- | --- | --- | --- | --- |
| Urgent recall (urgent messages caught) | >= 90% | ❌ **54.3%** (40.0%–68.6%) | ❌ **71.7%** (57.9%–84.1%) | ❌ **71.7%** (57.9%–84.1%) |
| Priority, weighted F1 | >= 85% | ❌ **63.5%** (55.9%–71.2%) | ❌ **83.1%** (76.3%–89.0%) | ❌ **83.1%** (76.3%–89.0%) |
| Spam recall (scams caught) | >= 80% | ❌ **36.7%** (18.8%–54.8%) | ✅ **93.3%** (82.4%–100.0%) | ✅ **93.3%** (82.4%–100.0%) |
| Spam precision (blocked that really were scams) | >= 95% | ✅ **100.0%** (100.0%–100.0%) | ❌ **90.3%** (78.6%–100.0%) | ❌ **90.3%** (78.6%–100.0%) |
| Honest messages blocked | < 5% | ✅ **0.0%** (0.0%–0.0%) | ✅ **2.0%** (0.0%–4.7%) | ✅ **2.0%** (0.0%–4.7%) |
| Spam accuracy | >= 95% | ❌ **89.3%** (84.2%–93.8%) | ✅ **97.2%** (94.4%–99.4%) | ✅ **97.2%** (94.4%–99.4%) |

- **rules-v1**: the rule-based classifier (Sprint II).
- **ml-v1-model-only**: TF-IDF + the chosen model, trained on synthetic data only.
- **ml-v1**: the same model with two guardrails (a job alert closing within 3 hours is urgent, as the label definition says; anything the rule-based scam check blocks stays blocked). This is what `CLASSIFIER=trained` serves.

Every wrong answer is listed in each version's `report.md`.
