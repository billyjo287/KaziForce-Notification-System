# ruff: noqa: E501
# (The situations below are data: long wordings stay on one line so each is easy to read.)
"""Synthetic KaziForce notifications, version 2 (ml-v2, docs/ml-v2-plan.md).

    python -m training.make_synthetic_v2            # writes data/synthetic-v2.csv

Why a new generator: ml-v1 learned its 68 templates by heart (diagnostics, 23 Nov 2026: 100% on
known templates, 60% on unseen ones). Version 2 builds each message from parts instead of filling
in one fixed sentence:

    [title, in the app's format or as the sender typed it]
    [greeting] + [the situation, one of several wordings] + [an extra detail] + [a closing]
    + typing noise (short forms, typos, missing spaces, emojis, capitals)

  - About 170 situations (the "groups"), each with its own wordings in English, Kiswahili and
    Sheng, so one situation gives hundreds of different sentences. The situation is what the
    model must recognise; greetings, details and closings are shared by every label, so they
    carry no label of their own.
  - Training splits and cross-validation are by SITUATION: the model is always checked on
    situations it has never seen, which is the honest test of "does it understand the meaning".
  - More of what ml-v1 got wrong: urgent status updates and direct messages ("your shift starts
    in 30 minutes", "confirm by 6 pm"), and Sheng and code-switching in every category.
  - Hard negatives: honest messages that mention money, M-Pesa, links, a PIN warning or a phone
    number, so the spam model does not learn "M-Pesa = scam".

Rules kept from version 1: the hand-written test sets (evaluation/holdout-*.csv) are never read
here; every name, company, phone number and amount is invented; a fixed seed gives the same file
every time. Labels follow evaluation/LABELLING.md.
"""

from __future__ import annotations

import csv
import random
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "synthetic-v2.csv"
SEED = 2026
NAIROBI = timezone(timedelta(hours=3))
U, M, L = "urgent", "medium", "low"

# ---------------------------------------------------------------- invented fillers

FIRST = (
    "Amina Brian Wanjiru Otieno Faith Kevin Achieng Mwangi Halima Peter Njeri Juma Mercy Kiprop "
    "Zawadi Baraka Wairimu Hassan Moraa Kamau Akinyi Ochieng Chebet Mutua Nekesa Wafula Rehema "
    "Salim Nyambura Kibet Atieno Omondi Wambui Swaleh Jepchirchir Musyoka Auma Njoroge"
).split()
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
    "Bidii Construction",
    "Furaha Restaurant",
    "Imara Couriers",
    "Jirani Supermarket",
    "Tausi Laundry",
    "Simba Car Wash",
    "Mvua Plumbing",
    "Zuri Beauty",
    "Kazi Bora Agency",
    "Uhuru Cafe",
    "Nuru Electricals",
    "Pamoja Sacco Canteen",
    "Mlima Guest House",
    "Kijani Gardens",
    "Sokoni Wholesalers",
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
    "Kahawa West",
    "Donholm",
    "Lavington",
    "Syokimau",
    "Kikuyu",
    "Ruiru",
    "Kawangware",
    "Pipeline",
    "Mombasa Road",
    "Upper Hill",
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
    "car washer",
    "cashier",
    "nanny",
    "gardener",
    "welder",
    "delivery rider",
    "kitchen helper",
    "receptionist",
    "mover",
    "carpenter",
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
    "mwoshaji magari",
    "mlezi wa watoto",
    "mtunza bustani",
    "fundi chuma",
    "msaidizi jikoni",
    "fundi seremala",
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
    "1.5k",
    "Sh 900",
    "KSh 600 + lunch",
    "KSh 3,500 kwa wiki",
    "500 bob per hour",
    "1,200/=",
]
SHORT_LINK = [
    "bit.ly/kz-job",
    "tinyurl.com/kazi-now",
    "bit.ly/3xJobKe",
    "cutt.ly/pay-fast",
    "t.ly/winkes",
    "bit.ly/verify-kf",
    "rb.gy/kazi24",
    "is.gd/jobske",
    "tinyurl.com/mpesa-bonus",
]
SITE = [
    "www.kilelebuilders.co.ke",
    "pwanievents.co.ke",
    "www.tumainicleaners.com",
    "safarimovers.co.ke",
    "www.upendohotel.co.ke",
    "nyotasalon.co.ke",
]
TIME_EN = ["2pm", "3 pm", "4:30pm", "6pm", "5 pm", "11am", "1:00 pm", "7pm", "8 pm", "noon"]
SAA = [
    "saa nane mchana",
    "saa tisa",
    "saa kumi jioni",
    "saa sita mchana",
    "saa saba",
    "saa moja jioni",
    "saa mbili usiku",
    "saa tano asubuhi",
    "saa kumi na moja",
]
MORNING_EN = ["6am", "7 am", "7:30am", "8am", "6:30 am"]
MORNING_SW = [
    "saa kumi na mbili asubuhi",
    "saa moja asubuhi",
    "saa mbili asubuhi",
    "saa moja na nusu",
]
DAY_EN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "next week"]
SIKU = ["Jumatatu", "Jumanne", "Jumatano", "Alhamisi", "Ijumaa", "Jumamosi", "wiki ijayo"]
JOB_TITLE_EN = [
    "{skill} needed",
    "{skill} wanted in {place}",
    "Looking for a {skill}",
    "{skill} - {place}",
    "Hiring: {skill}",
    "{skill} job",
    "{skill} for {company}",
]
JOB_TITLE_SW = [
    "Tunahitaji {kazi}",
    "{kazi} anahitajika {place}",
    "Nafasi ya {kazi}",
    "Kazi ya {kazi}",
    "{kazi} - {place}",
]
JOB_TITLE_SH = [
    "Tuna-need {skill} {place}",
    "{skill} anatafutwa",
    "Job ya {skill}",
    "Kazi ya {skill} {place}",
    "Mbogi tunatafuta {skill}",
]


def phone(rng: random.Random) -> str:
    return rng.choice(["07", "01", "+2547", "0 7"]).replace(" ", "") + "".join(
        rng.choice("0123456789") for _ in range(8)
    )


def fill(rng: random.Random, text: str) -> str:
    values = {
        "name": rng.choice(FIRST),
        "name2": rng.choice(FIRST),
        "company": rng.choice(COMPANY),
        "place": rng.choice(PLACE),
        "skill": rng.choice(SKILL_EN),
        "kazi": rng.choice(SKILL_SW),
        "pay": rng.choice(PAY),
        "time": rng.choice(TIME_EN),
        "saa": rng.choice(SAA),
        "morning": rng.choice(MORNING_EN),
        "asubuhi": rng.choice(MORNING_SW),
        "mins": rng.choice(["10", "15", "20", "30", "45", "40"]),
        "hours": rng.choice(["1", "2", "3"]),
        "days": rng.choice(["3", "4", "5", "7", "10", "14"]),
        "link": rng.choice(SHORT_LINK),
        "site": rng.choice(SITE),
        "phone": phone(rng),
        "fee": rng.choice(
            ["500", "1,000", "1,500", "2,000", "300", "750", "5,000", "250", "3,000"]
        ),
        "day": rng.choice(DAY_EN),
        "siku": rng.choice(SIKU),
        "prize": rng.choice(["KSh 50,000", "KSh 25,000", "100k", "a Samsung phone", "KSh 10,000"]),
        "code": rng.choice(["RKT4X9PL2M", "SJ7Q2WE8ZA", "QHB3N6LK0P"]),
    }
    return text.format(**values)


# ---------------------------------------------------------------- situations


@dataclass
class Situation:
    id: str
    label: str  # urgent | medium | low | spam
    type: str  # job_alert | status_update | message | announcement
    sender: str
    recipient: str
    #: Job alerts: (min, max) minutes to the deadline; None otherwise.
    deadline: tuple[int, int] | None
    en: list[str]
    sw: list[str]
    sh: list[str]
    #: Hard negative: honest although it mentions money, links or secrets.
    hard: bool = False
    #: The priority of a spam message (recorded for completeness, never scored).
    spam_priority: str = M
    weight: float = 1.0
    titles: dict = field(default_factory=dict)


SITUATIONS: list[Situation] = []


def S(id, label, type_, sender, recipient, deadline, en, sw, sh, **kw):  # noqa: N802 (short on purpose)
    SITUATIONS.append(Situation(id, label, type_, sender, recipient, deadline, en, sw, sh, **kw))


B, W, A, Y = "business", "worker", "admin", "system"
JA, SU, MS, AN = "job_alert", "status_update", "message", "announcement"

