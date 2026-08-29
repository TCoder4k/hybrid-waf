import csv
from pathlib import Path

DATASET_PATH = Path(__file__).parent.parent / "dataset" / "dataset.csv"


def load_rows():
    with DATASET_PATH.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def test_dataset_has_three_classes():
    rows = load_rows()
    labels = {row["label"] for row in rows}
    assert labels == {"NORMAL", "SQL_INJECTION", "XSS"}


def test_dataset_has_no_duplicate_text():
    rows = load_rows()
    texts = [row["text"] for row in rows]
    assert len(texts) == len(set(texts)), "cleaning should have dropped duplicates"


def test_every_row_has_a_group_id():
    rows = load_rows()
    assert all(row["group_id"] for row in rows)


def test_classes_are_reasonably_balanced():
    rows = load_rows()
    counts: dict[str, int] = {}
    for row in rows:
        counts[row["label"]] = counts.get(row["label"], 0) + 1
    smallest, largest = min(counts.values()), max(counts.values())
    # Not a strict 1:1:1 requirement — just guards against one class
    # dominating enough to make accuracy misleading.
    assert smallest / largest > 0.5
