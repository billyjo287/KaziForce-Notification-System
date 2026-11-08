# Model training (Phase 9): KaziForce priority and spam model `ml-v1`

Phase 9 started on 8 November 2026. This file covers the training only: what was done, the
results, the limits, and how to present it. The original plan is the "ML Model Training Plan"
section at the end of [requirements-gap.md](requirements-gap.md).

## 1. The result in one table

The final test used 177 messages written by hand in English and Kiswahili, which were never
used for training or tuning (`ml-service/evaluation/holdout-v1.csv`). The ranges are 95%
confidence intervals (2,000 bootstrap resamples).

| Measure | Target | Rules (`rules-v1`, until now) | Trained model (`ml-v1`) |
| --- | --- | --- | --- |
| Priority, weighted F1 | ≥ 85% | 63.5% (55.9–71.2) | **83.1%** (76.3–89.0) |
| Urgent messages caught (urgent recall) | ≥ 90% | 54.3% (40.0–68.6) | **71.7%** (57.9–84.1) |
| Scams caught (spam recall) | ≥ 80% | 36.7% (18.8–54.8) | **93.3%** (82.4–100) |
| Blocked messages that really were scams (spam precision) | ≥ 95% | 100% | **90.3%** (78.6–100) |
| Honest messages blocked (false positives) | < 5% | 0.0% | **2.0%** (0.0–4.7) |
| Spam accuracy | ≥ 95% | 89.3% | **97.2%** (94.4–99.4) |

**In plain words:**
- The trained model is clearly better than the rules on every measure except one: it blocks 3
  honest messages out of 147 (2%), still under the 5% limit.
- It catches 28 of 30 scams instead of 11.
- Priority is correct far more often (weighted F1 from 63.5% to 83.1%).
- Two targets are **not yet met**: urgent recall (71.7% against 90%) and weighted F1 (83.1%
  against 85%, close). Spam precision (90.3%) misses its 95% target, but the stricter "honest
  messages blocked" limit is met.

Full reports, with every wrong answer listed:
- `ml-service/evaluation/results/comparison.md`;
- `ml-service/evaluation/results/ml-v1/report.md`;
- `ml-service/evaluation/results/ml-v1-model-only/report.md`.

## 2. The problem

Two separate decisions, both behind the one `/predict` endpoint (the contract is unchanged):

| Task | Labels | Shown in the app as |
| --- | --- | --- |
| Priority | urgent / medium / low | Act now / Check today / When you're free |
| Spam | spam / not spam | Blocked scam |

**The definitions** (`ml-service/evaluation/LABELLING.md`, written before any model existed):
- **urgent:** act within a few hours (today) or lose something;
- **medium:** within a day or two;
- **low:** no action needed;
- **spam:** asks for money or secrets, or is plainly not a real job.

**What the model sees** (the fixed `/predict` request):
- the title and message text;
- the type (job alert, status update, message, announcement);
- who sent it and who receives it;
- how many minutes until the job closes;
- the time it was created, which is converted to Nairobi time (it arrives in UTC).

## 3. The data: synthetic, because no real messages could be shared

KaziForce could not share real messages, and the live app has only test traffic. So the training
data is **synthetic**: generated from templates by `ml-service/training/make_synthetic.py`.

| | |
| --- | --- |
| Messages | 4,060 (1,000 urgent, 1,000 medium, 900 low, 800 spam, 360 "hard negatives") |
| Templates | 68, each filled with invented names, companies, places, skills, pay, times and phone numbers |
| Languages | English, Kiswahili and Sheng-style mixes ("Tuna-need cleaner leo, doh ni 1,000 bob") |
| Typing variation | Lower case, CAPITALS, missing full stops, short forms ("u", "pls"), added "Asante" |
| Hard negatives | Honest messages that mention M-Pesa, money or a website ("wages paid by M-Pesa after the shift"), so the model does not learn "M-Pesa means scam" |
| Seed | 2026: the same file every time |

**Rules that protect the result:**
1. **The test set is never read by the generator.** The templates were written from the label
   definitions only, so the final test measures something the model has not seen.