# ----- URGENT: act within a few hours (today) or lose something -----
S(
    "u-job-closing",
    U,
    JA,
    B,
    W,
    (10, 180),
    [
        "{company} needs a {skill} today in {place}. Pay {pay}. Applications close soon",
        "Need a {skill} urgently, closing in less than an hour. {pay}",
        "{skill} needed for today only. First to apply gets it. {pay}",
    ],
    [
        "{company} inahitaji {kazi} leo {place}. Malipo {pay}. Maombi yanafungwa hivi karibuni",
        "Tunahitaji {kazi} haraka, nafasi inafungwa ndani ya saa moja. {pay}",
    ],
    [
        "Tuna-need {skill} leo {place}, doh ni {pay}. Deadline ni saa hii",
        "{skill} anatafutwa leo, apply fasta kabla ifunge. {pay}",
    ],
)
S(
    "u-job-tonight",
    U,
    JA,
    B,
    W,
    (60, 600),
    [
        "Night shift tonight from {time} at {company}, {place}. {pay}",
        "We need someone tonight for an event in {place}. Starts {time}. {pay}",
    ],
    [
        "Zamu ya usiku leo kuanzia {saa} {company} {place}. Malipo {pay}",
        "Tunahitaji mtu leo usiku kwa sherehe {place}. Tunaanza {saa}",
    ],
    [
        "Shift ya usiku leo from {time} pale {place}, {pay}",
        "Event leo usiku {place}, tunaanza {time}. Kuja tu msee, {pay}",
    ],
)
S(
    "u-job-starts-mins",
    U,
    JA,
    B,
    W,
    (10, 120),
    [
        "Work starts in {mins} minutes at {place}. {company} pays {pay}",
        "Can start right now? {skill} needed at {place}, {pay}",
    ],
    [
        "Kazi inaanza baada ya dakika {mins} {place}. {company} wanalipa {pay}",
        "Unaweza kuanza sasa hivi? {kazi} anahitajika {place}",
    ],
    [
        "Job inaanza in {mins} mins pale {place}. Doh {pay}",
        "Uko free saa hii? {skill} anahitajika {place} sasa hivi",
    ],
)
S(
    "u-job-staff-short",
    U,
    JA,
    B,
    W,
    (30, 240),
    [
        "We are short of staff this afternoon. {skill} needed by {time} in {place}",
        "Two {skill}s did not show up. Replacement needed today by {time}",
    ],
    [
        "Tumepungukiwa na wafanyakazi mchana huu. {kazi} anahitajika kufika {saa}",
        "Watu wawili hawajafika. Tunahitaji mbadala leo kabla ya {saa}",
    ],
    [
        "Watu hawajakuja leo, tuna-need {skill} by {time} pale {place}",
        "Mbogi imepungua leo, tafuta replacement fasta, {skill} by {time}",
    ],
)
S(
    "u-job-today-only",
    U,
    JA,
    B,
    W,
    (60, 300),
    [
        "One-day job TODAY: {skill} at {company}, {place}. Report by {time}",
        "Casual work today only. {pay}, paid same day",
    ],
    [
        "Kazi ya siku moja LEO: {kazi} {company}, {place}. Fika kabla ya {saa}",
        "Kibarua cha leo tu. {pay}, malipo siku hiyo hiyo",
    ],
    [
        "Kibarua ya leo tu {place}, ripoti before {time}. {pay}",
        "Job ya leo pekee, {pay} unalipwa jioni",
    ],
)
S(
    "u-job-asap",
    U,
    JA,
    B,
    W,
    (10, 150),
    ["{skill} ASAP!! {place}. {pay}", "URGENT: {skill} needed now in {place}"],
    ["HARAKA: {kazi} anahitajika sasa {place}", "Dharura! Tunahitaji {kazi} sasa hivi"],
    ["URGENT msee, {skill} sahii {place}", "Ni dharura, {skill} aje sasa hivi {place}"],
)
S(
    "u-job-deliver-before",
    U,
    JA,
    B,
    W,
    (20, 180),
    [
        "Delivery must leave {place} before {time} today. Rider needed now. {pay}",
        "Goods arriving at {time}, need loaders today in {place}",
    ],
    [
        "Mzigo unafika {saa} leo, tunahitaji wabebaji {place}",
        "Mpelekaji anahitajika sasa, mzigo uondoke kabla ya {saa}",
    ],
    [
        "Mzigo inafika {time} leo, tuna-need loaders {place}",
        "Rider anatafutwa sahii, mzigo itoke before {time}",
    ],
)
S(
    "u-status-confirm-today",
    U,
    SU,
    B,
    W,
    None,
    [
        "{company} accepted you as {skill}. Confirm by {time} today or the place goes to someone else",
        "You got the job! Please confirm before {time} today",
    ],
    [
        "{company} wamekukubali kama {kazi}. Thibitisha kabla ya {saa} leo la sivyo nafasi itapewa mwingine",
        "Umepata kazi! Tafadhali thibitisha kabla ya {saa} leo",
    ],
    [
        "Umepata job! Confirm before {time} leo ama nafasi inaenda kwa mwingine",
        "{company} wamekuchagua msee, confirm leo by {time}",
    ],
)
S(
    "u-status-interview-today",
    U,
    SU,
    B,
    W,
    None,
    [
        "Interview today at {time} in {place}. Please confirm now",
        "{company} wants to meet you today at {time}. Reply to confirm",
    ],
    [
        "Usaili leo {saa} {place}. Tafadhali thibitisha sasa",
        "{company} wanataka kukutana nawe leo {saa}. Jibu kuthibitisha",
    ],
    [
        "Interview ni leo {time} pale {place}, confirm sahii",
        "{company} wanataka kukuona leo {time}, reply fasta",
    ],
)
S(
    "u-status-shift-moved-today",
    U,
    SU,
    B,
    W,
    None,
    [
        "Change: today's shift now starts at {time}, not later. Please confirm you can make it",
        "Your shift today was moved to {place}. Go there instead",
    ],
    [
        "Mabadiliko: zamu ya leo sasa inaanza {saa}. Thibitisha kama utaweza",
        "Zamu yako ya leo imehamishiwa {place}. Nenda huko badala yake",
    ],
    [
        "Shift ya leo imesongeshwa, sasa ni {time}. Confirm kama utafika",
        "Location ya leo imebadilika, ni {place} sasa. Usiende ile ingine",
    ],
)
S(
    "u-status-cancel-today",
    U,
    SU,
    B,
    W,
    None,
    [
        "Today's job at {place} is cancelled. Do not travel",
        "Shift cancelled for today, please don't come",
    ],
    ["Kazi ya leo {place} imeghairiwa. Usisafiri", "Zamu ya leo imefutwa, tafadhali usije"],
    ["Job ya leo imecancel, usikuje msee", "Shift ya leo hakuna, usipoteze fare"],
)
S(
    "u-msg-are-you-coming",
    U,
    MS,
    B,
    W,
    None,
    [
        "The shift starts in {mins} minutes, are you coming? Reply now please",
        "We are waiting for you at {place}. Where are you?",
        "Are you still coming today? Answer quickly",
    ],
    [
        "Zamu inaanza baada ya dakika {mins}, unakuja? Jibu sasa hivi",
        "Tunakusubiri {place}. Uko wapi?",
        "Bado unakuja leo? Jibu haraka",
    ],
    [
        "Shift inaanza in {mins} mins, unakuja ama? Reply sahii",
        "Tuko {place} tunakungoja, uko wapi msee?",
        "Bado unakam leo? Nijibu fasta",
    ],
)
S(
    "u-msg-start-tonight",
    U,
    MS,
    B,
    W,
    None,
    [
        "Can you start tonight at {time}? We need an answer within the hour",
        "Are you free in two hours? I need help with a {skill} job",
    ],
    [
        "Unaweza kuanza leo usiku {saa}? Tunahitaji jibu ndani ya saa moja",
        "Uko huru baada ya saa mbili? Nahitaji msaada wa kazi ya {kazi}",
    ],
    [
        "Unaweza anza leo usiku {time}? Nijibu within an hour",
        "Uko free in 2 hours? Kuna job ya {skill} ya leo",
    ],
)
S(
    "u-msg-worker-at-gate",
    U,
    MS,
    W,
    B,
    None,
    [
        "I am at the gate in {place} but nobody is here. Shift starts now, please call",
        "I have arrived for the job but the place is locked. What should I do?",
    ],
    [
        "Niko getini {place} lakini hakuna mtu. Zamu inaanza sasa, tafadhali piga simu",
        "Nimefika kazini lakini pamefungwa. Nifanye nini?",
    ],
    [
        "Niko gate {place} hakuna mtu, shift inaanza sahii. Nipigie",
        "Nimefika lakini kuko locked, nifanye aje?",
    ],
)
S(
    "u-msg-worker-late",
    U,
    MS,
    W,
    B,
    None,
    [
        "I am stuck in traffic, I will be {mins} minutes late. Is that ok?",
        "My matatu broke down. Can I come at {time} instead?",
    ],
    [
        "Nimekwama kwenye msongamano, nitachelewa dakika {mins}. Ni sawa?",
        "Matatu imeharibika. Naweza kuja {saa} badala yake?",
    ],
    ["Niko kwa jam, nitachelewa {mins} mins. Iko sawa?", "Mat imeharibika, naweza kuja {time}?"],
)
S(
    "u-msg-worker-sick-today",
    U,
    MS,
    W,
    B,
    None,
    [
        "I am sick and cannot come today. Please find someone else for this morning",
        "Emergency at home, I can't make today's shift",
    ],
    [
        "Mimi ni mgonjwa siwezi kuja leo. Tafadhali tafuta mtu mwingine asubuhi hii",
        "Nina dharura nyumbani, siwezi kufika zamu ya leo",
    ],
    [
        "Niko mgonjwa, siwezi kam leo. Tafuta mtu mwingine",
        "Kuna emergency home, sitaweza shift ya leo",
    ],
)
S(
    "u-msg-employer-noshow",
    U,
    MS,
    B,
    W,
    None,
    [
        "You were supposed to start at {morning}. If you are not here in 30 minutes we will take someone else",
        "Last chance: come now or we give the job to the next person",
    ],
    [
        "Ulitakiwa kuanza {asubuhi}. Usipofika ndani ya dakika 30 tutachukua mtu mwingine",
        "Nafasi ya mwisho: kuja sasa au kazi tunampa mwingine",
    ],
    [
        "Ulifaa kuanza {morning}. Usipofika in 30 mins tunachukua mtu mwingine",
        "Last chance msee, kuja sahii ama job inaenda",
    ],
)
S(
    "u-new-applicant-today",
    U,
    SU,
    Y,
    B,
    None,
    [
        "{name} applied for the {skill} job that starts in {hours} hours. Accept now so they can come",
        "New applicant for today's shift: {name}. The job starts at {time}",
    ],
    [
        "{name} ameomba kazi ya {kazi} inayoanza baada ya saa {hours}. Kubali sasa ili aje",
        "Mwombaji mpya wa zamu ya leo: {name}. Kazi inaanza {saa}",
    ],
    [
        "{name} ame-apply job ya leo inaanza in {hours} hrs. Accept sahii",
        "Applicant mpya wa shift ya leo: {name}, job ni {time}",
    ],
)
S(
    "u-msg-location-now",
    U,
    MS,
    B,
    W,
    None,
    [
        "Please send me your location now, the driver is leaving to pick you",
        "The van leaves {place} in {mins} minutes. Be at the stage",
    ],
    [
        "Tafadhali nitumie mahali ulipo sasa, dereva anaondoka kukuchukua",
        "Gari linaondoka {place} baada ya dakika {mins}. Uwe kituoni",
    ],
    [
        "Nitumie location sahii, driver anakuja kukuchukua",
        "Van inatoka {place} in {mins} mins, kuwa stage",
    ],
)
S(
    "u-msg-safety",
    U,
    MS,
    B,
    W,
    None,
    [
        "Do not come to {place} today, there are protests on the road. Wait for my call",
        "Heavy rain has flooded the site. Stay home today",
    ],
    [
        "Usije {place} leo, kuna maandamano barabarani. Subiri simu yangu",
        "Mvua kubwa imefurika eneo la kazi. Kaa nyumbani leo",
    ],
    ["Usikuje {place} leo kuna maandamano, ngoja nikupigie", "Site imejaa maji, usikam leo"],
)
S(
    "u-msg-confirm-by",
    U,
    MS,
    B,
    W,
    None,
    [
        "Please confirm by {time} if you will take the job, I have other people waiting",
        "Reply YES before {time} today to keep your place",
    ],
    [
        "Tafadhali thibitisha kabla ya {saa} kama utachukua kazi, kuna watu wengine wanasubiri",
        "Jibu NDIYO kabla ya {saa} leo kubaki na nafasi yako",
    ],
    [
        "Confirm before {time} kama unachukua job, kuna wengine wanangoja",
        "Reply YES before {time} leo ama nafasi inaenda",
    ],
)
S(
    "u-msg-bring-id-now",
    U,
    MS,
    B,
    W,
    None,
    [
        "Security at the gate needs your ID number before you enter. Send it now, you start in {mins} minutes",
        "Gate pass needed now. Tell me your full name for the guard list",
    ],
    [
        "Mlinzi getini anahitaji jina lako kamili kabla uingie. Nitumie sasa, unaanza baada ya dakika {mins}",
        "Kibali cha kuingia kinahitajika sasa. Niambie jina lako kamili",
    ],
    [
        "Guard wa gate anataka jina yako kamili, nitumie sahii, unaanza in {mins} mins",
        "Gate pass inahitajika sahii, nipe full name",
    ],
)
S(
    "u-job-event-today",
    U,
    JA,
    B,
    W,
    (60, 360),
    [
        "Ushers needed for a wedding this afternoon in {place}. Report at {time}",
        "Waiters needed for a function today at {company}. {pay}",
    ],
    [
        "Wakaribishaji wanahitajika kwa harusi mchana huu {place}. Fika {saa}",
        "Wahudumu wanahitajika kwa sherehe leo {company}. {pay}",
    ],
    [
        "Ushers wanatafutwa wedding leo mchana {place}, ripoti {time}",
        "Waiters wa function leo pale {company}, {pay}",
    ],
)
S(
    "u-job-before-dark",
    U,
    JA,
    B,
    W,
    (30, 240),
    [
        "Need a plumber before dark, burst pipe in {place}. {pay}",
        "Electrician needed today, no power at our shop in {place}",
    ],
    [
        "Fundi bomba anahitajika kabla ya giza, bomba limepasuka {place}",
        "Fundi umeme anahitajika leo, hakuna stima dukani {place}",
    ],
    [
        "Fundi wa bomba before giza, pipe imepasuka {place}",
        "Tuna-need fundi wa stima leo, hakuna power kwa shop {place}",
    ],
)
S(
    "u-status-shift-reminder-now",
    U,
    SU,
    Y,
    W,
    None,
    [
        "Reminder: your shift at {company} starts in {mins} minutes",
        "Your job starts in 1 hour at {place}",
    ],
    [
        "Kumbusho: zamu yako {company} inaanza baada ya dakika {mins}",
        "Kazi yako inaanza baada ya saa moja {place}",
    ],
    [
        "Reminder: shift yako {company} inaanza in {mins} mins",
        "Job yako inaanza in 1 hr pale {place}",
    ],
)
S(
    "u-msg-employer-call-me",
    U,
    MS,
    B,
    W,
    None,
    [
        "Call me now on {phone}, the client changed the time to {time} today",
        "Pick my call, it is about today's job. {phone}",
    ],
    [
        "Nipigie sasa kwa {phone}, mteja amebadilisha muda kuwa {saa} leo",
        "Pokea simu yangu, ni kuhusu kazi ya leo. {phone}",
    ],
    [
        "Nipigie sahii {phone}, client amechange time ni {time} leo",
        "Shika simu msee, ni about job ya leo. {phone}",
    ],
    hard=True,
)
S(
    "u-job-mpesa-today",
    U,
    JA,
    B,
    W,
    (20, 170),
    [
        "{skill} needed today in {place}. {company} pays {pay} by M-Pesa at the end of the day",
        "Work today, paid via M-Pesa after the shift. Starts in {hours} hours",
    ],
    [
        "{kazi} anahitajika leo {place}. {company} wanalipa {pay} kwa M-Pesa jioni",
        "Kazi leo, malipo kwa M-Pesa baada ya zamu. Inaanza baada ya saa {hours}",
    ],
    [
        "{skill} leo {place}, doh ni {pay} kwa M-Pesa jioni",
        "Job ya leo, unalipwa M-Pesa after shift. Inaanza in {hours} hrs",
    ],
    hard=True,
)
S(
    "u-business-worker-cancel",
    U,
    MS,
    W,
    B,
    None,
    [
        "Sorry, I cannot come for the {time} shift today. Please get someone else quickly",
        "I can no longer do today's job, my child is sick",
    ],
    [
        "Samahani, siwezi kuja zamu ya {saa} leo. Tafadhali tafuta mtu mwingine haraka",
        "Siwezi tena kufanya kazi ya leo, mtoto wangu ni mgonjwa",
    ],
    [
        "Sorry, sitaweza shift ya {time} leo, tafuta mwingine fasta",
        "Siwezi job ya leo tena, mtoi ni mgonjwa",
    ],
)
S(
    "u-msg-payment-wrong-now",
    U,
    MS,
    W,
    B,
    None,
    [
        "I finished the job but the gate guard won't let me leave without your signature. Please come",
        "The client refused to sign my timesheet, I'm still at {place}. Please call them now",
    ],
    [
        "Nimemaliza kazi lakini mlinzi hataki niondoke bila sahihi yako. Tafadhali kuja",
        "Mteja amekataa kusaini karatasi yangu, bado niko {place}. Tafadhali mpigie sasa",
    ],
    [
        "Nimemaliza job lakini guard hataki niende bila signature yako, kuja",
        "Client amekataa ku-sign, bado niko {place}, mpigie sahii",
    ],
)

