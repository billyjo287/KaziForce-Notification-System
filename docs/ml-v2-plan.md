# Plan: a model that works well on synthetic data only (ml-v2)

KaziForce will never share real messages, so the model is trained on synthetic data for good.
That is acceptable if two things are true: the synthetic data is **varied enough** that the model
learns meaning instead of memorising sentences, and the final test is written by **real people**
who did not write the generator. ml-v1 fails the first (diagnostics, 23 Nov 2026: 100% on known
templates, 60% on unseen ones).

## Targets for ml-v2 (checked on the new hand-written test, holdout-v2)

| Measure | ml-v1 | Target |
| --- | ---: | ---: |
| Priority weighted F1 | 83.1% | >= 85% |
| Urgent recall | 71.7% | >= 90% (at least 85% in Kiswahili and in Sheng) |
| Spam accuracy | 97.2% | >= 95% |
| Honest messages blocked | 2.0% | <= 2% |
| Unseen-template CV, priority macro F1 (overfitting check) | 0.60 | >= 0.75 |

## Steps

| # | Step | Who | Time |
| --- | --- | --- | --- |
| 1 | Freeze `holdout-v1` as a development set (already used, no longer blind) | Claude | done |
| 2 | Volunteers write `holdout-v2`: 180+ messages (guide below), never shown to Claude before step 6 | Billy + 3-5 friends | 1 day, in parallel |
| 3 | Generator v2: build messages from parts (opening + situation + time + action + closing) in EN, SW and Sheng, so one "template" yields thousands of different sentences; 150+ situations instead of 68; more urgent status updates and direct messages; Sheng and code-switching everywhere; typing noise (typos, no spaces, emojis) | Claude | 3-4 hours |
| 4 | Retrain; choose settings only with unseen-template CV and the validation split; repeat step 3 until CV >= 0.75 | Claude | 1-2 hours |
| 5 | Optional second opinion: a small multilingual model (for example a distilled multilingual BERT) compared on the same CV; kept only if clearly better and still under 500 ms on the server CPU | Claude | 2 hours |
| 6 | One final run on `holdout-v2`, report the numbers as they are (also by language), update Chapter 5 | Claude + Billy | 1 hour |
| 7 | Deploy `ml-v2` (update.sh), check the admin Models page | Billy | 15 min |

## Guide for the volunteers who write holdout-v2

Write realistic notifications as KaziForce would send them, one per row of (the first row is an example: delete it)
`ml-service/evaluation/holdout-v2-template.csv`. Use invented names and numbers only.

- **Mix:** about 1/3 English, 1/3 Kiswahili, 1/3 Sheng or mixed; about 20% scams.
- **Types:** job alerts, application updates ("you were accepted", "not selected"), direct
  messages between worker and employer, admin announcements.
- **Write like real people**: short forms, missing punctuation, CAPITALS, "pls", emojis.
- **Label each row** with the rules in `ml-service/evaluation/LABELLING.md`
  (urgent = act within a few hours; medium = within a day or two; low = no action; spam = asks
  for money or secrets or is not a real job), and write the reason in `why`.
- A second person labels the same rows without looking; disagreements are settled together.
- **Do not show these messages to Claude** until the final test (step 6). Keep the file outside
  the repository until then.