2. **No personal data.** Every name, company and phone number is invented. Phone numbers,
   links, money, M-Pesa codes and emails are also replaced by tokens before training (section 4).
3. **Split by template.** Training and validation never share a template, so near-copies cannot
   inflate the validation score.

## 4. Turning a message into numbers (`ml-service/app/classifiers/features.py`)

The same code is used for training and for live predictions, so a message is always read the
same way.

**Cleaning:**
- lower case;
- links become `urltoken` (or `shorturltoken` for bit.ly and similar link shorteners);
- phone numbers become `phonetoken`;
- money (`KSh 1,500`, `2k`, `1,000 bob`) becomes `moneytoken`;
- M-Pesa transaction codes become `mpesacodetoken`;
- emails become `emailtoken`.

**Three groups of features:**
- **words and word pairs** (TF-IDF, 1–2 words);
- **letter pieces** of 3–5 characters (TF-IDF). These cope with Kiswahili and Sheng spellings
  ("haraka", "harakaa") and mixed words without a translator;
- **message details** as tokens:
  - the type, sender and receiver;
  - a deadline bucket (under 1 hour, 1–3 hours, 3–24 hours, 1–2 days, more, none);
  - the Nairobi time of day;
  - "shouting" (mostly capitals) and "!!!".

## 5. The models and why

**Compared:** TF-IDF + **Logistic Regression** and TF-IDF + **Multinomial Naive Bayes**. These
are simple, fast and explainable. They were compared with 5-fold cross-validation, split by
template, on the 80% training part.

| Task | Logistic Regression | Naive Bayes | Chosen |
| --- | --- | --- | --- |
| Priority (macro F1, cross-validation) | **0.600** | 0.548 | Logistic Regression |
| Spam (macro F1, cross-validation) | 0.742 | **0.955** | Naive Bayes |

**Why not a bigger model (for example BERT):**
- there are only a few thousand messages, and all are synthetic;
- the server is a small CPU machine, and `/predict` must answer within 500 ms;
- these models explain themselves: the strongest features are the reasons shown to admins (BT-16).

**Rare classes:**
- Logistic Regression uses balanced class weights;
- the synthetic data deliberately has many urgent and spam messages, so they are not rare
  during training.

SMOTE was not used: it works poorly on text features, and writing more targeted synthetic
messages does the same job more honestly.

**Thresholds** (chosen on the 20% validation part, not on the test):
- **Urgent** when P(urgent) ≥ **0.42**. This is the highest threshold that still found 90% of
  urgent messages, because missing an urgent job is worse than a false alarm.
- **Spam** when P(spam) ≥ **0.20**. This is the lowest threshold whose precision stayed at
  least 95%, because hiding a real message is worse than missing a scam that an admin can still
  review.

**Two guardrails on top** (`ml-v1` = the model plus guardrails):
1. A job alert that closes within **3 hours** is always urgent: the written label definition.
2. Anything the rule-based scam check blocks stays blocked: those rules never blocked an honest
   message (0% false positives).

On this test set the guardrails changed no answer: `ml-v1` and `ml-v1-model-only` score the same.
They stay as a safety net for messages unlike the training data.

## 6. Evaluation details

**Confusion matrix, priority** (147 messages that are not spam; rows = the correct label):

| Correct label \ Predicted | Urgent | Medium | Low |
| --- | ---: | ---: | ---: |
| **Urgent** (46) | 33 | 11 | 2 |
| **Medium** (52) | 0 | 48 | 4 |
| **Low** (49) | 1 | 7 | 41 |

For comparison, the rules got 25, 27 and 41 right.

**Confusion matrix, spam** (177 messages):

| Correct label \ Predicted | Spam | Not spam |
| --- | ---: | ---: |
| **Spam** (30) | 28 | 2 |
| **Not spam** (147) | 3 | 144 |

**By language:**

| | Priority weighted F1 | Spam accuracy |
| --- | ---: | ---: |
| English (117 messages) | 84.6% | 97.4% |
| Kiswahili (60 messages) | 80.2% | 96.7% |