# ----- MEDIUM: needs attention within a day or two -----
S(
    "m-job-tomorrow",
    M,
    JA,
    B,
    W,
    (600, 2880),
    [
        "{company} needs a {skill} in {place} tomorrow. {pay}. Apply before tomorrow morning",
        "Job for tomorrow: {skill} at {place}. {pay}",
    ],
    [
        "{company} wanahitaji {kazi} {place} kesho. {pay}. Omba kabla ya kesho asubuhi",
        "Kazi ya kesho: {kazi} {place}. {pay}",
    ],
    [
        "Job ya kesho: {skill} pale {place}, doh {pay}",
        "{company} wanatafuta {skill} kesho {place}, apply leo",
    ],
)
S(
    "m-job-this-week",
    M,
    JA,
    B,
    W,
    (720, 2880),
    [
        "{skill} needed this week in {place}. Applications close in two days",
        "Hiring {skill} from {day}. {pay}",
    ],
    [
        "{kazi} anahitajika wiki hii {place}. Maombi yanafungwa baada ya siku mbili",
        "Tunaajiri {kazi} kuanzia {siku}. {pay}",
    ],
    [
        "Tuna-hire {skill} wiki hii {place}, deadline ni in 2 days",
        "{skill} anatafutwa from {day}, {pay}",
    ],
)
S(
    "m-job-app-format",
    M,
    JA,
    B,
    W,
    (300, 2880),
    ["{company} needs {skill} in {place}. Pay: {pay}. Apply before {day}"],
    ["{company} inahitaji {kazi} huko {place}. Malipo: {pay}. Omba kabla ya {siku}"],
    ["{company} wana-need {skill} {place}. Doh: {pay}. Apply before {day}"],
)
S(
    "m-status-reviewed",
    M,
    SU,
    Y,
    W,
    None,
    ["{company} looked at your application for the {skill} job", "Your application was reviewed"],
    ["{company} wameangalia ombi lako la kazi ya {kazi}", "Ombi lako limeangaliwa"],
    ["{company} wame-check application yako ya {skill}", "Application yako imeangaliwa"],
)
S(
    "m-status-rejected",
    M,
    SU,
    Y,
    W,
    None,
    [
        "{company} chose other people for the {skill} job. New jobs are added every day",
        "Sorry, you were not selected this time",
    ],
    [
        "{company} wamechagua watu wengine kwa kazi ya {kazi}. Kazi mpya huongezwa kila siku",
        "Samahani, hukuchaguliwa wakati huu",
    ],
    [
        "Pole, {company} wamechukua watu wengine. Jobs mpya zinakuja kila siku",
        "Sorry msee, hukuchaguliwa saa hii",
    ],
)
S(
    "m-status-accepted-later",
    M,
    SU,
    B,
    W,
    None,
    [
        "{company} accepted your application for {day}. Open Messages to agree the details",
        "You are selected for the job on {day}. We will send the address tomorrow",
    ],
    [
        "{company} wamekubali ombi lako la {siku}. Fungua Ujumbe mkubaliane maelezo",
        "Umechaguliwa kwa kazi ya {siku}. Tutatuma anwani kesho",
    ],
    [
        "Umechaguliwa job ya {day}, tutakutumia location kesho",
        "{company} wame-accept application yako ya {day}, check Messages",
    ],
)
S(
    "m-new-applicant",
    M,
    SU,
    Y,
    B,
    None,
    ["{name} applied for your {skill} job", "New applicant: {name} for the {skill} job on {day}"],
    ["{name} ameomba kazi yako ya {kazi}", "Mwombaji mpya: {name} kwa kazi ya {siku}"],
    ["{name} ame-apply job yako ya {skill}", "Applicant mpya: {name}, job ya {day}"],
)
S(
    "m-msg-question",
    M,
    MS,
    B,
    W,
    None,
    [
        "Do you have your own tools for the job on {day}?",
        "Have you done {skill} work before? Please tell me",
    ],
    [
        "Una vifaa vyako mwenyewe kwa kazi ya {siku}?",
        "Umewahi kufanya kazi ya {kazi}? Tafadhali niambie",
    ],
    ["Uko na tools zako za job ya {day}?", "Ushawahi fanya kazi ya {skill} before?"],
)
S(
    "m-msg-worker-question",
    M,
    MS,
    W,
    B,
    None,
    [
        "Is lunch provided on {day}?",
        "What time should I come on {day}?",
        "Is the pay per day or per hour?",
    ],
    [
        "Je, chakula cha mchana kitatolewa {siku}?",
        "Nifike saa ngapi {siku}?",
        "Malipo ni kwa siku au kwa saa?",
    ],
    ["Kuna lunch {day} ama?", "Nikam saa ngapi {day}?", "Doh ni per day ama per hour?"],
)
S(
    "m-msg-arrange-tomorrow",
    M,
    MS,
    B,
    W,
    None,
    [
        "Tomorrow we start at {morning} in {place}. Bring your ID",
        "See you tomorrow at {morning}. Wear closed shoes",
    ],
    [
        "Kesho tunaanza {asubuhi} {place}. Leta kitambulisho",
        "Tuonane kesho {asubuhi}. Vaa viatu vilivyofungwa",
    ],
    [
        "Kesho tunaanza {morning} pale {place}, kuja na ID",
        "Tuonane kesho {morning}, vaa viatu fiti",
    ],
)
S(
    "m-msg-reply-tomorrow",
    M,
    MS,
    B,
    W,
    None,
    [
        "Let me know by tomorrow if you can do the job on {day}",
        "Think about it and reply by tomorrow evening",
    ],
    ["Nijulishe kufikia kesho kama unaweza kazi ya {siku}", "Fikiria na unijibu kesho jioni"],
    ["Ni-update by kesho kama utaweza job ya {day}", "Fikiria then unijibu kesho jioni"],
)
S(
    "m-msg-interview-tomorrow",
    M,
    MS,
    B,
    W,
    None,
    [
        "Can you come for a short interview tomorrow at {time}?",
        "We would like to talk to you on {day}",
    ],
    ["Unaweza kuja kwa usaili mfupi kesho {saa}?", "Tungependa kuongea nawe {siku}"],
    ["Unaweza kuja interview kesho {time}?", "Tungependa ku-talk na wewe {day}"],
)
S(
    "m-msg-pay-sent",
    M,
    MS,
    B,
    W,
    None,
    [
        "We sent your wages of {pay} by M-Pesa. Please confirm you received them",
        "Your payment for last week has been sent",
    ],
    [
        "Tumekutumia malipo yako {pay} kwa M-Pesa. Tafadhali thibitisha umepokea",
        "Malipo yako ya wiki iliyopita yametumwa",
    ],
    ["Tumekutumia doh {pay} kwa M-Pesa, confirm kama imefika", "Pesa ya last week imetumwa msee"],
    hard=True,
)
S(
    "m-msg-wages-after",
    M,
    MS,
    B,
    W,
    None,
    [
        "Your wages of {pay} will be paid by M-Pesa after the shift on {day}",
        "Payment is by M-Pesa every Friday evening",
    ],
    [
        "Malipo yako {pay} yatatumwa kwa M-Pesa baada ya kazi {siku}",
        "Malipo ni kwa M-Pesa kila Ijumaa jioni",
    ],
    ["Doh yako {pay} itatumwa M-Pesa after shift ya {day}", "Tunalipa M-Pesa kila Friday jioni"],
    hard=True,
)
S(
    "m-msg-refund",
    M,
    MS,
    B,
    W,
    None,
    [
        "We refunded your fare to your M-Pesa. Please confirm you got it",
        "Your bus fare of {pay} has been refunded",
    ],
    [
        "Tumekurudishia nauli kwa M-Pesa. Tafadhali thibitisha umeipata",
        "Nauli yako {pay} imerudishwa",
    ],
    ["Tumekurudishia fare kwa M-Pesa, confirm uki-get", "Fare yako imerudishwa msee"],
    hard=True,
)
S(
    "m-msg-send-cv",
    M,
    MS,
    B,
    W,
    None,
    [
        "Please send your CV through Messages before {day}",
        "Upload a photo of your certificate by {day}",
    ],
    [
        "Tafadhali tuma wasifu wako kupitia Ujumbe kabla ya {siku}",
        "Pakia picha ya cheti chako kufikia {siku}",
    ],
    ["Tuma CV yako kwa Messages before {day}", "Upload picha ya cert yako by {day}"],
)
S(
    "m-admin-verify-profile",
    M,
    AN,
    A,
    W,
    None,
    [
        "Please add your phone number to your profile within 2 days to keep getting SMS alerts",
        "Your profile is missing a photo. Add one this week",
    ],
    [
        "Tafadhali ongeza nambari yako ya simu kwenye wasifu ndani ya siku 2 ili uendelee kupata SMS",
        "Wasifu wako hauna picha. Ongeza moja wiki hii",
    ],
    [
        "Ongeza number yako kwa profile in 2 days upate SMS",
        "Profile yako haina picha, weka wiki hii",
    ],
)
S(
    "m-msg-employer-feedback",
    M,
    MS,
    B,
    W,
    None,
    [
        "Good work yesterday. We may need you again on {day}",
        "Thanks for the work. Are you available next week?",
    ],
    [
        "Kazi nzuri jana. Huenda tukakuhitaji tena {siku}",
        "Asante kwa kazi. Utapatikana wiki ijayo?",
    ],
    ["Kazi poa jana, tunaweza kukuitisha tena {day}", "Asante, uko available next week?"],
)
S(
    "m-msg-worker-availability",
    M,
    MS,
    W,
    B,
    None,
    [
        "I am available from {day} if you still need a {skill}",
        "I can work on weekends. Let me know",
    ],
    [
        "Ninapatikana kuanzia {siku} kama bado mnahitaji {kazi}",
        "Naweza kufanya kazi wikendi. Nijulishe",
    ],
    ["Niko available from {day} kama bado mna-need {skill}", "Naweza fanya weekends, ni-update"],
)
S(
    "m-status-shift-tomorrow",
    M,
    SU,
    Y,
    W,
    None,
    [
        "Reminder: your shift at {company} is tomorrow at {morning}",
        "You have a job tomorrow in {place}",
    ],
    ["Kumbusho: zamu yako {company} ni kesho {asubuhi}", "Una kazi kesho {place}"],
    ["Reminder: shift yako ni kesho {morning} pale {company}", "Uko na job kesho {place}"],
)
S(
    "m-msg-timesheet",
    M,
    MS,
    B,
    W,
    None,
    ["Please send the hours you worked this week before {day}", "Fill in your timesheet by {day}"],
    [
        "Tafadhali tuma saa ulizofanya kazi wiki hii kabla ya {siku}",
        "Jaza karatasi ya saa kufikia {siku}",
    ],
    ["Tuma masaa ulifanya wiki hii before {day}", "Jaza timesheet by {day}"],
)
S(
    "m-msg-direction",
    M,
    MS,
    B,
    W,
    None,
    [
        "Our office is next to the petrol station in {place}. Call {phone} when you arrive on {day}",
        "The site is behind the market in {place}. See you {day}",
    ],
    [
        "Ofisi yetu iko karibu na kituo cha mafuta {place}. Piga {phone} ukifika {siku}",
        "Eneo la kazi liko nyuma ya soko {place}. Tuonane {siku}",
    ],
    [
        "Office iko next to petrol station {place}, nipigie {phone} ukifika {day}",
        "Site iko nyuma ya soko {place}, tuonane {day}",
    ],
    hard=True,
)
S(
    "m-employer-rate-worker",
    M,
    AN,
    Y,
    B,
    None,
    [
        "Please rate {name}, who worked for you yesterday",
        "How was {name}'s work? Leave a rating within 2 days",
    ],
    [
        "Tafadhali mpe alama {name} aliyekufanyia kazi jana",
        "Kazi ya {name} ilikuwaje? Toa alama ndani ya siku 2",
    ],
    ["Rate {name} aliku-work jana", "{name} alifanya aje? Rate in 2 days"],
)
S(
    "m-msg-pay-question",
    M,
    MS,
    W,
    B,
    None,
    [
        "I have not received my pay for {day}. Please check",
        "The amount you sent is less than we agreed",
    ],
    [
        "Sijapokea malipo yangu ya {siku}. Tafadhali angalia",
        "Kiasi ulichotuma ni kidogo kuliko tulivyokubaliana",
    ],
    ["Sijapata doh ya {day}, check tafadhali", "Pesa umetuma ni kidogo kuliko tuliagree"],
)
S(
    "m-msg-job-change-next-week",
    M,
    MS,
    B,
    W,
    None,
    [
        "Next week's job will start at {time} instead of {morning}",
        "From {day} the work moves to {place}",
    ],
    ["Kazi ya wiki ijayo itaanza {saa} badala ya asubuhi", "Kuanzia {siku} kazi inahamia {place}"],
    ["Job ya next week itaanza {time} badala ya morning", "From {day} job inahamia {place}"],
)
S(
    "m-admin-report-review",
    M,
    AN,
    A,
    W,
    None,
    [
        "We are reviewing a report about a job you applied for. We will update you in 48 hours",
        "Your account check is in progress. Reply to this message if you have questions",
    ],
    [
        "Tunakagua ripoti kuhusu kazi uliyoomba. Tutakujulisha ndani ya saa 48",
        "Ukaguzi wa akaunti yako unaendelea. Jibu ujumbe huu kama una maswali",
    ],
    [
        "Tuna-review report ya job uli-apply, tutaku-update in 48 hrs",
        "Account yako inakaguliwa, reply kama uko na swali",
    ],
)
S(
    "m-job-weekend",
    M,
    JA,
    B,
    W,
    (1440, 2880),
    [
        "Weekend work: {skill} needed on Saturday in {place}. {pay}",
        "Saturday and Sunday shifts available",
    ],
    [
        "Kazi ya wikendi: {kazi} anahitajika Jumamosi {place}. {pay}",
        "Zamu za Jumamosi na Jumapili zipo",
    ],
    ["Job ya weekend: {skill} Saturday {place}, {pay}", "Kuna shifts za Sato na Sunday"],
)
S(
    "m-msg-contract",
    M,
    MS,
    B,
    W,
    None,
    [
        "Please read the contract I sent and sign it before {day}",
        "We need your signed agreement this week",
    ],
    [
        "Tafadhali soma mkataba niliotuma na uusaini kabla ya {siku}",
        "Tunahitaji makubaliano yako yaliyosainiwa wiki hii",
    ],
    [
        "Soma contract nilikutumia then u-sign before {day}",
        "Tuna-need agreement yako signed wiki hii",
    ],
)
S(
    "m-msg-worker-thanks-question",
    M,
    MS,
    W,
    B,
    None,
    [
        "Thank you for choosing me. Where exactly is the site?",
        "Thanks! Do I need to bring my own uniform?",
    ],
    ["Asante kwa kunichagua. Eneo la kazi liko wapi hasa?", "Asante! Nilete sare yangu mwenyewe?"],
    ["Asante kunichagua, site iko wapi exactly?", "Thanks! Nikuje na uniform yangu?"],
)
S(
    "m-applicant-withdrew",
    M,
    SU,
    Y,
    B,
    None,
    [
        "{name} withdrew their application for your {skill} job",
        "One applicant cancelled. You still have 2 applicants",
    ],
    [
        "{name} ameondoa ombi lake la kazi yako ya {kazi}",
        "Mwombaji mmoja ameghairi. Bado una waombaji 2",
    ],
    ["{name} ame-withdraw application ya job yako", "Applicant mmoja ame-cancel, bado uko na 2"],
)

