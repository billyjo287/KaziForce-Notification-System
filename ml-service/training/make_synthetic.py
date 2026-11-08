"""Synthetic KaziForce notifications for training (Phase 9, docs/ml-training.md).

    python -m training.make_synthetic            # writes data/synthetic-v1.csv

KaziForce could not share real messages, so the training data is generated from templates that
follow the written label definitions (evaluation/LABELLING.md): urgent = act within a few hours or
lose something; medium = within a day or two; low = no action needed; spam = asks for money or
secrets, or is plainly not a real job. Hard negatives (honest messages that mention M-Pesa,
money or links) are included so the spam model does not learn "M-Pesa = scam".

Rules followed:
  - The hand-written evaluation set (evaluation/holdout-v1.csv) is NEVER read here. The
    templates were written from the definitions only, so the test stays unseen.
  - Every name, company and phone number is invented (no personal data).
  - English, Kiswahili and Sheng-style mixes, with typing variation (case, punctuation, short
    forms), so the model does not learn one exact wording.
  - Each row keeps its template id, so training can split by template (no near-copies on both
    sides of the train/validation split).
  - A fixed random seed: the same file every time.
"""

from __future__ import annotations

import csv
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "synthetic-v1.csv"
SEED = 2026
NAIROBI = timezone(timedelta(hours=3))

# ---------- invented fillers ----------

FIRST = [
    "Amina",
    "Brian",
    "Wanjiru",
    "Otieno",
    "Faith",
    "Kevin",
    "Achieng",
    "Mwangi",
    "Halima",
    "Peter",
    "Njeri",
    "Juma",
    "Mercy",
    "Kiprop",
    "Zawadi",
    "Baraka",
    "Wairimu",
    "Hassan",
]
COMPANY = [
    "Pwani Events",
    "Mwangi Logistics",
    "Tumaini Cleaners",
    "Kilele Builders",
    "Neema Catering",
    "Safari Movers",
    "Jua Kali Works",
    "Upendo Hotel",
    "Baraka Farms",
    "Shujaa Security",
    "Mama Mboga Fresh",
    "Nyota Salon",
    "Amani Hardware",
    "Kesho Retail",
]
PLACE = [
    "Westlands",
    "Kilimani",
    "Industrial Area",
    "Kasarani",
    "Embakasi",
    "Thika",
    "Rongai",
    "Ruaka",
    "Kitengela",
    "Nyali",
    "Kisumu CBD",
    "Nakuru Town",
    "Eastleigh",
    "Ngong Road",
    "Juja",
    "Machakos",
    "Karen",
    "South B",
    "Umoja",
    "Githurai",
]
SKILL_EN = [
    "cleaner",
    "waiter",
    "driver",
    "loader",
    "security guard",
    "cook",
    "painter",
    "mason",
    "boda rider",
    "shop attendant",
    "house help",
    "electrician",
    "plumber",
    "farm hand",
    "event usher",
    "warehouse packer",
    "barber",
    "tailor",
]
SKILL_SW = [
    "msafishaji",
    "mhudumu",
    "dereva",
    "mbebaji mizigo",
    "mlinzi",
    "mpishi",
    "mpaka rangi",
    "fundi mwashi",
    "mwendesha boda",
    "muuzaji dukani",
    "msaidizi wa nyumbani",
    "fundi umeme",
    "fundi bomba",
    "mfanyakazi shambani",
    "mkaribishaji",
    "mpakiaji ghalani",
    "kinyozi",
    "fundi cherehani",
]
PAY = [
    "KSh 800",
    "KSh 1,000",
    "KSh 1,200",
    "KSh 1,500",
    "KSh 2,000",
    "Ksh 700 per day",
    "1,000 bob",
    "KES 1,800",
    "ksh1500",
    "800 kwa siku",
    "elfu moja",
    "2k per day",
]
SHORT_LINK = [
    "bit.ly/kz-job",
    "tinyurl.com/kazi-now",
    "bit.ly/3xJobKe",
    "cutt.ly/pay-fast",
    "t.ly/winkes",
]
SITE = [
    "www.kilelebuilders.co.ke",
    "pwanievents.co.ke",
    "www.tumainicleaners.com",
    "safarimovers.co.ke",
]


