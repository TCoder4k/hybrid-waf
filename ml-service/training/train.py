"""
Trains the Hybrid WAF ML classifier: TF-IDF + Logistic Regression, 3 classes
(NORMAL / SQL_INJECTION / XSS), per the project SRS.

Leakage prevention (the part that matters most for defensible metrics):
- Splitting is GROUP-aware (GroupShuffleSplit), not a plain random split.
  Every row generated from the same base payload/phrase (see
  dataset/generate_dataset.py's `group_id`) stays entirely on one side of
  the split. A plain random split would let near-duplicate variants of the
  same attack leak across train/test and inflate the reported accuracy —
  this dataset is templated exactly enough for that to matter.
- The TfidfVectorizer is fit on the TRAIN split only. The test split is only
  ever `.transform()`-ed, never seen during fitting.

Run: python -m training.train
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
)
from sklearn.model_selection import GroupShuffleSplit

DATASET_PATH = Path(__file__).parent.parent / "dataset" / "dataset.csv"
MODEL_DIR = Path(__file__).parent.parent / "model"
VECTORIZER_PATH = MODEL_DIR / "vectorizer.joblib"
CLASSIFIER_PATH = MODEL_DIR / "classifier.joblib"
METRICS_PATH = MODEL_DIR / "metrics.json"

RANDOM_STATE = 42
TEST_SIZE = 0.25


def load_dataset() -> tuple[list[str], list[str], list[str]]:
    texts, labels, groups = [], [], []
    with DATASET_PATH.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            texts.append(row["text"])
            labels.append(row["label"])
            groups.append(row["group_id"])
    return texts, labels, groups


def main() -> None:
    texts, labels, groups = load_dataset()

    splitter = GroupShuffleSplit(
        n_splits=1, test_size=TEST_SIZE, random_state=RANDOM_STATE
    )
    train_idx, test_idx = next(splitter.split(texts, labels, groups))

    train_texts = [texts[i] for i in train_idx]
    train_labels = [labels[i] for i in train_idx]
    test_texts = [texts[i] for i in test_idx]
    test_labels = [labels[i] for i in test_idx]

    # Sanity check: no base-payload group should appear on both sides.
    train_groups = {groups[i] for i in train_idx}
    test_groups = {groups[i] for i in test_idx}
    overlap = train_groups & test_groups
    assert not overlap, f"Group leakage detected between train/test: {overlap}"

    # char_wb n-grams, not the sklearn word-level default: word tokenization
    # strips punctuation (', --, <, =) which carries essentially all the
    # SQLi/XSS signal in these short payload strings.
    vectorizer = TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), max_features=3000)
    X_train = vectorizer.fit_transform(train_texts)
    X_test = vectorizer.transform(test_texts)

    classifier = LogisticRegression(max_iter=1000, random_state=RANDOM_STATE)
    classifier.fit(X_train, train_labels)

    predictions = classifier.predict(X_test)
    report = classification_report(test_labels, predictions, output_dict=True)
    labels_order = sorted(set(test_labels))
    matrix = confusion_matrix(test_labels, predictions, labels=labels_order).tolist()

    metrics = {
        "accuracy": accuracy_score(test_labels, predictions),
        "classification_report": report,
        "confusion_matrix": {"labels": labels_order, "matrix": matrix},
        "train_size": len(train_texts),
        "test_size": len(test_texts),
        "train_groups": len(train_groups),
        "test_groups": len(test_groups),
    }

    print(f"Accuracy: {metrics['accuracy']:.4f}")
    print(f"Train: {metrics['train_size']} rows / {metrics['train_groups']} groups")
    print(f"Test:  {metrics['test_size']} rows / {metrics['test_groups']} groups")
    print(json.dumps(report, indent=2))

    MODEL_DIR.mkdir(exist_ok=True)
    joblib.dump(vectorizer, VECTORIZER_PATH)
    joblib.dump(classifier, CLASSIFIER_PATH)
    METRICS_PATH.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(f"Saved vectorizer/classifier/metrics to {MODEL_DIR}")


if __name__ == "__main__":
    main()