# ----- LOW: no action needed -----
S(
    "l-job-later",
    L,
    JA,
    B,
    W,
    (3000, 20000),
    [
        "{company} is hiring a {skill} in {place} from next month. {pay}",
        "{skill} needed in {days} days. Apply any time this week",
    ],
    [
        "{company} wanaajiri {kazi} {place} kuanzia mwezi ujao. {pay}",
        "{kazi} anahitajika baada ya siku {days}",
    ],
    [
        "{company} wana-hire {skill} next month {place}",
        "{skill} anatafutwa after {days} days, apply any time",
    ],
)
S(
    "l-job-app-format-later",
    L,
    JA,
    B,
    W,
    (3000, 20000),
    ["{company} needs {skill} in {place}. Pay: {pay}. Apply before {day} next week"],
    ["{company} inahitaji {kazi} huko {place}. Malipo: {pay}. Omba kabla ya {siku} wiki ijayo"],
    ["{company} wana-need {skill} {place}, doh {pay}. Apply before {day} next week"],
)
S(
    "l-admin-maintenance",
    L,
    AN,
    A,
    W,
    None,
    [
        "KaziForce will be down for maintenance on Sunday from 2am to 4am",
        "Planned maintenance tonight after midnight. Nothing to do",
    ],
    [
        "KaziForce haitapatikana Jumapili saa nane hadi saa kumi usiku kwa matengenezo",
        "Matengenezo yaliyopangwa usiku wa leo. Hakuna la kufanya",
    ],
    [
        "KaziForce itakuwa down Sunday 2am-4am kwa maintenance",
        "Maintenance usiku wa leo, hakuna kitu ya kufanya",
    ],
)
S(
    "l-admin-tips",
    L,
    AN,
    A,
    W,
    None,
    [
        "Tip: a profile with a photo gets more job offers",
        "Tip: add all your skills so we can send you better jobs",
    ],
    [
        "Ushauri: wasifu wenye picha hupata ofa nyingi za kazi",
        "Ushauri: ongeza ujuzi wako wote tukutumie kazi bora",
    ],
    [
        "Tip: profile iko na picha inapata job offers mingi",
        "Tip: weka skills zako zote upate jobs poa",
    ],
)
S(
    "l-admin-holiday",
    L,
    AN,
    A,
    B,
    None,
    [
        "KaziForce support is closed on Monday for the public holiday",
        "Happy Jamhuri Day from the KaziForce team",
    ],
    [
        "Huduma kwa wateja ya KaziForce imefungwa Jumatatu kwa sikukuu",
        "Heri ya Siku ya Jamhuri kutoka timu ya KaziForce",
    ],
    ["Support ya KaziForce imefungwa Monday ni holiday", "Happy Jamhuri Day kutoka KaziForce team"],
)
S(
    "l-admin-new-feature",
    L,
    AN,
    A,
    W,
    None,
    ["New: you can now choose Kiswahili in Settings", "We added dark mode. Try it in Settings"],
    [
        "Mpya: sasa unaweza kuchagua Kiswahili kwenye Mipangilio",
        "Tumeongeza hali ya giza. Ijaribu kwenye Mipangilio",
    ],
    [
        "Kitu mpya: sasa unaweza chagua Kiswahili kwa Settings",
        "Tumeweka dark mode, ijaribu kwa Settings",
    ],
)
S(
    "l-msg-thanks",
    L,
    MS,
    B,
    W,
    None,
    ["Thank you for your good work last week", "Asante for the help yesterday, God bless"],
    ["Asante kwa kazi nzuri wiki iliyopita", "Asante kwa msaada jana, Mungu akubariki"],
    ["Asante kwa kazi fiti last week", "Thanks kwa help jana msee, God bless"],
)
S(
    "l-msg-worker-thanks",
    L,
    MS,
    W,
    B,
    None,
    ["Thank you for the opportunity. It was nice working with you", "Thanks for paying on time"],
    ["Asante kwa nafasi. Ilikuwa vizuri kufanya kazi nanyi", "Asante kwa kulipa kwa wakati"],
    ["Asante kwa chance, ilikuwa poa ku-work na nyinyi", "Thanks kwa kulipa on time"],
)
S(
    "l-msg-paid-thanks",
    L,
    MS,
    B,
    W,
    None,
    [
        "Thank you! We have sent your payment by M-Pesa. Welcome again",
        "Payment done. See you next time",
    ],
    [
        "Asante! Tumekutumia malipo yako kwa M-Pesa. Karibu tena",
        "Malipo yamekamilika. Tuonane wakati mwingine",
    ],
    ["Asante! Tumekutumia doh M-Pesa, karibu tena", "Payment iko done, tuonane next time"],
    hard=True,
)
S(
    "l-msg-website",
    L,
    MS,
    B,
    W,
    None,
    ["You can see photos of our past events on {site}", "Our menu and prices are on {site}"],
    [
        "Unaweza kuona picha za sherehe zetu za zamani kwenye {site}",
        "Menyu na bei zetu ziko kwenye {site}",
    ],
    ["Picha za events zetu ziko {site}", "Menu na bei ziko kwa {site}"],
    hard=True,
)
S(
    "l-admin-pin-warning",
    L,
    AN,
    A,
    W,
    None,
    [
        "KaziForce will never ask for your M-Pesa PIN or password. Report anyone who does",
        "Stay safe: never pay a fee to get a job on KaziForce",
    ],
    [
        "KaziForce haitawahi kukuomba PIN yako ya M-Pesa au nenosiri. Ripoti yeyote anayefanya hivyo",
        "Kuwa salama: usilipe ada yoyote ili kupata kazi KaziForce",
    ],
    [
        "KaziForce haitawahi kuuliza PIN yako ya M-Pesa ama password. Report mtu yeyote",
        "Kuwa safe: usilipe fee yoyote upate job kwa KaziForce",
    ],
    hard=True,
)
S(
    "l-status-profile-viewed",
    L,
    SU,
    Y,
    W,
    None,
    ["{company} viewed your profile", "Your profile was seen by 3 employers this week"],
    ["{company} wameangalia wasifu wako", "Wasifu wako umeonwa na waajiri 3 wiki hii"],
    ["{company} wame-check profile yako", "Profile yako imeonwa na employers 3 wiki hii"],
)
S(
    "l-weekly-summary",
    L,
    AN,
    Y,
    W,
    None,
    [
        "This week: 12 new jobs near {place}. Open the app to see them",
        "Your weekly summary is ready",
    ],
    [
        "Wiki hii: kazi mpya 12 karibu na {place}. Fungua programu kuziona",
        "Muhtasari wako wa wiki uko tayari",
    ],
    ["Wiki hii: jobs mpya 12 karibu {place}, fungua app uzione", "Summary yako ya wiki iko ready"],
)
S(
    "l-rating-received",
    L,
    SU,
    Y,
    W,
    None,
    ["{company} gave you 5 stars", "You received a new rating"],
    ["{company} wamekupa nyota 5", "Umepokea alama mpya"],
    ["{company} wamekupa 5 stars", "Umepata rating mpya"],
)
S(
    "l-msg-greeting",
    L,
    MS,
    B,
    W,
    None,
    ["Merry Christmas from all of us at {company}", "Happy new year! Hope to work with you again"],
    [
        "Heri ya Krismasi kutoka kwetu sote {company}",
        "Heri ya mwaka mpya! Tunatumaini kufanya kazi nawe tena",
    ],
    ["Merry Christmas kutoka {company}", "Happy new year! Tutawork pamoja tena"],
)
S(
    "l-msg-ok",
    L,
    MS,
    W,
    B,
    None,
    ["Ok noted, thank you", "Sawa, thanks", "Received, asante"],
    ["Sawa, nimepokea", "Sawa, asante sana"],
    ["Poa, noted", "Sawa msee, asante"],
)
S(
    "l-msg-employer-ok",
    L,
    MS,
    B,
    W,
    None,
    ["Ok no problem. Have a good day", "Noted, thanks for letting me know"],
    ["Sawa, hakuna shida. Uwe na siku njema", "Nimepokea, asante kwa kunijulisha"],
    ["Sawa hakuna noma, siku njema", "Noted, asante kuni-update"],
)
S(
    "l-admin-survey",
    L,
    AN,
    A,
    W,
    None,
    [
        "Tell us what you think of KaziForce: a 2-minute survey in the app, if you like",
        "We are improving KaziForce. Your feedback is welcome any time",
    ],
    [
        "Tuambie maoni yako kuhusu KaziForce: dodoso la dakika 2 kwenye programu, ukipenda",
        "Tunaboresha KaziForce. Maoni yako yanakaribishwa wakati wowote",
    ],
    [
        "Tuambie unaonaje KaziForce, survey ya 2 mins kwa app ukipenda",
        "Tuna-improve KaziForce, feedback yako inakaribishwa",
    ],
)
S(
    "l-admin-stats",
    L,
    AN,
    A,
    B,
    None,
    [
        "Last month 2,000 workers found jobs through KaziForce. Thank you",
        "KaziForce now has employers in 12 counties",
    ],
    [
        "Mwezi uliopita wafanyakazi 2,000 walipata kazi kupitia KaziForce. Asante",
        "KaziForce sasa ina waajiri katika kaunti 12",
    ],
    [
        "Last month watu 2,000 walipata job kupitia KaziForce",
        "KaziForce iko na employers kwa counties 12 sasa",
    ],
)
S(
    "l-job-closed",
    L,
    SU,
    Y,
    W,
    None,
    ["The {skill} job in {place} is now closed", "A job you saved has been filled"],
    ["Kazi ya {kazi} {place} sasa imefungwa", "Kazi uliyohifadhi imejazwa"],
    ["Job ya {skill} {place} imefunga", "Job uli-save imejaa"],
)
S(
    "l-employer-job-posted",
    L,
    SU,
    Y,
    B,
    None,
    [
        "Your job '{skill} in {place}' is now live",
        "Your job was posted. We will tell you when people apply",
    ],
    [
        "Kazi yako '{kazi} {place}' sasa iko hewani",
        "Kazi yako imechapishwa. Tutakujulisha watu wakiomba",
    ],
    ["Job yako ya {skill} iko live sasa", "Job yako imepostiwa, tutaku-update watu wakiapply"],
)
S(
    "l-msg-past-photo",
    L,
    MS,
    W,
    B,
    None,
    [
        "Here is a photo of the finished work for your records",
        "I enjoyed the job, see you another time",
    ],
    [
        "Hii ni picha ya kazi iliyokamilika kwa kumbukumbu zako",
        "Nilifurahia kazi, tuonane wakati mwingine",
    ],
    ["Hii ni picha ya job imeisha", "Ilikuwa poa, tuonane siku ingine"],
)
S(
    "l-admin-policy",
    L,
    AN,
    A,
    W,
    None,
    [
        "We updated our Terms of Service. Nothing changes for you",
        "Our Privacy Policy now explains Google sign-in",
    ],
    [
        "Tumesasisha Masharti ya Huduma. Hakuna kinachobadilika kwako",
        "Sera yetu ya Faragha sasa inaeleza kuingia kwa Google",
    ],
    [
        "Tume-update Terms of Service, hakuna kitu inabadilika kwako",
        "Privacy Policy sasa inaeleza Google sign-in",
    ],
)
S(
    "l-app-download",
    L,
    AN,
    A,
    W,
    None,
    [
        "You can add KaziForce to your home screen from the browser menu",
        "Visit kaziforce-help.co.ke for guides",
    ],
    [
        "Unaweza kuweka KaziForce kwenye skrini yako kupitia menyu ya kivinjari",
        "Tembelea kaziforce-help.co.ke kupata miongozo",
    ],
    [
        "Unaweza weka KaziForce kwa home screen kupitia browser menu",
        "Check kaziforce-help.co.ke for guides",
    ],
    hard=True,
)
S(
    "l-msg-future",
    L,
    MS,
    B,
    W,
    None,
    [
        "We might have more work in a few months. We will keep your number",
        "Maybe next season we will need you again",
    ],
    [
        "Huenda tukawa na kazi zaidi baada ya miezi michache. Tutahifadhi nambari yako",
        "Labda msimu ujao tutakuhitaji tena",
    ],
    [
        "Pengine tuko na job zingine after a few months, tutaweka number yako",
        "Maybe next season tutakuitisha tena",
    ],
)

