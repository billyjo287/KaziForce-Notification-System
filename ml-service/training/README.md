# training/ (model ml-v2; ml-v1 was Phase 9)

Everything about the model (why, data, results, limits, how to present it) is in
[docs/ml-training.md](../../docs/ml-training.md). This file only says what each script does.

| Script | What it does | Output |
| --- | --- | --- |
| `make_synthetic_v2.py` | ml-v2 data: 151 written-out situations (42 urgent, 43 medium, 34 low, 32 spam), each worded in English, Kiswahili and Sheng, with typos, short forms and honest "hard negatives"; 5,436 messages with a fixed seed. Never reads any evaluation set. | `data/synthetic-v2.csv` |
| `make_synthetic.py` | ml-v1 data (kept for comparison): about 4,000 synthetic notifications (English, Kiswahili, Sheng; urgent, medium, low, spam and honest "hard negatives") from templates, with a fixed seed. Never reads the evaluation set. | `data/synthetic-v1.csv` |
| `train.py` | Splits by situation, compares Logistic Regression and Naive Bayes (grouped 5-fold cross-validation), tunes the urgent and spam thresholds, then trains the final models on all the synthetic data. | `models/ml-v2.joblib`, `models/ml-v2.json` (model card) |
| `evaluate_models.py` | Scores rules-v1, the model alone and the model with guardrails on a hand-written set, with 95% confidence intervals. Default: holdout-v1 (a practice set for ml-v2). `--dataset evaluation/holdout-v2.csv` is the final test. | `evaluation/results/[<set>/]<version>/`, `comparison.md` |
| `import_holdout_v2.py` | Turns the volunteers' Google Form answers (CSV) into `evaluation/holdout-v2.csv`, without changing their words or labels. | `evaluation/holdout-v2.csv` |
| `diagnostics.py` | Health check: overfitting gap, grouped vs random cross-validation, learning curve, regularisation, nearest-neighbour leakage, results by language. Read-only. | printed JSON |
| `evaluate_baseline.py` | The Sprint II baseline scorer (rules only); its metric code is shared. | `evaluation/results/rules-v1/` |

## Run it

The service runs on Python 3.12 with scikit-learn (see `requirements.txt`). On Billy's computer,
use Docker (the local Python is 32-bit, which scikit-learn does not support):

```bash
# from ml-service/
docker build -t kaziforce-ml-service .          # also trains the model inside the image
docker run --rm --user root -v "$PWD:/app" -w /app kaziforce-ml-service python -m training.train
docker run --rm --user root -v "$PWD:/app" -w /app kaziforce-ml-service python -m training.evaluate_models
# final test, once, when the volunteers are done:
docker run --rm --user root -v "$PWD:/app" -w /app kaziforce-ml-service python -m training.import_holdout_v2 responses.csv
docker run --rm --user root -v "$PWD:/app" -w /app kaziforce-ml-service python -m training.evaluate_models --dataset evaluation/holdout-v2.csv
```

Switching `/predict` to the model is a setting only: `CLASSIFIER=trained` (the server's
`deploy/azure/docker-compose.yml` uses it by default; `CLASSIFIER=rules` in `deploy/azure/.env`
goes back). Nothing outside `/ml-service` changes; the backend records `ml-v2` on every
notification and in the `MLMetadata` table.