def phone(rng: random.Random) -> str:
    return rng.choice(["07", "01"]) + "".join(rng.choice("0123456789") for _ in range(8))


def fill(rng: random.Random, template: str) -> str:
    return template.format(
        name=rng.choice(FIRST),
        company=rng.choice(COMPANY),
        place=rng.choice(PLACE),
        skill=rng.choice(SKILL_EN),
        kazi=rng.choice(SKILL_SW),
        pay=rng.choice(PAY),
        hour=rng.choice(["7", "8", "9", "10", "2", "3", "4", "5", "6"]),
        mins=rng.choice(["20", "30", "45", "15"]),
        hours=rng.choice(["2", "3"]),
        days=rng.choice(["3", "4", "5", "7", "10"]),
        link=rng.choice(SHORT_LINK),
        site=rng.choice(SITE),
        phone=phone(rng),
        fee=rng.choice(["500", "1,000", "1,500", "2,000", "300", "750", "5,000"]),
        day=rng.choice(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]),
        siku=rng.choice(["Jumatatu", "Jumanne", "Jumatano", "Alhamisi", "Ijumaa", "Jumamosi"]),
    )


# ---------- templates: (template id, language, type, sender, recipient, deadline rule, text) ----
# deadline rule: None (no deadline), or (min_minutes, max_minutes) for job alerts.
U, M, L, S = "urgent", "medium", "low", "spam"