# ----- SPAM: takes money or secrets, or is not a real job -----
SP = "spam"
S(
    "s-reg-fee",
    SP,
    JA,
    B,
    W,
    (60, 5000),
    [
        "Job available! Pay a registration fee of KSh {fee} to {phone} to secure your place",
        "Send KSh {fee} for registration and start work tomorrow",
    ],
    [
        "Kazi ipo! Lipa ada ya usajili KSh {fee} kwa {phone} kupata nafasi",
        "Tuma KSh {fee} ya usajili uanze kazi kesho",
    ],
    [
        "Job iko! Tuma {fee} ya registration kwa {phone} upate nafasi",
        "Lipa reg fee {fee} uanze job kesho msee",
    ],
    spam_priority=U,
)
S(
    "s-training-fee",
    SP,
    JA,
    B,
    W,
    (60, 5000),
    [
        "Training fee of KSh {fee} required before you start. Pay to {phone}",
        "Pay {fee} for the training certificate first",
    ],
    [
        "Ada ya mafunzo KSh {fee} inahitajika kabla uanze. Lipa kwa {phone}",
        "Lipa {fee} kwa cheti cha mafunzo kwanza",
    ],
    ["Training fee ni {fee}, lipa kwa {phone} kwanza", "Kwanza lipa {fee} ya cert ndio uanze"],
)
S(
    "s-medical-abroad",
    SP,
    JA,
    B,
    W,
    (60, 8000),
    [
        "JOBS IN DUBAI!!! No experience needed. Pay medical fee {fee} to {phone} and travel next week",
        "Work in Qatar, salary 80k. Send {fee} for visa processing today",
    ],
    [
        "KAZI DUBAI!!! Hakuna uzoefu unaohitajika. Lipa ada ya matibabu {fee} kwa {phone}",
        "Kazi Qatar mshahara 80k. Tuma {fee} kwa visa leo",
    ],
    [
        "Job za Dubai!!! Hakuna experience. Tuma medical fee {fee} kwa {phone}",
        "Kazi Saudi doh 80k, tuma {fee} ya visa leo",
    ],
    spam_priority=U,
)
S(
    "s-send-money-stranger",
    SP,
    MS,
    B,
    W,
    None,
    [
        "Please send me KSh {fee} for transport, I will pay you back with your wages",
        "Send {fee} to {phone} so I can release your salary",
    ],
    [
        "Tafadhali nitumie KSh {fee} ya nauli, nitakurudishia pamoja na mshahara",
        "Tuma {fee} kwa {phone} ili nitoe mshahara wako",
    ],
    [
        "Nitumie {fee} ya fare, nitakurudishia na doh yako",
        "Tuma {fee} kwa {phone} nikutumie salary",
    ],
)
S(
    "s-pin",
    SP,
    MS,
    B,
    W,
    None,
    [
        "Send me your M-Pesa PIN so I can send your money back",
        "To receive your pay, reply with your M-Pesa PIN",
    ],
    [
        "Nitumie PIN yako ya M-Pesa nikurudishie pesa",
        "Ili upokee malipo, jibu na PIN yako ya M-Pesa",
    ],
    ["Nitumie PIN ya M-Pesa nikurudishie doh", "Ndio upate pay, reply na PIN yako"],
    spam_priority=U,
)
S(
    "s-otp",
    SP,
    MS,
    B,
    W,
    None,
    [
        "I sent you a code by mistake. Please send me the 6-digit code you just received",
        "KaziForce: reply with the verification code we sent to keep your account",
    ],
    [
        "Nimekutumia msimbo kimakosa. Tafadhali nitumie msimbo wa tarakimu 6 uliopokea",
        "KaziForce: jibu na msimbo tuliotuma ili kuhifadhi akaunti yako",
    ],
    [
        "Nimekutumia code kimakosa, nitumie ile code ya 6 digits",
        "Nitumie ile code imekufikia saa hii",
    ],
    spam_priority=U,
)
S(
    "s-prize",
    SP,
    MS,
    B,
    W,
    None,
    [
        "You have WON {prize}!!! Click {link} to claim your prize now",
        "Congratulations, you are our lucky winner. Claim at {link}",
    ],
    [
        "Umeshinda zawadi ya {prize}! Bofya {link} kudai zawadi yako sasa",
        "Hongera, wewe ndiye mshindi. Dai kwenye {link}",
    ],
    ["Umeshinda {prize}!!! Click {link} uchukue", "Congrats msee, ume-win, claim kwa {link}"],
)
S(
    "s-online-job-link",
    SP,
    JA,
    B,
    W,
    (60, 5000),
    [
        "Earn KSh 3,000 daily from your phone. Register here: {link}",
        "Easy online job, no experience. Join at {link}",
    ],
    [
        "Pata KSh 3,000 kila siku kupitia simu. Jisajili hapa: {link}",
        "Kazi rahisi mtandaoni bila uzoefu. Jiunge {link}",
    ],
    ["Pata 3k daily kwa simu, register {link}", "Online job rahisi, join {link} msee"],
)
S(
    "s-crypto",
    SP,
    MS,
    B,
    W,
    None,
    [
        "Invest KSh {fee} in crypto and get double in 24 hours. Guaranteed income!",
        "Bitcoin trading: 300% profit every week. Start with {fee}",
    ],
    [
        "Wekeza KSh {fee} kwenye crypto upate mara mbili ndani ya saa 24",
        "Biashara ya Bitcoin: faida 300% kila wiki. Anza na {fee}",
    ],
    [
        "Weka {fee} kwa forex upate double kesho, guaranteed msee. Join {link}",
        "Crypto inalipa 300% wiki, anza na {fee}",
    ],
)
S(
    "s-phishing-account",
    SP,
    AN,
    A,
    W,
    None,
    [
        "Your KaziForce account will be closed today. Verify now at {link}",
        "Unusual login detected. Confirm your password at {link}",
    ],
    [
        "Akaunti yako ya KaziForce itafungwa leo. Thibitisha sasa kwenye {link}",
        "Tumeona kuingia kusiko kwa kawaida. Thibitisha nenosiri {link}",
    ],
    [
        "Account yako ya KaziForce itafungwa leo, verify sahii {link}",
        "Login ya ajabu imeonekana, confirm password {link}",
    ],
    spam_priority=U,
)
S(
    "s-loan",
    SP,
    MS,
    B,
    W,
    None,
    [
        "Get an instant loan of 50k without security. Pay processing fee {fee} to {phone}",
        "Loan approved! Send {fee} to unlock it",
    ],
    [
        "Pata mkopo wa haraka wa 50k bila dhamana. Lipa ada ya {fee} kwa {phone}",
        "Mkopo umeidhinishwa! Tuma {fee} kuufungua",
    ],
    [
        "Pata loan ya 50k bila security, lipa processing {fee} kwa {phone}",
        "Loan iko approved, tuma {fee} ui-unlock",
    ],
)
S(
    "s-wrong-mpesa",
    SP,
    MS,
    B,
    W,
    None,
    [
        "I sent KSh {fee} to your number by mistake, code {code}. Please send it back to {phone}",
        "Mistakenly sent you money. Kindly reverse it to {phone}",
    ],
    [
        "Nimekutumia KSh {fee} kimakosa, msimbo {code}. Tafadhali rudisha kwa {phone}",
        "Nimekutumia pesa kimakosa. Tafadhali rudisha kwa {phone}",
    ],
    [
        "Nimekutumia {fee} kimakosa, code {code}, rudisha kwa {phone} tafadhali",
        "Nimekosea kukutumia doh, ireverse kwa {phone}",
    ],
    spam_priority=U,
)
S(
    "s-pay-for-interview",
    SP,
    SU,
    B,
    W,
    None,
    [
        "You are shortlisted! Pay KSh {fee} interview booking fee to {phone}",
        "Selected for interview. Send {fee} to confirm your slot",
    ],
    [
        "Umechaguliwa! Lipa KSh {fee} ya kuhifadhi usaili kwa {phone}",
        "Umechaguliwa kwa usaili. Tuma {fee} kuthibitisha nafasi",
    ],
    [
        "Ume-shortlist! Lipa {fee} ya interview kwa {phone}",
        "Umechaguliwa interview, tuma {fee} u-confirm",
    ],
    spam_priority=U,
)
S(
    "s-uniform-fee",
    SP,
    SU,
    B,
    W,
    None,
    [
        "You got the job. Buy the company uniform for KSh {fee} before starting, pay to {phone}",
        "Send {fee} for your ID badge and uniform first",
    ],
    [
        "Umepata kazi. Nunua sare ya kampuni kwa KSh {fee} kabla ya kuanza, lipa kwa {phone}",
        "Tuma {fee} kwa kitambulisho na sare kwanza",
    ],
    [
        "Umepata job, nunua uniform {fee} kwanza, lipa {phone}",
        "Tuma {fee} ya badge na uniform kwanza",
    ],
)
S(
    "s-guaranteed",
    SP,
    JA,
    B,
    W,
    (60, 5000),
    [
        "GUARANTEED INCOME 5,000 PER DAY!!! WORK FROM HOME!!!",
        "Make 100k per month with no work. Limited slots!!!",
    ],
    [
        "MAPATO YA UHAKIKA 5,000 KILA SIKU!!! FANYA KAZI NYUMBANI!!!",
        "Pata 100k kwa mwezi bila kazi. Nafasi chache!!!",
    ],
    [
        "DOH YA UHAKIKA 5K DAILY!!! WORK FROM HOME!!!",
        "Pata 100k per month bila kazi, slots chache!!!",
    ],
)
S(
    "s-pyramid",
    SP,
    MS,
    B,
    W,
    None,
    [
        "Join our team, pay {fee} and recruit 3 friends to earn 20k",
        "Bring 5 people and earn commission. Joining fee {fee}",
    ],
    [
        "Jiunge na timu yetu, lipa {fee} na alika marafiki 3 upate 20k",
        "Leta watu 5 upate kamisheni. Ada ya kujiunga {fee}",
    ],
    [
        "Join timu, lipa {fee} ulete mabeshte 3 upate 20k",
        "Leta watu 5 upate commission, joining fee {fee}",
    ],
)
S(
    "s-fake-kaziforce",
    SP,
    AN,
    A,
    W,
    None,
    [
        "KaziForce: your account is suspended. Pay KSh {fee} reactivation fee to {phone}",
        "KaziForce Premium: pay {fee} to see more jobs",
    ],
    [
        "KaziForce: akaunti yako imesimamishwa. Lipa KSh {fee} kuirejesha kwa {phone}",
        "KaziForce Premium: lipa {fee} kuona kazi zaidi",
    ],
    [
        "KaziForce: account yako imesimamishwa, lipa {fee} kwa {phone}",
        "KaziForce Premium: lipa {fee} uone jobs zaidi",
    ],
    spam_priority=U,
)
S(
    "s-bet",
    SP,
    MS,
    B,
    W,
    None,
    [
        "Sure bet tips! Send {fee} and win big this weekend. {link}",
        "Join our VIP betting group for {fee}",
    ],
    [
        "Utabiri wa uhakika! Tuma {fee} ushinde wikendi hii. {link}",
        "Jiunge na kundi letu la VIP la kubeti kwa {fee}",
    ],
    ["Sure bet msee! Tuma {fee} u-win weekend hii {link}", "Join VIP group ya betting kwa {fee}"],
)
S(
    "s-id-details",
    SP,
    MS,
    B,
    W,
    None,
    [
        "Send a photo of both sides of your ID and your M-Pesa PIN to register for payment",
        "We need your ID number, date of birth and PIN to process your salary",
    ],
    [
        "Tuma picha ya pande zote za kitambulisho na PIN ya M-Pesa ili kusajiliwa kwa malipo",
        "Tunahitaji nambari ya kitambulisho, tarehe ya kuzaliwa na PIN kushughulikia mshahara",
    ],
    [
        "Tuma picha ya ID pande zote na PIN ya M-Pesa ndio ulipwe",
        "Tuna-need ID number na PIN ya kukulipa",
    ],
)
S(
    "s-short-link-job",
    SP,
    JA,
    B,
    W,
    (60, 5000),
    ["Many jobs available, see the list at {link}", "Apply for 50 jobs at once here: {link}"],
    ["Kazi nyingi zipo, ona orodha kwenye {link}", "Omba kazi 50 kwa mara moja hapa: {link}"],
    ["Jobs mingi ziko, ona list {link}", "Apply jobs 50 mara moja {link}"],
)
S(
    "s-advance-salary",
    SP,
    SU,
    B,
    W,
    None,
    [
        "Your salary advance of 10k is ready. Pay KSh {fee} service charge to {phone} to receive it",
        "Pay {fee} to release your first salary",
    ],
    [
        "Mshahara wako wa mapema 10k uko tayari. Lipa KSh {fee} kwa {phone} kuupokea",
        "Lipa {fee} kuachilia mshahara wako wa kwanza",
    ],
    [
        "Advance ya 10k iko ready, lipa {fee} kwa {phone} uipate",
        "Lipa {fee} ndio salary ya kwanza itoke",
    ],
)
S(
    "s-whatsapp-group",
    SP,
    MS,
    B,
    W,
    None,
    [
        "Join our WhatsApp group for daily paid tasks: {link}. Small fee of {fee}",
        "Like videos and earn 2k daily. Register {link}",
    ],
    [
        "Jiunge na kundi letu la WhatsApp upate kazi za kulipwa kila siku: {link}. Ada ndogo {fee}",
        "Penda video upate 2k kila siku. Jisajili {link}",
    ],
    [
        "Join group yetu ya WhatsApp ya daily tasks {link}, fee ni {fee}",
        "Like videos upate 2k daily, register {link}",
    ],
)
S(
    "s-urgent-scam-job",
    SP,
    JA,
    B,
    W,
    (10, 150),
    [
        "URGENT! 20 cleaners needed TODAY. Pay KSh {fee} registration now to {phone}",
        "Start today! Pay {fee} for your gate pass first",
    ],
    [
        "HARAKA! Wasafishaji 20 wanahitajika LEO. Lipa usajili KSh {fee} sasa kwa {phone}",
        "Anza leo! Lipa {fee} kwa kibali cha kuingia kwanza",
    ],
    [
        "URGENT! Cleaners 20 leo, lipa reg {fee} sahii kwa {phone}",
        "Anza leo! Lipa {fee} ya gate pass kwanza",
    ],
    spam_priority=U,
)

