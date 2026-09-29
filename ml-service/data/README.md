# data/ (Phase 9: empty for now)

Raw and synthetic datasets for training. Everything in this folder except this README is ignored
by Git: datasets can be large, and even anonymised exports should not be published.

Nothing is collected here yet. In Phase 9 it will hold:

- `export-YYYY-MM-DD.csv`: the admin's anonymised export (Phase 7), one row per notification with
  user IDs replaced by random tokens and no names, phone numbers or emails (PRD DR-2).
- `synthetic-*.csv`: generated examples used to balance the classes (PRD DR-7).

The data the models need is already being recorded by the app on every notification: text, type,
roles, time, the rules' answer (`predictedPriority`, `spamScore`, `modelVersion`,
`predictionSource`), delivery and interaction times, and admin corrections.
