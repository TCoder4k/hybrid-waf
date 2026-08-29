"""
Exports the exact Phase 6 held-out test split (see training/train.py) as a
plain JSON fixture for Phase 11's Rule-only vs ML-only vs Hybrid comparison.

Reuses training.train's load_dataset()/RANDOM_STATE/TEST_SIZE directly, so
this can never silently drift from the split the model was actually scored
on in Phase 6 (model/metrics.json) — no changes to train.py. The held-out
test split is used (not the full 225-row dataset) because the model trained
on the other rows; including them would let ML/Hybrid "cheat" on data it
memorized, undermining the leakage-safe methodology Phase 6 established.

Reproducing scikit-learn's GroupShuffleSplit output requires scikit-learn
itself (a specific NumPy-seeded permutation) — not something to re-derive in
TypeScript, which is why this step runs in Python and hands its output to
the TypeScript evaluation script (Phase 11) as a plain JSON fixture.

Run: python -m evaluation.export_test_set
"""

from __future__ import annotations

import json
from pathlib import Path

from sklearn.model_selection import GroupShuffleSplit

from training.train import RANDOM_STATE, TEST_SIZE, load_dataset

METRICS_PATH = Path(__file__).parent.parent / "model" / "metrics.json"
OUTPUT_PATH = Path(__file__).parent / "test_set.json"


def main() -> None:
    texts, labels, groups = load_dataset()

    splitter = GroupShuffleSplit(
        n_splits=1, test_size=TEST_SIZE, random_state=RANDOM_STATE
    )
    _, test_idx = next(splitter.split(texts, labels, groups))

    test_rows = [{"text": texts[i], "label": labels[i]} for i in test_idx]
    test_groups = {groups[i] for i in test_idx}

    # Sanity check against Phase 6's already-reported split: if this
    # disagrees, dataset.csv (or the split parameters) has drifted since
    # training, and evaluating on a silently-different set would be
    # misleading rather than useful.
    if METRICS_PATH.exists():
        reported = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
        assert len(test_rows) == reported["test_size"], (
            f"Test set size {len(test_rows)} != model/metrics.json's "
            f"test_size {reported['test_size']} — split has drifted from "
            "Phase 6's training run."
        )
        assert len(test_groups) == reported["test_groups"], (
            f"Test set groups {len(test_groups)} != model/metrics.json's "
            f"test_groups {reported['test_groups']} — split has drifted "
            "from Phase 6's training run."
        )

    OUTPUT_PATH.write_text(json.dumps(test_rows, indent=2), encoding="utf-8")
    print(
        f"Wrote {len(test_rows)} test rows ({len(test_groups)} groups) to "
        f"{OUTPUT_PATH}"
    )


if __name__ == "__main__":
    main()