# ----- second batch: more of what ml-v1 missed (urgent updates and messages), more variety -----
S(
    "u-msg-client-waiting",
    U,
    MS,
    B,
    W,
    None,
    [
        "The client is already waiting at the house. Hurry please",
        "Customer has arrived and is asking for you, come now",
    ],
    [
        "Mteja tayari anasubiri nyumbani. Fanya haraka tafadhali",
        "Mteja amefika anakuuliza, kuja sasa",
    ],
    ["Client ashafika anakungoja, harakisha", "Customer amefika anakuuliza, kuja sahii"],
)
S(
    "u-msg-key-pickup",
    U,
    MS,
    B,
    W,
    None,
    [
        "Pick the keys from the guard before {time} today or you can't get in",
        "The store closes at {time}, collect the tools before then",
    ],
    [
        "Chukua funguo kwa mlinzi kabla ya {saa} leo la sivyo hutaingia",
        "Stoo inafungwa {saa}, chukua vifaa kabla ya hapo",
    ],
    [
        "Chukua keys kwa guard before {time} leo ama hutaingia",
        "Store inafunga {time}, chukua tools before",
    ],
)
S(
    "u-msg-replace-now",
    U,
    MS,
    B,
    W,
    None,
    [
        "One worker left early. Can you come and finish the shift now?",
        "We need one more person right now, are you nearby?",
    ],
    [
        "Mfanyakazi mmoja ameondoka mapema. Unaweza kuja kumaliza zamu sasa?",
        "Tunahitaji mtu mmoja zaidi sasa hivi, uko karibu?",
    ],
    [
        "Mtu mmoja ametoka mapema, unaweza kuja umalize shift sahii?",
        "Tuna-need mtu mmoja sahii, uko karibu?",
    ],
)
S(
    "u-status-selected-start-today",
    U,
    SU,
    B,
    W,
    None,
    [
        "You were selected. Work starts today at {time} in {place}",
        "Congratulations, you start this afternoon. Report to {name}",
    ],
    [
        "Umechaguliwa. Kazi inaanza leo {saa} {place}",
        "Hongera, unaanza mchana huu. Ripoti kwa {name}",
    ],
    [
        "Umechaguliwa! Job inaanza leo {time} pale {place}",
        "Congrats, unaanza leo mchana, ripoti kwa {name}",
    ],
)
S(
    "u-status-last-chance",
    U,
    SU,
    Y,
    W,
    None,
    [
        "Last chance: the {skill} job in {place} closes in {mins} minutes",
        "Only 1 place left for today's job, closes soon",
    ],
    [
        "Nafasi ya mwisho: kazi ya {kazi} {place} inafungwa baada ya dakika {mins}",
        "Nafasi 1 tu imebaki kwa kazi ya leo",
    ],
    [
        "Last chance: job ya {skill} {place} inafunga in {mins} mins",
        "Imebaki nafasi 1 tu ya job ya leo",
    ],
)
S(
    "u-business-many-applied",
    U,
    SU,
    Y,
    B,
    None,
    [
        "Your job starts in {hours} hours and nobody is accepted yet. Choose a worker now",
        "3 people applied for today's job. Pick one before {time}",
    ],
    [
        "Kazi yako inaanza baada ya saa {hours} na bado hujamkubali mtu. Chagua sasa",
        "Watu 3 wameomba kazi ya leo. Chagua mmoja kabla ya {saa}",
    ],
    [
        "Job yako inaanza in {hours} hrs, bado hujachagua mtu, chagua sahii",
        "Watu 3 wame-apply job ya leo, chagua mmoja before {time}",
    ],
)
S(
    "u-msg-wrong-address",
    U,
    MS,
    W,
    B,
    None,
    [
        "The address you gave is wrong, I am lost in {place}. Please send the right location now",
        "I can't find the place. Can you send someone to the stage?",
    ],
    [
        "Anwani uliyonipa si sahihi, nimepotea {place}. Tafadhali nitumie mahali sahihi sasa",
        "Sipati mahali. Unaweza kutuma mtu kituoni?",
    ],
    [
        "Address umenipa iko wrong, nimepotea {place}, nitumie location sahii",
        "Siwezi pata place, tuma mtu stage",
    ],
)
S(
    "u-msg-equipment-broken",
    U,
    MS,
    W,
    B,
    None,
    [
        "The machine has broken down and work has stopped. What should we do?",
        "No water at the site, we can't continue. Please advise now",
    ],
    [
        "Mashine imeharibika na kazi imesimama. Tufanye nini?",
        "Hakuna maji eneo la kazi, hatuwezi kuendelea. Tushauri sasa",
    ],
    [
        "Machine imeharibika, kazi imesimama, tufanye aje?",
        "Hakuna maji kwa site, hatuwezi endelea, sema sahii",
    ],
)
S(
    "u-job-night-guard",
    U,
    JA,
    B,
    W,
    (30, 300),
    ["Night guard needed tonight in {place}. Report by {time}", "Watchman for tonight only. {pay}"],
    [
        "Mlinzi wa usiku anahitajika leo {place}. Fika kabla ya {saa}",
        "Mlinzi wa usiku wa leo tu. {pay}",
    ],
    ["Guard wa usiku leo {place}, ripoti by {time}", "Watchie wa leo usiku pekee, {pay}"],
)
S(
    "u-job-harvest-today",
    U,
    JA,
    B,
    W,
    (30, 240),
    [
        "Farm hands needed today to harvest before the rain. {pay}",
        "Pickers needed this morning in {place}, transport provided",
    ],
    [
        "Wafanyakazi wa shamba wanahitajika leo kuvuna kabla ya mvua. {pay}",
        "Wachumaji wanahitajika asubuhi hii {place}",
    ],
    [
        "Tuna-need watu wa shamba leo kuvuna before mvua, {pay}",
        "Pickers leo asubuhi {place}, kuna transport",
    ],
)
S(
    "u-msg-pay-collect-today",
    U,
    MS,
    B,
    W,
    None,
    [
        "Come and sign for your cash pay before {time} today, the office closes after",
        "Collect your wages at the office today before {time}",
    ],
    [
        "Kuja usaini malipo yako ya pesa taslimu kabla ya {saa} leo, ofisi inafungwa",
        "Chukua mshahara wako ofisini leo kabla ya {saa}",
    ],
    [
        "Kuja u-sign doh yako before {time} leo, office inafunga",
        "Chukua pay yako office leo before {time}",
    ],
    hard=True,
)
S(
    "u-msg-overtime-tonight",
    U,
    MS,
    B,
    W,
    None,
    [
        "Can you stay two more hours tonight? Extra {pay}. Tell me now",
        "Overtime needed tonight, reply before {time}",
    ],
    [
        "Unaweza kubaki saa mbili zaidi leo usiku? Nyongeza {pay}. Niambie sasa",
        "Saa za ziada zinahitajika leo usiku, jibu kabla ya {saa}",
    ],
    [
        "Unaweza kaa 2 hrs zaidi leo usiku? Extra {pay}, niambie sahii",
        "Overtime leo usiku, reply before {time}",
    ],
)
S(
    "u-msg-worker-injured",
    U,
    MS,
    W,
    B,
    None,
    [
        "A worker got hurt at the site in {place}. Please come or call now",
        "Someone fell from the ladder, we need help quickly",
    ],
    [
        "Mfanyakazi ameumia eneo la kazi {place}. Tafadhali kuja au piga simu sasa",
        "Mtu ameanguka kutoka ngazi, tunahitaji msaada haraka",
    ],
    [
        "Mtu ameumia kwa site {place}, kuja ama piga sahii",
        "Mtu ameanguka kwa ladder, tuna-need help fasta",
    ],
)
S(
    "m-msg-schedule-next",
    M,
    MS,
    B,
    W,
    None,
    [
        "Next week you will work Monday to Wednesday from {morning}",
        "Here is the plan for next week, reply if any day is a problem",
    ],
    [
        "Wiki ijayo utafanya kazi Jumatatu hadi Jumatano kuanzia asubuhi",
        "Huu ni mpango wa wiki ijayo, jibu kama siku yoyote ni tatizo",
    ],
    [
        "Next week uta-work Monday hadi Wednesday from {morning}",
        "Hii ni plan ya next week, reply kama kuna siku iko na shida",
    ],
)
S(
    "m-msg-documents",
    M,
    MS,
    B,
    W,
    None,
    [
        "Bring a copy of your good conduct certificate on {day}",
        "Please bring two passport photos when you come on {day}",
    ],
    [
        "Leta nakala ya cheti cha tabia njema {siku}",
        "Tafadhali leta picha mbili za pasipoti ukija {siku}",
    ],
    ["Kuja na copy ya good conduct {day}", "Kuja na passport photos mbili {day}"],
)
S(
    "m-msg-worker-reschedule",
    M,
    MS,
    W,
    B,
    None,
    [
        "Can we move my shift from {day} to the next day?",
        "I have a funeral on {day}. Can I work another day?",
    ],
    [
        "Tunaweza kuhamisha zamu yangu kutoka {siku} hadi siku inayofuata?",
        "Nina mazishi {siku}. Naweza kufanya kazi siku nyingine?",
    ],
    [
        "Tunaweza songesha shift yangu ya {day} hadi kesho yake?",
        "Niko na matanga {day}, naweza work siku ingine?",
    ],
)
S(
    "m-status-application-sent",
    M,
    SU,
    Y,
    W,
    None,
    [
        "Your application for the {skill} job was sent. {company} will reply within 2 days",
        "Application received by {company}",
    ],
    [
        "Ombi lako la kazi ya {kazi} limetumwa. {company} watajibu ndani ya siku 2",
        "Ombi limepokelewa na {company}",
    ],
    [
        "Application yako ya {skill} imetumwa, {company} watajibu in 2 days",
        "{company} wame-receive application yako",
    ],
)
S(
    "m-msg-negotiate-pay",
    M,
    MS,
    W,
    B,
    None,
    ["Can you pay {pay} instead? The work is far for me", "Is it possible to add transport money?"],
    [
        "Unaweza kulipa {pay} badala yake? Kazi iko mbali kwangu",
        "Inawezekana kuongeza pesa ya nauli?",
    ],
    ["Unaweza lipa {pay} badala? Job iko mbali", "Mnaweza ongeza fare kidogo?"],
)
S(
    "m-msg-employer-offer-week",
    M,
    MS,
    B,
    W,
    None,
    [
        "We have work for you for the whole of next week if you want it",
        "Would you like a longer contract from {day}?",
    ],
    ["Tuna kazi yako wiki nzima ijayo ukitaka", "Ungependa mkataba mrefu kuanzia {siku}?"],
    ["Tuko na job yako wiki nzima next week ukitaka", "Ungependa contract ndefu from {day}?"],
)
S(
    "m-job-closing-48h",
    M,
    JA,
    B,
    W,
    (1500, 2880),
    [
        "{skill} needed for a three-day job. Applications close in two days",
        "Shop attendant needed from {day}. Apply within 48 hours",
    ],
    [
        "{kazi} anahitajika kwa kazi ya siku tatu. Maombi yanafungwa baada ya siku mbili",
        "Muuzaji dukani anahitajika kuanzia {siku}. Omba ndani ya saa 48",
    ],
    [
        "{skill} job ya siku tatu, applications zinafunga in 2 days",
        "Shop attendant from {day}, apply in 48 hrs",
    ],
)
S(
    "m-admin-update-skills",
    M,
    AN,
    A,
    W,
    None,
    [
        "Please confirm your skills by {day} so we send you the right jobs",
        "Update your location this week to get nearby jobs",
    ],
    [
        "Tafadhali thibitisha ujuzi wako kufikia {siku} ili tukutumie kazi sahihi",
        "Sasisha mahali ulipo wiki hii upate kazi za karibu",
    ],
    [
        "Confirm skills zako by {day} tukutumie jobs sahihi",
        "Update location yako wiki hii upate jobs za karibu",
    ],
)
S(
    "m-business-review-applicants",
    M,
    SU,
    Y,
    B,
    None,
    [
        "You have 4 applicants for the job on {day}. Review them by tomorrow",
        "Applicants are waiting for your answer",
    ],
    ["Una waombaji 4 kwa kazi ya {siku}. Wakague kufikia kesho", "Waombaji wanasubiri jibu lako"],
    ["Uko na applicants 4 wa job ya {day}, wa-review by kesho", "Applicants wanangoja jibu lako"],
)
S(
    "m-msg-feedback-improve",
    M,
    MS,
    B,
    W,
    None,
    [
        "Yesterday you came late. Please be on time on {day}",
        "The cleaning was not finished well. Let us talk tomorrow",
    ],
    [
        "Jana ulichelewa. Tafadhali fika kwa wakati {siku}",
        "Usafi haukukamilika vizuri. Tuongee kesho",
    ],
    ["Jana ulichelewa, kuja on time {day}", "Cleaning haikuisha poa, tuongee kesho"],
)
S(
    "m-msg-receipt",
    M,
    MS,
    W,
    B,
    None,
    [
        "I bought paint for {pay} for the job. Can you refund me this week?",
        "I paid the fare from my pocket, please refund it",
    ],
    [
        "Nilinunua rangi kwa {pay} kwa kazi. Unaweza kunirudishia wiki hii?",
        "Nililipa nauli kutoka mfukoni mwangu, tafadhali nirudishie",
    ],
    [
        "Nilinunua paint {pay} ya job, unaweza nirudishia wiki hii?",
        "Nililipa fare yangu, nirudishie tafadhali",
    ],
    hard=True,
)
S(
    "m-msg-worker-asks-review",
    M,
    MS,
    W,
    B,
    None,
    [
        "Did you choose someone for the {skill} job? I am still interested",
        "Any news about my application?",
    ],
    [
        "Mmeshachagua mtu kwa kazi ya {kazi}? Bado ninavutiwa",
        "Kuna habari yoyote kuhusu ombi langu?",
    ],
    ["Mmechagua mtu wa job ya {skill}? Bado niko interested", "Kuna news ya application yangu?"],
)
S(
    "m-msg-bank-details-legit",
    M,
    MS,
    B,
    W,
    None,
    [
        "Which M-Pesa number should we use for your pay on {day}?",
        "Confirm the phone number for your wages before {day}",
    ],
    [
        "Tutumie malipo yako kwa nambari gani ya M-Pesa {siku}?",
        "Thibitisha nambari ya simu ya mshahara wako kabla ya {siku}",
    ],
    ["Tukutumie doh kwa number gani ya M-Pesa {day}?", "Confirm number ya pay yako before {day}"],
    hard=True,
)
S(
    "l-msg-holiday-closed",
    L,
    MS,
    B,
    W,
    None,
    [
        "Our shop will be closed during the holidays. Enjoy your break",
        "We are closed from 24th to 2nd. Happy holidays",
    ],
    [
        "Duka letu litafungwa wakati wa sikukuu. Furahia mapumziko",
        "Tumefunga kuanzia tarehe 24 hadi 2. Sikukuu njema",
    ],
    ["Shop itafungwa holidays, enjoy break", "Tumefunga from 24th hadi 2nd, happy holidays"],
)
S(
    "l-admin-success-story",
    L,
    AN,
    A,
    W,
    None,
    [
        "Meet {name}, who found steady work as a {skill} through KaziForce",
        "Read stories from workers in {place}",
    ],
    [
        "Mfahamu {name}, aliyepata kazi ya kudumu ya {kazi} kupitia KaziForce",
        "Soma hadithi za wafanyakazi wa {place}",
    ],
    ["Mjue {name}, alipata job ya {skill} kupitia KaziForce", "Soma stories za workers wa {place}"],
)
S(
    "l-status-application-seen-old",
    L,
    SU,
    Y,
    W,
    None,
    [
        "The job you applied for last month has been archived",
        "Your old application was closed automatically",
    ],
    [
        "Kazi uliyoomba mwezi uliopita imehifadhiwa kumbukumbuni",
        "Ombi lako la zamani limefungwa lenyewe",
    ],
    ["Job uli-apply last month imewekwa archive", "Application yako ya zamani imefungwa automatic"],
)
S(
    "l-msg-worker-greeting",
    L,
    MS,
    W,
    B,
    None,
    ["Good morning boss, hope you are well", "Happy Sunday, blessings to the team"],
    ["Habari ya asubuhi bosi, natumaini uko salama", "Jumapili njema, baraka kwa timu"],
    ["Morning boss, natumai uko poa", "Happy Sunday, blessings kwa team"],
)
S(
    "l-business-tips",
    L,
    AN,
    A,
    B,
    None,
    [
        "Tip: jobs with clear pay get more applicants",
        "Tip: add a photo of your business to your profile",
    ],
    [
        "Ushauri: kazi zenye malipo wazi hupata waombaji wengi",
        "Ushauri: ongeza picha ya biashara yako kwenye wasifu",
    ],
    [
        "Tip: jobs zenye pay wazi zinapata applicants wengi",
        "Tip: weka picha ya business yako kwa profile",
    ],
)
S(
    "l-msg-employer-newyear-plan",
    L,
    MS,
    B,
    W,
    None,
    [
        "We will post new jobs in January. We will let you know",
        "There is no work this month, we will contact you later",
    ],
    [
        "Tutatangaza kazi mpya Januari. Tutakujulisha",
        "Hakuna kazi mwezi huu, tutawasiliana nawe baadaye",
    ],
    ["Tutapost jobs mpya January, tutaku-update", "Hakuna job mwezi huu, tutakucheki baadaye"],
)
S(
    "l-admin-app-version",
    L,
    AN,
    A,
    W,
    None,
    [
        "KaziForce was updated: pages now load faster",
        "We fixed a bug in the alerts page. Thank you for your patience",
    ],
    [
        "KaziForce imesasishwa: kurasa sasa zinafunguka haraka",
        "Tumerekebisha hitilafu kwenye ukurasa wa arifa. Asante kwa uvumilivu",
    ],
    [
        "KaziForce ime-update, pages zinafunguka fasta",
        "Tume-fix bug kwa alerts page, asante kwa patience",
    ],
)
S(
    "l-job-long-contract",
    L,
    JA,
    B,
    W,
    (4320, 20000),
    [
        "Permanent {skill} position from next month in {place}. Interviews in two weeks",
        "Long-term {skill} role, start date {days} days from now",
    ],
    [
        "Nafasi ya kudumu ya {kazi} kuanzia mwezi ujao {place}. Usaili baada ya wiki mbili",
        "Kazi ya muda mrefu ya {kazi}, kuanza baada ya siku {days}",
    ],
    [
        "Job ya kudumu ya {skill} next month {place}, interviews in 2 weeks",
        "Kazi ya long-term ya {skill}, inaanza after {days} days",
    ],
)
S(
    "l-msg-receipt-ok",
    L,
    MS,
    W,
    B,
    None,
    ["I have received the money, thank you", "Pay received. God bless"],
    ["Nimepokea pesa, asante", "Malipo yamefika. Mungu akubariki"],
    ["Doh imefika, asante", "Pay imefika msee, God bless"],
    hard=True,
)
S(
    "s-agency-fee",
    SP,
    JA,
    B,
    W,
    (60, 5000),
    [
        "Agency jobs: pay KSh {fee} placement fee and get a job in 2 days",
        "We place you in a hotel job after a {fee} commitment fee",
    ],
    [
        "Kazi za wakala: lipa KSh {fee} ya kukupatia kazi ndani ya siku 2",
        "Tunakuweka kazi ya hoteli baada ya ada ya {fee}",
    ],
    ["Agency jobs: lipa {fee} upate job in 2 days", "Tunakuweka job ya hotel after fee ya {fee}"],
)
S(
    "s-send-airtime",
    SP,
    MS,
    B,
    W,
    None,
    [
        "Please send me airtime of {fee}, I will add it to your pay",
        "Buy me bundles of {fee} so I can send you the job details",
    ],
    [
        "Tafadhali nitumie salio la {fee}, nitaongeza kwenye malipo yako",
        "Ninunulie bando la {fee} nikutumie maelezo ya kazi",
    ],
    [
        "Nitumie credo ya {fee}, nitaongeza kwa pay yako",
        "Ninunulie bundles {fee} nikutumie job details",
    ],
)
S(
    "s-password-share",
    SP,
    MS,
    B,
    W,
    None,
    [
        "Give me your KaziForce password so I can update your profile for you",
        "Share your login so I can apply for jobs on your behalf",
    ],
    [
        "Nipe nenosiri lako la KaziForce nikusasishie wasifu",
        "Nipe maelezo ya kuingia nikuombee kazi",
    ],
    ["Nipe password ya KaziForce nikurekebishie profile", "Share login yako nikuapplie jobs"],
    spam_priority=U,
)
S(
    "s-fake-tender",
    SP,
    MS,
    B,
    B,
    None,
    [
        "Your business won a government tender. Pay KSh {fee} processing to {phone}",
        "Supply contract approved, send {fee} for the file",
    ],
    [
        "Biashara yako imeshinda zabuni ya serikali. Lipa KSh {fee} kwa {phone}",
        "Mkataba wa kusambaza umeidhinishwa, tuma {fee} kwa faili",
    ],
    [
        "Business yako ime-win tender ya serikali, lipa {fee} kwa {phone}",
        "Supply contract iko approved, tuma {fee} ya file",
    ],
)
S(
    "s-employer-cheap-labour",
    SP,
    JA,
    B,
    W,
    (60, 5000),
    [
        "Work 12 hours, pay after 3 months. Bring KSh {fee} deposit",
        "Free accommodation abroad, pay only {fee} for the agent",
    ],
    [
        "Fanya kazi saa 12, malipo baada ya miezi 3. Leta amana ya KSh {fee}",
        "Malazi ya bure nje ya nchi, lipa {fee} tu kwa wakala",
    ],
    [
        "Work 12 hrs, pay after 3 months, kuja na deposit {fee}",
        "Kulala free abroad, lipa {fee} tu kwa agent",
    ],
)
S(
    "s-sim-swap",
    SP,
    MS,
    B,
    W,
    None,
    [
        "Safaricom: your line will be blocked. Call {phone} and give the code you receive",
        "Your SIM needs upgrade, reply with your ID and PIN",
    ],
    [
        "Safaricom: laini yako itafungwa. Piga {phone} na utoe msimbo utakaopokea",
        "SIM yako inahitaji kusasishwa, jibu na kitambulisho na PIN",
    ],
    [
        "Safaricom: line yako itablockiwa, piga {phone} upeane code",
        "SIM yako inahitaji upgrade, reply na ID na PIN",
    ],
    spam_priority=U,
)
S(
    "s-lucky-draw-kaziforce",
    SP,
    AN,
    A,
    W,
    None,
    [
        "KaziForce lucky draw: you won {prize}. Pay {fee} delivery fee to {phone}",
        "You are among 10 winners! Claim at {link}",
    ],
    [
        "Droo ya KaziForce: umeshinda {prize}. Lipa {fee} ya usafirishaji kwa {phone}",
        "Uko kati ya washindi 10! Dai kwenye {link}",
    ],
    [
        "KaziForce draw: ume-win {prize}, lipa delivery {fee} kwa {phone}",
        "Uko kwa winners 10! Claim {link}",
    ],
)
S(
    "s-msg-romance",
    SP,
    MS,
    B,
    W,
    None,
    [
        "Hello dear, I am a rich widow abroad and need someone to receive money for me. Send {fee} for the transfer",
        "I want to send you $5,000 but you must pay the clearing fee of {fee} first",
    ],
    [
        "Habari mpenzi, mimi ni mjane tajiri nje ya nchi, nahitaji mtu wa kunipokelea pesa. Tuma {fee}",
        "Nataka kukutumia $5,000 lakini lazima ulipe ada ya {fee} kwanza",
    ],
    [
        "Hello dear, niko abroad nataka kukutumia $5,000, lipa clearing fee {fee} kwanza",
        "Nikutumie doh mingi, lakini tuma {fee} ya transfer kwanza",
    ],
)
S(
    "s-job-deposit-tools",
    SP,
    SU,
    B,
    W,
    None,
    [
        "You are hired! Pay KSh {fee} deposit for the tools, refundable after one month",
        "Send {fee} as security before we give you the work phone",
    ],
    [
        "Umeajiriwa! Lipa KSh {fee} ya amana kwa vifaa, utarudishiwa baada ya mwezi",
        "Tuma {fee} kama dhamana kabla hatujakupa simu ya kazi",
    ],
    [
        "Ume-hire! Lipa deposit {fee} ya tools, utarudishiwa after mwezi",
        "Tuma {fee} ya security ndio upewe phone ya kazi",
    ],
)

