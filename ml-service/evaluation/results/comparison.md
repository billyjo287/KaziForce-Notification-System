# Rules vs trained model on the hand-written test set

177 hand-written messages (`evaluation/holdout-v1.csv`), never used for training. For ml-v2 this set was a practice check only (it was looked at while building the generator); the final test is holdout-v2. Ranges are 95% bootstrap confidence intervals (2000 resamples). Run: 2026-11-26 18:12 UTC.

| Measure | Target | rules-v1 | ml-v2-model-only | ml-v2 |
| --- | --- | --- | --- | --- |
| Urgent recall (urgent messages caught) | >= 90% | ❌ **54.3%** (40.0%–68.6%) | ✅ **91.3%** (82.1%–98.0%) | ✅ **91.3%** (82.1%–98.0%) |
| Priority, weighted F1 | >= 85% | ❌ **63.5%** (55.9%–71.2%) | ✅ **92.5%** (88.1%–96.5%) | ✅ **92.5%** (88.1%–96.5%) |
| Spam recall (scams caught) | >= 80% | ❌ **36.7%** (18.8%–54.8%) | ✅ **96.7%** (88.9%–100.0%) | ✅ **96.7%** (88.9%–100.0%) |
| Spam precision (blocked that really were scams) | >= 95% | ✅ **100.0%** (100.0%–100.0%) | ✅ **96.7%** (88.9%–100.0%) | ✅ **96.7%** (88.9%–100.0%) |
| Honest messages blocked | < 5% | ✅ **0.0%** (0.0%–0.0%) | ✅ **0.7%** (0.0%–2.1%) | ✅ **0.7%** (0.0%–2.1%) |
| Spam accuracy | >= 95% | ❌ **89.3%** (84.2%–93.8%) | ✅ **98.9%** (97.2%–100.0%) | ✅ **98.9%** (97.2%–100.0%) |

- **rules-v1**: the rule-based classifier (Sprint II).
- **ml-v2-model-only**: TF-IDF + the chosen model, trained on synthetic data only.
- **ml-v2**: the same model with two guardrails (a job alert closing within 3 hours is urgent, as the label definition says; anything the rule-based scam check blocks stays blocked). This is what `CLASSIFIER=trained` serves.

Every wrong answer is listed in each version's `report.md`.