TEMPLATES: dict[str, list[tuple]] = {
    U: [
        (
            "u-job-en-1",
            "en",
            "job_alert",
            "business",
            "worker",
            (15, 180),
            "{skill}s needed in {place}\n{company} needs a {skill} today. Pay: {pay}. Apply now, closes soon.",
        ),
        (
            "u-job-en-2",
            "en",
            "job_alert",
            "business",
            "worker",
            (20, 150),
            "Urgent: {skill} for tonight\n{company} in {place} needs someone tonight from {hour}pm. {pay}.",
        ),
        (
            "u-job-en-3",
            "en",
            "job_alert",
            "business",
            "worker",
            (30, 240),
            "Start today: {skill}\n{company} is short of staff in {place} this afternoon. {pay}. Reply quickly.",
        ),
        (
            "u-job-en-4",
            "en",
            "job_alert",
            "business",
            "worker",
            (10, 90),
            "{skill} wanted ASAP\nWork starts in {mins} minutes at {place}. {company} pays {pay}.",
        ),
        (
            "u-job-sw-1",
            "sw",
            "job_alert",
            "business",
            "worker",
            (15, 180),
            "Tunahitaji {kazi} leo\n{company} wanahitaji {kazi} leo {place}. Malipo: {pay}. Omba sasa hivi.",
        ),
        (
            "u-job-sw-2",
            "sw",
            "job_alert",
            "business",
            "worker",
            (20, 180),
            "Kazi ya haraka: {kazi}\nAnza leo jioni saa {hour} {place}. {company}, malipo {pay}.",
        ),
        (
            "u-job-sh-1",
            "sh",
            "job_alert",
            "business",
            "worker",
            (15, 150),
            "Kazi leo {place}\nTuna-need {skill} leo, {company}. Doh ni {pay}. Apply haraka msee.",
        ),
        (
            "u-job-sh-2",
            "sh",
            "job_alert",
            "business",
            "worker",
            (10, 120),
            "Job ya sasa hivi\n{company} wanatafuta {skill} {place}, unaanza within saa {hours}. {pay}.",
        ),
        (
            "u-status-en-1",
            "en",
            "status_update",
            "business",
            "worker",
            None,
            "You got the job!\n{company} accepted you as {skill}. Confirm by {hour}pm today or the place goes to someone else.",
        ),
        (
            "u-status-en-2",
            "en",
            "status_update",
            "business",
            "worker",
            None,
            "Interview today\n{company} wants to meet you today at {hour}pm in {place}. Please confirm now.",
        ),
        (
            "u-status-sw-1",
            "sw",
            "status_update",
            "business",
            "worker",
            None,
            "Umepata kazi!\n{company} wamekukubali. Thibitisha kabla ya saa {hour} leo la sivyo nafasi itapewa mwingine.",
        ),
        (
            "u-msg-en-1",
            "en",
            "message",
            "business",
            "worker",
            None,
            "New message from {company}\nThe shift starts in {mins} minutes, are you coming? Reply now please.",
        ),
        (
            "u-msg-en-2",
            "en",
            "message",
            "business",
            "worker",
            None,
            "New message from {company}\nCan you start tonight at {hour}pm? We need an answer within the hour.",
        ),
        (
            "u-msg-en-3",
            "en",
            "message",
            "worker",
            "business",
            None,
            "New message from {name}\nI am at the gate in {place} but nobody is here. Shift starts now, please call.",
        ),
        (
            "u-msg-sw-1",
            "sw",
            "message",
            "business",
            "worker",
            None,
            "Ujumbe mpya kutoka {company}\nZamu inaanza baada ya dakika {mins}, unakuja? Jibu sasa hivi.",
        ),
        (
            "u-msg-sh-1",
            "sh",
            "message",
            "business",
            "worker",
            None,
            "Ujumbe kutoka {company}\nUko wapi? Kazi inaanza sahi sahi, tuko {place}. Jibu haraka.",
        ),
        (
            "u-msg-sw-2",
            "sw",
            "message",
            "worker",
            "business",
            None,
            "Ujumbe mpya kutoka {name}\nNimefika {place} lakini mlango umefungwa. Zamu inaanza sasa, tafadhali piga simu.",
        ),
    ],
    M: [
        (
            "m-job-en-1",
            "en",
            "job_alert",
            "business",
            "worker",
            (300, 2880),
            "{skill} needed in {place}\n{company} needs a {skill} tomorrow. Pay: {pay}. Applications close tomorrow.",
        ),
        (
            "m-job-en-2",
            "en",
            "job_alert",
            "business",
            "worker",
            (600, 2880),
            "New job: {skill}\n{company} is hiring a {skill} for {day}. {pay}. Apply before tomorrow evening.",
        ),
        (
            "m-job-sw-1",
            "sw",
            "job_alert",
            "business",
            "worker",
            (360, 2880),
            "Kazi mpya: {kazi}\n{company} wanahitaji {kazi} kesho {place}. Malipo {pay}. Omba kabla ya kesho.",
        ),
        (
            "m-job-sh-1",
            "sh",
            "job_alert",
            "business",
            "worker",
            (400, 2880),
            "Job ya kesho\n{company} wanatafuta {skill} {place} kesho. Doh {pay}, apply leo ama kesho.",
        ),
        (
            "m-status-en-1",
            "en",
            "status_update",
            "business",
            "worker",
            None,
            "Application reviewed\n{company} looked at your application for {skill}. They will contact you.",
        ),
        (
            "m-status-en-2",
            "en",
            "status_update",
            "business",
            "worker",
            None,
            "Application not successful\n{company} chose another person for the {skill} job. Keep applying.",
        ),
        (
            "m-status-en-3",
            "en",
            "status_update",
            "business",
            "worker",
            None,
            "You were accepted\n{company} accepted you for the {skill} job on {day}. Details are in your messages.",
        ),
        (
            "m-status-sw-1",
            "sw",
            "status_update",
            "business",
            "worker",
            None,
            "Ombi limeangaliwa\n{company} wameangalia ombi lako la kazi ya {kazi}. Watawasiliana nawe.",
        ),
        (
            "m-status-sw-2",
            "sw",
            "status_update",
            "business",
            "worker",
            None,
            "Ombi halikufanikiwa\n{company} wamechagua mtu mwingine kwa kazi ya {kazi}. Endelea kuomba.",
        ),
        (
            "m-applicant-en-1",
            "en",
            "status_update",
            "worker",
            "business",
            None,
            "New applicant\n{name} applied for your {skill} job in {place}.",
        ),
        (
            "m-applicant-sw-1",
            "sw",
            "status_update",
            "worker",
            "business",
            None,
            "Mwombaji mpya\n{name} ameomba kazi yako ya {kazi} {place}.",
        ),
        (
            "m-msg-en-1",
            "en",
            "message",
            "business",
            "worker",
            None,
            "New message from {company}\nHello {name}, can you also work on {day}? Let me know by tomorrow.",
        ),
        (
            "m-msg-en-2",
            "en",
            "message",
            "worker",
            "business",
            None,
            "New message from {name}\nGood morning, which gate should I use on {day}? Thank you.",
        ),
        (
            "m-msg-en-3",
            "en",
            "message",
            "business",
            "worker",
            None,
            "New message from {company}\nPlease bring your ID copy when you come on {day}.",
        ),
        (
            "m-msg-sw-1",
            "sw",
            "message",
            "business",
            "worker",
            None,
            "Ujumbe mpya kutoka {company}\nHabari {name}, unaweza kufanya kazi {siku} pia? Nijulishe kesho.",
        ),
        (
            "m-msg-sh-1",
            "sh",
            "message",
            "worker",
            "business",
            None,
            "Ujumbe kutoka {name}\nSasa boss, {day} niko available. Nikuje saa ngapi?",
        ),
        (
            "m-admin-en-1",
            "en",
            "announcement",
            "admin",
            "worker",
            None,
            "Please confirm your phone number\nConfirm your phone in Settings within {days} days to keep getting SMS alerts.",
        ),
        (
            "m-admin-sw-1",
            "sw",
            "announcement",
            "admin",
            "business",
            None,
            "Thibitisha maelezo ya kampuni\nTafadhali kamilisha maelezo ya kampuni yako ndani ya siku {days}.",
        ),
    ],
    L: [
        (
            "l-job-en-1",
            "en",
            "job_alert",
            "business",
            "worker",
            (3000, 20000),
            "{skill} needed in {place}\n{company} is hiring a {skill} for next week. Pay: {pay}. Applications close in {days} days.",
        ),
        (
            "l-job-sw-1",
            "sw",
            "job_alert",
            "business",
            "worker",
            (3000, 20000),
            "Kazi ya wiki ijayo: {kazi}\n{company} wanatafuta {kazi} {place}. Maombi yanafungwa baada ya siku {days}.",
        ),
        (
            "l-job-sh-1",
            "sh",
            "job_alert",
            "business",
            "worker",
            (3000, 15000),
            "Job ya next week\n{company} wako na job ya {skill} {place}. Hakuna haraka, apply ndani ya siku {days}.",
        ),
        (
            "l-ann-en-1",
            "en",
            "announcement",
            "admin",
            "worker",
            None,
            "Tip: complete your profile\nWorkers with a photo and skills get more replies from employers.",
        ),
        (
            "l-ann-en-2",
            "en",
            "announcement",
            "admin",
            "worker",
            None,
            "Planned maintenance\nKaziForce will be updated on {day} night for about an hour. Nothing to do.",
        ),
        (
            "l-ann-en-3",
            "en",
            "announcement",
            "admin",
            "business",
            None,
            "New on KaziForce\nYou can now see who read your job alerts on each job page.",
        ),
        (
            "l-ann-sw-1",
            "sw",
            "announcement",
            "admin",
            "worker",
            None,
            "Ushauri: kamilisha wasifu wako\nWafanyakazi wenye picha na ujuzi hupata majibu zaidi.",
        ),
        (
            "l-ann-sw-2",
            "sw",
            "announcement",
            "admin",
            "worker",
            None,
            "Matengenezo\nKaziForce itasasishwa usiku wa {siku} kwa takriban saa moja. Hakuna cha kufanya.",
        ),
        (
            "l-msg-en-1",
            "en",
            "message",
            "worker",
            "business",
            None,
            "New message from {name}\nThank you for the job last week, it was good working with you.",
        ),
        (
            "l-msg-en-2",
            "en",
            "message",
            "business",
            "worker",
            None,
            "New message from {company}\nThanks {name}, you did great work. We will remember you next time.",
        ),
        (
            "l-msg-sw-1",
            "sw",
            "message",
            "business",
            "worker",
            None,
            "Ujumbe kutoka {company}\nAsante {name} kwa kazi nzuri. Tutakukumbuka wakati ujao.",
        ),
        (
            "l-msg-sh-1",
            "sh",
            "message",
            "worker",
            "business",
            None,
            "Ujumbe kutoka {name}\nAsante sana boss, ilikuwa poa kufanya kazi na nyinyi.",
        ),
        (
            "l-status-en-1",
            "en",
            "status_update",
            "business",
            "worker",
            None,
            "Job closed\nThe {skill} job at {company} has closed. Thank you for your interest.",
        ),
    ],
    S: [
        (
            "s-fee-en-1",
            "en",
            "job_alert",
            "business",
            "worker",
            (60, 4000),
            "{skill} jobs in Dubai\nPay KES {fee} registration fee to secure your job. Send to {phone} today.",
        ),
        (
            "s-fee-en-2",
            "en",
            "job_alert",
            "business",
            "worker",
            (60, 4000),
            "Guaranteed job\nPay a processing fee of KSh {fee} on M-Pesa {phone} and start tomorrow. Limited slots!!!",
        ),
        (
            "s-fee-en-3",
            "en",
            "message",
            "business",
            "worker",
            None,
            "New message from {company}\nCONGRATULATIONS!!! You are selected. Send {fee} for training fee to {phone} to confirm.",
        ),
        (
            "s-fee-sw-1",
            "sw",
            "job_alert",
            "business",
            "worker",
            (60, 4000),
            "Kazi Qatar\nLipa ada ya usajili KSh {fee} kwa M-Pesa {phone} uthibitishe nafasi yako leo.",
        ),
        (
            "s-fee-sw-2",
            "sw",
            "message",
            "business",
            "worker",
            None,
            "Ujumbe mpya kutoka {company}\nHONGERA!!! Tuma {fee} kwa {phone} kulipia mafunzo, kazi ni yako.",
        ),
        (
            "s-fee-sh-1",
            "sh",
            "message",
            "business",
            "worker",
            None,
            "Ujumbe kutoka {company}\nBro tuma {fee} bob kwa {phone} upate hii job, ni dili safi sana.",
        ),
        (
            "s-pin-en-1",
            "en",
            "message",
            "worker",
            "business",
            None,
            "New message from {name}\nSend me your M-Pesa PIN so I can pay you the deposit back.",
        ),
        (
            "s-pin-sw-1",
            "sw",
            "message",
            "worker",
            "worker",
            None,
            "Ujumbe mpya kutoka {name}\nNitumie PIN yako ya M-Pesa nikurudishie pesa.",
        ),
        (
            "s-prize-en-1",
            "en",
            "message",
            "business",
            "worker",
            None,
            "New message from {company}\nYou have WON KSh 50,000!!! Click {link} to claim your prize now.",
        ),
        (
            "s-prize-sw-1",
            "sw",
            "message",
            "business",
            "worker",
            None,
            "Ujumbe mpya\nUmeshinda zawadi ya KSh 50,000! Bofya {link} kudai zawadi yako sasa.",
        ),
        (
            "s-link-en-1",
            "en",
            "job_alert",
            "business",
            "worker",
            (60, 4000),
            "Easy online job\nEarn KSh 3,000 daily from your phone. Register here: {link}",
        ),
        (
            "s-crypto-en-1",
            "en",
            "message",
            "business",
            "worker",
            None,
            "New message from {company}\nInvest KSh {fee} in crypto and get double in 24 hours. Guaranteed income!",
        ),
        (
            "s-crypto-sh-1",
            "sh",
            "message",
            "business",
            "worker",
            None,
            "Ujumbe kutoka {company}\nWeka {fee} kwa forex upate double kesho, guaranteed msee. Join {link}",
        ),
        (
            "s-caps-en-1",
            "en",
            "job_alert",
            "business",
            "worker",
            (60, 4000),
            "URGENT HIRING ABROAD\nNO EXPERIENCE NEEDED!!! PAY MEDICAL FEE {fee} TO {phone} AND TRAVEL NEXT WEEK!!!",
        ),
    ],
}

