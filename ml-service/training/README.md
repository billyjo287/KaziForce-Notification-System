# training/ (Phase 9: not started)

Training and evaluation scripts for the spam detector and the priority classifier. **Nothing is
trained yet.** Until Phase 9 (which starts only when Billy says so), /predict is answered by the
rule-based classifier `rules-v0` (`app/classifiers/rule_based.py`).

## What Phase 9 will add here

1. `make_synthetic.py`: balanced synthetic notifications (English and Kiswahili, including
   fake-job scams) to add to the anonymised export (PRD DR-7: synthetic data or SMOTE).
2. `train.py`: TF-IDF text features + one-hot type/role/hour features (PRD DR-6), a priority
   classifier and a spam detector (scikit-learn), saved with joblib to `../models/`.
3. `evaluate.py`: weighted F1 for priority (target 85% or more), spam accuracy (95% or more) and
   false positive rate (under 5%), compared with `rules-v0` on the same test set. The results
   are stored in the `MLMetadata` table with the model version.
4. SHAP explanations for the admin dashboard (PRD NFR-6).

## Where the data comes from

- The admin-only anonymised CSV export (Phase 7): every notification's text, type, roles, hour,
  the classifier's answer, delivery and interaction times ("opened", "Not important to me"),
  and admin corrections (`correctedPriority`, `correctedSpam`), which are the training labels.
  User IDs are replaced with random tokens; no names, phones or emails.
- `../tests/fixtures/rules_v0_examples.json`: 28 labelled examples that any trained model must
  also get right before it replaces the rules.

## Switching to a trained model (no code changes outside /ml-service)

Implement `app/classifiers/trained.py`, then set `CLASSIFIER=trained` and `MODEL_PATH` in
`ml-service/.env`. The /predict contract stays the same; the backend records the new
`model_version` on every notification and registers it in `MLMetadata` automatically.
