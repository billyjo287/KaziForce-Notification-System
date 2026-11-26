# models/

Saved (serialised) models, e.g. `ml-v2.joblib` and its model card `ml-v2.json`, made by `python -m training.train` (the Docker image runs it at build). Not kept in Git.
Ignored by Git except this README. Each model version is also registered in the `MLMetadata` table
with its training date and metrics.