# Honest messages that mention money, M-Pesa or links: never spam (hard negatives).
HARD_NEGATIVES: list[tuple] = [
    (
        "m-hard-en-1",
        "en",
        "message",
        "business",
        "worker",
        None,
        M,
        "New message from {company}\nYour wages of {pay} will be paid by M-Pesa after the shift on {day}.",
    ),
    (
        "m-hard-en-2",
        "en",
        "message",
        "business",
        "worker",
        None,
        M,
        "New message from {company}\nWe refunded your fare to your M-Pesa. Please confirm you got it.",
    ),
    (
        "l-hard-en-1",
        "en",
        "message",
        "business",
        "worker",
        None,
        L,
        "New message from {company}\nYou can see photos of our past events on {site}.",
    ),
    (
        "m-hard-sw-1",
        "sw",
        "message",
        "business",
        "worker",
        None,
        M,
        "Ujumbe kutoka {company}\nMalipo yako {pay} yatatumwa kwa M-Pesa baada ya kazi {siku}.",
    ),
    (
        "u-hard-en-1",
        "en",
        "job_alert",
        "business",
        "worker",
        (20, 150),
        U,
        "{skill} needed today in {place}\n{company} pays {pay} by M-Pesa at the end of the day. Starts in {hours} hours.",
    ),
    (
        "l-hard-sw-1",
        "sw",
        "message",
        "business",
        "worker",
        None,
        L,
        "Ujumbe kutoka {company}\nAsante! Tumekutumia malipo yako kwa M-Pesa. Karibu tena.",
    ),
]

