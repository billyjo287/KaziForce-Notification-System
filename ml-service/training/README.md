# training/ (Phase 9: model ml-v1)

Everything about the model (why, data, results, limits, how to present it) is in
[docs/ml-training.md](../../docs/ml-training.md). This file only says what each script does.

| Script | What it does | Output |
| --- | --- | --- |
| `make_synthetic.py` | Makes about 4,000 synthetic notifications (English, Kiswahili, Sheng; urgent, medium, low, spam and honest "hard negatives") from templates, with a fixed seed. Never reads the evaluation set. | `data/synthetic-v1.csv` |
| `train.py` | Splits by template, compares Logistic Regression and Naive Bayes (5-fold cross-validation), tunes the urgent and spam thresholds, then trains the final models on all the synthetic data. | `models/ml-v1.joblib`, `models/ml-v1.json` (model card) |
| `evaluate_models.py` | The final test: rules-v1, the model alone and the model with guardrails, on the 177 hand-written messages, with 95% confidence intervals. | `evaluation/results/<version>/`, `evaluation/results/comparison.md` |
| `evaluate_baseline.py` | The Sprint II baseline scorer (rules only); its metric code is shared. | `evaluation/results/rules-v1/` |

## Run it

The service runs on Python 3.12 with scikit-learn (see `requirements.txt`). On Billy's computer,
use Docker (the local Python is 32-bit, which scikit-learn does not support):

```bash
# from ml-service/
docker build -t kaziforce-ml-service .          # also trains the model inside the image
docker run --rm --user root -v "$PWD:/app" -w /app kaziforce-ml-service python -m training.train
docker run --rm --user root -v "$PWD:/app" -w /app kaziforce-ml-service python -m training.evaluate_models
```

Switching `/predict` to the model is a setting only: `CLASSIFIER=trained` (the server's
`deploy/azure/docker-compose.yml` uses it by default; `CLASSIFIER=rules` in `deploy/azure/.env`
goes back). Nothing outside `/ml-service` changes; the backend records `ml-v1` on every
notification and in the `MLMetadata` table.