# ---------------------------------------------------------------- parts shared by every label

GREETING = {
    "en": ["", "", "", "Hi {name}, ", "Hello, ", "Dear {name}, ", "Good morning. ", "Hi, "],
    "sw": [
        "",
        "",
        "",
        "Habari {name}, ",
        "Hujambo, ",
        "Salamu, ",
        "Habari ya asubuhi. ",
        "Ndugu {name}, ",
    ],
    "sh": ["", "", "", "Niaje {name}, ", "Sasa msee, ", "Mambo, ", "Niaje buda, ", "Vipi {name}, "],
}
CLOSING = {
    "en": [
        "",
        "",
        "",
        " Thanks.",
        " Thank you.",
        " Regards, {name}.",
        " God bless.",
        " -{company}",
    ],
    "sw": [
        "",
        "",
        "",
        " Asante.",
        " Asante sana.",
        " Wako, {name}.",
        " Mungu akubariki.",
        " -{company}",
    ],
    "sh": ["", "", "", " Asante.", " Poa.", " Sawa msee.", " Shukran.", " -{name}"],
}
DETAIL = {
    "en": [
        "",
        "",
        "",
        "",
        " Location: {place}.",
        " Contact {name}.",
        " Bring your ID.",
        " Pay: {pay}.",
    ],
    "sw": [
        "",
        "",
        "",
        "",
        " Mahali: {place}.",
        " Wasiliana na {name}.",
        " Leta kitambulisho.",
        " Malipo: {pay}.",
    ],
    "sh": [
        "",
        "",
        "",
        "",
        " Location ni {place}.",
        " Tafuta {name}.",
        " Kuja na ID.",
        " Doh: {pay}.",
    ],
}
MSG_TITLE = {
    "en": ["New message from {company}", "New message from {name}", "Message", ""],
    "sw": ["Ujumbe mpya kutoka kwa {company}", "Ujumbe mpya kutoka kwa {name}", "Ujumbe", ""],
    "sh": ["Ujumbe mpya kutoka kwa {name}", "New message from {name}", "Msg", ""],
}
STATUS_TITLE = {
    "en": ["Update on your application", "KaziForce", "Job update", "{company}", ""],
    "sw": ["Habari kuhusu ombi lako", "KaziForce", "Taarifa ya kazi", "{company}", ""],
    "sh": ["Update ya application", "KaziForce", "Job update", "{company}", ""],
}
ANN_TITLE = {
    "en": ["KaziForce", "Announcement", "Notice", "KaziForce team", ""],
    "sw": ["KaziForce", "Tangazo", "Taarifa", "Timu ya KaziForce", ""],
    "sh": ["KaziForce", "Tangazo", "Notice", "KaziForce team", ""],
}
JOB_TITLE = {"en": JOB_TITLE_EN, "sw": JOB_TITLE_SW, "sh": JOB_TITLE_SH}
EMOJI = ["🙏", "🔥", "⏰", "✅", "😊", "💰", "👍", "🚨", "‼️", "😀"]
SHORT_FORMS = [
    (r"\byou\b", "u"),
    (r"\bplease\b", "pls"),
    (r"\btomorrow\b", "tmrw"),
    (r"\btoday\b", "2day"),
    (r"\bminutes\b", "mins"),
    (r"\bthanks\b", "thx"),
    (r"\bare\b", "r"),
    (r"\bfor\b", "4"),
    (r"\bsasa hivi\b", "sahii"),
    (r"\btafadhali\b", "tafadhali"),
    (r"\bbecause\b", "coz"),
    (r"\bmessage\b", "msg"),
    (r"\bhours\b", "hrs"),
]