# How many rows of each kind (about 3,800 in all; urgent and spam are not left rare).
COUNTS = {U: 1000, M: 1000, L: 900, S: 800}
HARD_EACH = 60


def vary(rng: random.Random, text: str) -> str:
    """Typing variation: case, punctuation, short forms, missing full stops."""
    title, _, body = text.partition("\n")
    r = rng.random()
    if r < 0.12:
        body = body.lower()
    elif r < 0.18:
        body = body.upper()
    if rng.random() < 0.15:
        body = body.replace(".", "")
    if rng.random() < 0.1:
        body = body.replace(" you ", " u ").replace(" please ", " pls ").replace("Please", "Pls")
    if rng.random() < 0.08:
        body = body + rng.choice([" Thanks.", " Asante.", " God bless.", " Karibu."])
    return f"{title}\n{body}"


def created_at(rng: random.Random) -> str:
    start = datetime(2026, 9, 1, tzinfo=NAIROBI)
    moment = start + timedelta(minutes=rng.randrange(0, 60 * 24 * 60))
    return moment.isoformat()


def deadline(rng: random.Random, rule) -> int | None:
    return None if rule is None else rng.randint(*rule)


def row(rng, template, priority, is_spam) -> dict:
    tid, lang, ntype, sender, recipient, rule, text = template
    return {
        "template": tid,
        "language": lang,
        "type": ntype,
        "sender_role": sender,
        "recipient_role": recipient,
        "created_at": created_at(rng),
        "deadline_minutes": deadline(rng, rule),
        "text": vary(rng, fill(rng, text))[:1000],
        "priority": priority,
        "is_spam": is_spam,
    }