**Where the remaining errors are:**
- **Urgent missed: 13.** Mostly **status updates and direct messages**, more in Kiswahili:
  - status updates: 4 in Kiswahili, 2 in English;
  - messages: 2;
  - announcements: 2;
  - job alerts: 2.

  Job alerts with a near deadline are mostly caught. Urgency carried only by wording ("confirm by
  6 pm", "the shift starts now"), especially in Kiswahili, is the weak spot.
- **Spam errors: 5**, all in direct messages: 3 honest messages blocked and 2 scams missed.

**Honesty notes for the panel:**
- **The test set was used twice:**
  1. the first run;
  2. after the urgent guardrail was set to the written 3-hour definition instead of 60 minutes.

  The second run gave the same numbers. Nothing else was tuned on it.
- **Validation inside the synthetic data looked worse than the real test** (priority weighted F1
  0.50 on templates the model never saw). The 68 templates are few and very different from one
  another, so leaving whole templates out is a hard test. That makes the 83% on hand-written
  messages more believable, not less.
- **The test set is small (177)**, so the ranges are wide (urgent recall 58–84%). Report ranges,
  not just single numbers.

## 7. How it runs in KaziForce

- **Saving:** `ml-service/models/ml-v1.joblib` (both models and both thresholds) and
  `ml-v1.json`, the **model card**: data size and hash, cross-validation and validation scores,
  thresholds, and library versions (Python 3.12, scikit-learn 1.7.2).
- **Training happens while the Docker image builds** (`ml-service/Dockerfile`, about 2 minutes,
  fixed seed). The versions that train the model are the versions that load it, and no model
  file is stored in Git.
- **Serving:** `CLASSIFIER=trained` (`app/classifiers/trained.py`).
  - It answers with the same `PredictResponse` as the rules: `source: "ml"`,
    `model_version: "ml-v1"`, and an `explanation` with the strongest reasons, e.g. `meta:dl_1to3h`
    (closes in 1–3 hours) and `word:tonight`.
  - The server uses it by default (`deploy/azure/docker-compose.yml`); `CLASSIFIER=rules` in
    `deploy/azure/.env` switches back.
- **Speed** (measured 8 November on Billy's laptop in Docker, 60 warm predictions):
  - median **19 ms**, 95th percentile **29 ms**, slowest 51 ms (first, cold prediction 26 ms);
  - the plan's target was under 20 ms at the 95th percentile, so it is slightly over, but far
    below the backend's 500 ms limit;
  - every answer carries `Server-Timing: predict;dur=…`.
- **If the model is slow or down:** nothing new is needed. The backend already falls back to the
  same rules after 500 ms and records `predictionSource = rules_fallback`.
- **Versioning:** every notification stores `modelVersion` (`ml-v1`) and `predictionSource`. The
  backend registers `ml-v1` in the `MLMetadata` table, and the admin **Models** page shows it.
  Fallbacks no longer flip the active model (BT-13).

## 8. Feedback loop and retraining (with real data, after the defence)

**Labels that the app now collects** (BT-14, BT-15):
- admin priority checks, including "the model was right";
- spam review decisions;
- "This was urgent for me";
- "Not important to me", with a reason.

The admin training export marks each label's source: `priority_label_source` and
`spam_label_source` are `admin` (checked by a person) or `model`.

**Retraining:**
- Add real `admin`-labelled rows (anonymised export) to the synthetic data; weak user labels count
  less.
- Retrain monthly, or after 200 new human labels.
- Promote a new model only if urgent recall and the false-positive rate do not get worse on the
  fixed test set plus a fresh slice of real checked messages.
- Versions go `ml-v2`, `ml-v3`, and so on; old ones are kept for rollback.

## 9. Limitations and risks (to discuss with the panel)

- **Synthetic data only:** the model learns the templates' style. This is mitigated by:
  - splitting by template;
  - testing only on hand-written messages;
  - the guardrails;
  - planning to retrain on real, checked messages.
- **Small test set:** wide confidence intervals; don't over-claim.
- **Urgent recall is below target:** urgency carried only by wording (status updates and
  messages, especially Kiswahili) is missed. Next step: more urgent status-update and message
  templates in Kiswahili and Sheng.
- **Label subjectivity:** "urgent" depends on the person. The written definitions and
  "This was urgent for me" help over time.
- **Fairness:**
  - Honest employers who write informally could be flagged as scams. Blocked items always go to
    a person (spam review), never deleted.
  - The false-positive limit is met.
  - Kiswahili scores slightly lower than English, so it is watched separately.
- **Drift and scammers:** wording changes ("f33", "reg fee"). Letter pieces, the rules
  guardrail, admin review and retraining help.
- **Privacy:** the model never sees real personal data. Training text is synthetic, and tokens
  replace numbers, links and money.

## 10. How to run it

```bash
# from ml-service/ (Docker, Python 3.12)
docker build -t kaziforce-ml-service .     # builds the service and trains ml-v1 inside it
docker run --rm --user root -v "$PWD:/app" -w /app kaziforce-ml-service python -m training.train
docker run --rm --user root -v "$PWD:/app" -w /app kaziforce-ml-service python -m training.evaluate_models
```

Tests: `docker run --rm --user root -v "$PWD:/app" -w /app kaziforce-ml-service python -m pytest`.
73 pass, including `tests/test_trained.py`: the contract, a fee scam is caught and says why,
the guardrail, and the fixed seed.

## 11. For the presentation tomorrow (about 5 minutes, 5 slides)

1. **Problem:** "Every alert looked the same, so urgent jobs got lost and scams got through."
   Two decisions: priority (Act now / Check today / When you're free) and scam or not.
2. **Data:**
   - "KaziForce could not share messages, so I generated 4,060 synthetic ones from 68 templates,
     in English, Kiswahili and Sheng, with honest messages that mention M-Pesa so the model does
     not learn 'M-Pesa means scam'."
   - "No real personal data."
3. **Model:**
   - "TF-IDF on words, letter pieces (for Kiswahili and Sheng spellings) and message details
     such as how soon the job closes."
   - "Logistic Regression for priority, Naive Bayes for spam, each chosen by cross-validation."
   - "Thresholds favour catching urgent jobs, and never blocking honest messages."
4. **Results (the table in section 1):**
   - "Tested on 177 hand-written messages it never saw."
   - "Priority F1 from 63% to 83%, scams caught from 37% to 93%, honest messages blocked 2%."
   - Show the live demo: an urgent job alert gets `ml-v1`, "urgent", and its reasons.
5. **Honest limits and next steps:**
   - "Urgent recall is 72% against a 90% target. The misses are urgent status updates and
     Kiswahili messages."
   - "Next: more of those examples, then real messages checked by admins: the app already
     collects them, with 'This was urgent for me'."

**Likely questions:**
- *Why synthetic data?* No real data could be shared. The test set is hand-written and kept
  separate, and the plan is to retrain on real admin-checked messages.
- *Why not deep learning?* Small data, a CPU server, the 500 ms limit, and explanations.
- *Did you tune on the test set?* No. Thresholds were chosen on validation. The test was run
  twice, the second time only to align a guardrail with the written definition (same numbers).
- *What if the model fails?* The backend uses the rules after 500 ms. It is already built and
  tested (`rules_fallback`).

## 12. Task list

- [x] Synthetic data generator (EN, SW, Sheng; hard negatives; fixed seed; never reads the test)
- [x] Feature code shared by training and serving
- [x] Training: Logistic Regression vs Naive Bayes, cross-validation by template, thresholds
- [x] Final test with confidence intervals, compared with the rules
- [x] `TrainedClassifier` behind `/predict`, with explanations and guardrails; tests
- [x] Trained inside the Docker image; the server uses `CLASSIFIER=trained` by default
- [x] Speed measured (median 19 ms, p95 29 ms)
- [ ] Deploy: push, then `bash deploy/azure/update.sh` on the server (the build takes about 2 minutes longer)
- [ ] More urgent status-update and message templates in Kiswahili and Sheng, then retrain (`ml-v2`; the test is used once more, after)
- [ ] Show the model card scores on the admin Models page (today it shows counts only)
- [ ] With real data: the export with `label_source = admin`, retraining, monitoring per language
