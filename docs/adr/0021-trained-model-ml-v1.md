# ADR 0021: Trained model ml-v1 (synthetic data, TF-IDF, trained in the image)

- **Status:** Accepted
- **Date:** 2026-11-08
- **Phase:** 9 (model training), started at Billy's request

## Context

The rule-based classifier (`rules-v1`) reached 63.5% weighted F1 for priority and caught 37% of
scams on the hand-written test set. KaziForce could not share real messages, and the live app
has only test traffic. The local Python on Billy's computer is 32-bit, which scikit-learn does
not support.

## Decision

1. **Synthetic training data** (`training/make_synthetic.py`):
   - 4,060 messages from 68 templates, in English, Kiswahili and Sheng, with honest messages
     that mention money ("hard negatives");
   - written from the label definitions, never from the test set;
   - fixed seed, invented names only.
2. **TF-IDF features** (words, 3–5 letter pieces, message details including deadline buckets
   and the Nairobi hour), shared by training and serving (`app/classifiers/features.py`).
3. **Logistic Regression for priority, Naive Bayes for spam**, each chosen by 5-fold
   cross-validation split by template.
4. **Thresholds** tuned on validation: favour urgent recall, and keep spam precision at least
   95%.
5. **Two guardrails:** a job alert closing within 3 hours is urgent (the written definition);
   anything the rules' scam check blocks stays blocked.
6. **Trained inside the Docker image** (`ml-service/Dockerfile`). Python 3.12 and
   scikit-learn 1.7.2 are pinned, so the library that trains the model also loads it, and no
   model file goes into Git. The server uses `CLASSIFIER=trained` by default; `CLASSIFIER=rules`
   switches back.

## Consequences

- **On the hand-written test (177 messages):**
  - priority weighted F1: 83.1% (rules 63.5%);
  - scams caught: 93.3% (rules 36.7%);
  - honest messages blocked: 2.0% (limit 5%);
  - urgent recall: 71.7% (target 90%, not met).

  Details and limits are in `docs/ml-training.md`.
- New runtime libraries in the ML service: scikit-learn, numpy, scipy, joblib (pinned).
- The server's ML build takes about 2 minutes longer (training).
- Predictions take a median of 19 ms (p95 29 ms), well inside the backend's 500 ms limit; the
  rules fallback is unchanged.
- The backend needs no change beyond describing `ml-*` versions on the Models page
  (`modelRegistry.ts`).