def generate(
    seed: int = SEED, counts: dict | None = None, hard_each: int = HARD_EACH
) -> list[dict]:
    rng = random.Random(seed)
    counts = counts or COUNTS
    rows: list[dict] = []
    for label, n in counts.items():
        templates = TEMPLATES[label]
        for i in range(n):
            t = templates[i % len(templates)]
            if label == S:
                # Spam keeps a priority for completeness; it is never scored (it is blocked).
                rows.append(row(rng, t, rng.choice([U, M]), True))
            else:
                rows.append(row(rng, t, label, False))
    for t in HARD_NEGATIVES:
        for _ in range(hard_each):
            rows.append(row(rng, t[:6] + (t[7],), t[6], False))
    rng.shuffle(rows)
    return rows


FIELDS = [
    "template",
    "language",
    "type",
    "sender_role",
    "recipient_role",
    "created_at",
    "deadline_minutes",
    "text",
    "priority",
    "is_spam",
]


def main() -> None:
    rows = generate()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        for r in rows:
            writer.writerow(
                {
                    **r,
                    "is_spam": "true" if r["is_spam"] else "false",
                    "deadline_minutes": ""
                    if r["deadline_minutes"] is None
                    else r["deadline_minutes"],
                }
            )
    spam = sum(r["is_spam"] for r in rows)
    print(
        f"{len(rows)} rows ({spam} spam) from {len({r['template'] for r in rows})} templates -> "
        f"{OUT.relative_to(ROOT).as_posix()}"
    )


if __name__ == "__main__":
    main()
