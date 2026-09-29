"""Rule-based classifier v0 (PRD section 5): the rules in rules_v0.json, applied in plain Python.

Priority
  URGENT  deadline within 60 minutes; an accepted application; or words such as "urgent",
          "today", "expires", "action required" (and Kiswahili: "haraka", "leo", "dharura"...),
          except in announcements.
  MEDIUM  direct messages and application updates (reviewed, rejected, new applicant).
  LOW     announcements and ordinary job alerts.
Spam (score out of 100, spam at 50 or more; admin and system messages are always trusted)
  payment requests ("registration fee", "tuma pesa"...), scam phrases ("you have won"...),
  links (shortened links weigh more), shouting in capitals, and "!!!".

The backend's fallback (backend/src/pipeline/rulesV0.ts) is a word-for-word port; both are
checked against the same examples (tests/fixtures/rules_v0_examples.json).
"""

import json
import re
from pathlib import Path

from app.schemas import ExplanationItem, PredictRequest, PredictResponse

RULES_FILE = Path(__file__).with_name("rules_v0.json")
URL_PATTERN = re.compile(r"(?:https?://|www\.)\S+", re.IGNORECASE)


def normalize(text: str) -> str:
    """Lower case, everything except a-z and 0-9 becomes a space, padded with spaces."""
    return " " + re.sub(r"[^a-z0-9]+", " ", text.lower()).strip() + " "


def found(normalized_text: str, phrases: list[str]) -> list[str]:
    """The phrases that appear as whole words."""
    return [p for p in phrases if f" {normalize(p).strip()} " in normalized_text]


def url_host(url: str) -> str:
    host = re.sub(r"^(?:https?://)?(?:www\.)?", "", url.lower())
    return re.split(r"[/?#:]", host, maxsplit=1)[0]


def is_shortener(host: str, shorteners: list[str]) -> bool:
    return any(host == s or host.endswith("." + s) for s in shorteners)


def bare_shortener_link(text: str, shorteners: list[str]) -> bool:
    """A shortened link written without http:// or www., e.g. "bit.ly/abc"."""
    lowered = text.lower()
    return any(
        re.search(r"(?:^|[^a-z0-9.])" + re.escape(s) + "/", lowered) is not None for s in shorteners
    )


def weight(percent: int) -> float:
    return percent / 100


class RuleBasedClassifier:
    def __init__(self, rules_file: Path = RULES_FILE) -> None:
        self.rules = json.loads(rules_file.read_text(encoding="utf-8"))
        self.version: str = self.rules["version"]

    # ---------- priority ----------

    def _priority(self, request: PredictRequest, text: str):
        rules = self.rules["priority"]
        fired: list[tuple[str, int]] = []

        minutes = request.deadline_minutes
        if minutes is not None and 0 <= minutes <= rules["urgent_deadline_minutes"]:
            limit = rules["urgent_deadline_minutes"]
            fired.append((f"deadline_within_{limit}_minutes", rules["urgent_deadline_confidence"]))

        if request.type == "status_update" and found(text, rules["accepted_phrases"]):
            fired.append(("application_accepted", rules["accepted_confidence"]))

        # Announcements go to everyone: a word like "urgent" in one is not an urgent personal alert.
        skip_words = request.type in rules["urgent_words_skip_types"]
        words = [] if skip_words else found(text, rules["urgent_words"])
        if words:
            confidence = min(
                rules["urgent_words_confidence"]
                + rules["urgent_words_extra_per_word"] * (len(words) - 1),
                rules["urgent_words_max_confidence"],
            )
            fired.append(("urgent_words:" + ",".join(words), confidence))

        if fired:
            return "urgent", max(c for _, c in fired), fired
        default = rules["by_type"][request.type]
        return (
            default["priority"],
            default["confidence"],
            [(default["feature"], default["confidence"])],
        )

    # ---------- spam ----------

    def _spam(self, request: PredictRequest, text: str):
        rules = self.rules["spam"]
        if request.sender_role in rules["trusted_senders"]:
            return 0, [("spam:trusted_sender", 0)]

        fired: list[tuple[str, int]] = []
        payments = found(text, rules["payment_phrases"])
        if payments:
            fired.append(
                ("spam:payment_request:" + ",".join(payments), rules["payment_request_weight"])
            )
        blocked = found(text, rules["blocked_keywords"])
        if blocked:
            fired.append(
                ("spam:blocked_keyword:" + ",".join(blocked), rules["blocked_keyword_weight"])
            )

        hosts = [url_host(u) for u in URL_PATTERN.findall(request.text)]
        untrusted = [h for h in hosts if not any(d in h for d in rules["trusted_link_domains"])]
        shorteners = rules["link_shorteners"]
        if any(is_shortener(h, shorteners) for h in untrusted) or bare_shortener_link(
            request.text, shorteners
        ):
            fired.append(("spam:link_shortener", rules["link_shortener_weight"]))
        elif untrusted:
            fired.append(("spam:suspicious_link", rules["suspicious_link_weight"]))

        letters = len(re.findall(r"[A-Za-z]", request.text))
        capitals = len(re.findall(r"[A-Z]", request.text))
        if (
            letters >= rules["all_caps_min_letters"]
            and capitals * 100 >= rules["all_caps_percent"] * letters
        ):
            fired.append(("spam:all_capitals", rules["all_caps_weight"]))

        if (
            "!!" in request.text
            or "??" in request.text
            or request.text.count("!") >= rules["punctuation_min_exclamations"]
        ):
            fired.append(("spam:excessive_punctuation", rules["punctuation_weight"]))

        score = min(100, rules["base_score"] + sum(w for _, w in fired))
        return score, fired

    # ---------- /predict ----------

    def predict(self, request: PredictRequest) -> PredictResponse:
        text = normalize(request.text)
        priority, confidence, priority_rules = self._priority(request, text)
        spam_score, spam_rules = self._spam(request, text)
        return PredictResponse(
            priority=priority,
            priority_confidence=weight(confidence),
            is_spam=spam_score >= self.rules["spam"]["threshold"],
            spam_score=weight(spam_score),
            model_version=self.version,
            source="rules",
            explanation=[
                ExplanationItem(feature=feature, weight=weight(w))
                for feature, w in priority_rules + spam_rules
            ],
        )
