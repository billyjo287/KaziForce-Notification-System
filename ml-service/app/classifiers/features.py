"""How a notification becomes numbers for the trained models (Phase 9, docs/ml-training.md).

Used by BOTH training (training/train.py) and serving (trained.py), so a message is always read
the same way. The input is the /predict request as a plain dict (the fixed contract).

Two views of each message:
  text   the title and message, cleaned: lower case, and links, phone numbers, money amounts,
         M-Pesa codes and emails replaced by tokens ("<url>", "<phone>", ...), so the model learns
         "a phone number is here", never a particular number (and keeps no personal data).
  meta   short tokens for the other fields: type, who sent it, who gets it, how soon the job
         closes (in buckets) and the hour of day in Nairobi (the request time is in UTC).
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

NAIROBI = timezone(timedelta(hours=3))

SHORTENERS = ("bit.ly", "tinyurl.com", "cutt.ly", "t.ly", "goo.gl", "ow.ly", "is.gd", "rb.gy")

_URL = re.compile(
    r"(?:https?://|www\.)\S+|\b[a-z0-9-]+\.(?:co\.ke|com|ke|ly|org|net)(?:/\S*)?", re.I
)
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_PHONE = re.compile(
    r"(?<!\w)(?:\+?254|0)[17]\d{8}(?!\w)|(?<!\w)(?:\+?254|0)[17]\d{2}[\s-]\d{3}[\s-]\d{3}(?!\w)"
)
_MPESA_CODE = re.compile(r"\b(?=[A-Z0-9]{10}\b)(?=[A-Z0-9]*\d)[A-Z0-9]{10}\b")
_MONEY = re.compile(
    r"\b(?:ksh|kes|sh)\s?\.?\s?\d[\d,]*(?:\.\d+)?\b|\b\d[\d,]*\s?(?:bob|k|shillings|\/=)(?!\w)",
    re.I,
)


def clean_text(text: str) -> str:
    """Lower case with tokens for links, emails, phone numbers, M-Pesa codes and money."""

    def url(match: re.Match[str]) -> str:
        found = match.group(0).lower()
        return " shorturltoken " if any(s in found for s in SHORTENERS) else " urltoken "

    text = _MPESA_CODE.sub(" mpesacodetoken ", text)
    text = _URL.sub(url, text)
    text = _EMAIL.sub(" emailtoken ", text)
    text = _PHONE.sub(" phonetoken ", text)
    text = _MONEY.sub(" moneytoken ", text)
    # Shouting (a scam sign) is kept as a separate "meta" token, see meta_tokens().
    return " ".join(text.lower().split())


def shouting(text: str) -> bool:
    letters = [c for c in text if c.isalpha()]
    return len(letters) >= 20 and sum(c.isupper() for c in letters) / len(letters) > 0.6


def deadline_bucket(minutes: int | None) -> str:
    if minutes is None:
        return "dl_none"
    if minutes <= 60:
        return "dl_lt1h"
    if minutes <= 180:
        return "dl_1to3h"
    if minutes <= 24 * 60:
        return "dl_3to24h"
    if minutes <= 48 * 60:
        return "dl_1to2d"
    return "dl_gt2d"


def nairobi_hour(created_at) -> int:
    moment = (
        created_at if isinstance(created_at, datetime) else datetime.fromisoformat(str(created_at))
    )
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(NAIROBI).hour


def hour_bucket(hour: int) -> str:
    if 6 <= hour < 12:
        return "hr_morning"
    if 12 <= hour < 17:
        return "hr_afternoon"
    if 17 <= hour < 22:
        return "hr_evening"
    return "hr_night"


def meta_tokens(request: dict) -> str:
    text = request["text"]
    tokens = [
        f"type_{request['type']}",
        f"sender_{request['sender_role']}",
        f"recipient_{request['recipient_role']}",
        deadline_bucket(request.get("deadline_minutes")),
        hour_bucket(nairobi_hour(request["created_at"])),
    ]
    if shouting(text):
        tokens.append("shouting")
    if text.count("!") >= 3:
        tokens.append("many_exclamations")
    return " ".join(tokens)


# ---------- for scikit-learn (module-level functions, so saved models can load them) ----------


def texts(requests: list[dict]) -> list[str]:
    return [clean_text(r["text"]) for r in requests]


def metas(requests: list[dict]) -> list[str]:
    return [meta_tokens(r) for r in requests]