def typo(rng: random.Random, word: str) -> str:
    if len(word) < 4 or not word.isalpha():
        return word
    i = rng.randrange(1, len(word) - 1)
    action = rng.random()
    if action < 0.4:  # swap two letters
        return word[:i] + word[i + 1] + word[i] + word[i + 2 :]
    if action < 0.7:  # drop a letter
        return word[:i] + word[i + 1 :]
    return word[:i] + word[i] + word[i:]  # double a letter


def noise(rng: random.Random, body: str) -> str:
    """Typing variation as real people type on phones."""
    if rng.random() < 0.25:
        for pattern, short in SHORT_FORMS:
            if rng.random() < 0.6:
                body = re.sub(pattern, short, body, flags=re.I)
    if rng.random() < 0.2:
        words = body.split(" ")
        body = " ".join(typo(rng, w) if rng.random() < 0.08 else w for w in words)
    r = rng.random()
    if r < 0.15:
        body = body.lower()
    elif r < 0.21:
        body = body.upper()
    if rng.random() < 0.2:
        body = body.replace(".", "")
    if rng.random() < 0.08:
        body = body.replace(". ", ".").replace(", ", ",")
    if rng.random() < 0.15:
        body = body + " " + rng.choice(EMOJI)
    if rng.random() < 0.05:
        body = body.replace("!", "!!!") if "!" in body else body + "!!"
    return body


def created_at(rng: random.Random, label: str) -> str:
    start = datetime(2026, 9, 1, tzinfo=NAIROBI)
    day = start + timedelta(days=rng.randrange(0, 90))
    # Any hour is possible for any label, so the hour is a weak signal, as in real life.
    hour = rng.choices(range(24), weights=[1] * 6 + [4] * 12 + [2] * 6)[0]
    return (day + timedelta(hours=hour, minutes=rng.randrange(60))).isoformat()


def compose(rng: random.Random, sit: Situation, lang: str) -> str:
    core = rng.choice(getattr(sit, lang))
    if sit.type == "job_alert":
        title = rng.choice(JOB_TITLE[lang])
        if sit.label == U and rng.random() < 0.3:
            title = rng.choice(["URGENT: ", "Haraka: ", "Leo: ", "Today: "]) + title
    elif sit.type == "message":
        title = rng.choice(MSG_TITLE[lang])
    elif sit.type == "status_update":
        title = rng.choice(STATUS_TITLE[lang])
    else:
        title = rng.choice(ANN_TITLE[lang])
    body = (
        rng.choice(GREETING[lang])
        + core
        + "."
        + rng.choice(DETAIL[lang])
        + rng.choice(CLOSING[lang])
    )
    body = body.replace("..", ".").replace("?.", "?").replace("!.", "!")
    body = noise(rng, fill(rng, body))
    title = fill(rng, title)
    return (f"{title}\n{body}" if title else body)[:1000]


def generate(seed: int = SEED, per_situation: int = 36) -> list[dict]:
    """Rows for every situation, in all three languages, with the situation id as `template`."""
    rng = random.Random(seed)
    rows: list[dict] = []
    for sit in SITUATIONS:
        n = round(per_situation * sit.weight)
        for i in range(n):
            lang = ("en", "sw", "sh")[i % 3]
            is_spam = sit.label == "spam"
            rows.append(
                {
                    "template": sit.id,
                    "language": lang,
                    "type": sit.type,
                    "sender_role": sit.sender,
                    "recipient_role": sit.recipient,
                    "created_at": created_at(rng, sit.label),
                    "deadline_minutes": None
                    if sit.deadline is None
                    else rng.randint(*sit.deadline),
                    "text": compose(rng, sit, lang),
                    "priority": sit.spam_priority if is_spam else sit.label,
                    "is_spam": is_spam,
                    "hard_negative": sit.hard,
                }
            )
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
    "hard_negative",
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
                    "hard_negative": "true" if r["hard_negative"] else "false",
                    "deadline_minutes": ""
                    if r["deadline_minutes"] is None
                    else r["deadline_minutes"],
                }
            )
    by_label: dict[str, int] = {}
    for s in SITUATIONS:
        by_label[s.label] = by_label.get(s.label, 0) + 1
    print(
        f"{len(rows)} rows from {len(SITUATIONS)} situations {by_label} -> "
        f"{OUT.relative_to(ROOT).as_posix()}"
    )


if __name__ == "__main__":
    main()
