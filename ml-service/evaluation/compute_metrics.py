"""
Computes Accuracy/Precision/Recall/F1 for Rule-only, ML-only, and Hybrid
detection on the same evaluation set (per the SRS's required comparison
table), using the exact same sklearn.metrics functions training/train.py
already uses to report the model's own numbers — so the methodology stays
consistent between what Phase 6 reported for the ML model alone and what
Phase 11 reports for all three methods here.

Input: evaluation/predictions.json, produced by running the real
RuleDetectionEngine / MLDetectionEngine / HybridDecisionEngine against
evaluation/test_set.json (see backend/scripts/evaluate-detection.ts).

Run: python -m evaluation.compute_metrics
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

PREDICTIONS_PATH = Path(__file__).parent / "predictions.json"
METRICS_OUTPUT_PATH = Path(__file__).parent / "comparison_metrics.json"
REPORT_OUTPUT_PATH = Path(__file__).parent / "comparison_report.md"

METHODS = [
    ("rule_only", "rulePrediction", "Rule-only"),
    ("ml_only", "mlPrediction", "ML-only"),
    ("hybrid", "hybridPrediction", "Hybrid"),
]


def score_method(true_labels: list[str], predictions: list[str], labels_order: list[str]) -> dict[str, Any]:
    report = classification_report(
        true_labels, predictions, labels=labels_order, output_dict=True, zero_division=0
    )
    matrix = confusion_matrix(true_labels, predictions, labels=labels_order).tolist()
    return {
        "accuracy": accuracy_score(true_labels, predictions),
        "classification_report": report,
        "confusion_matrix": {"labels": labels_order, "matrix": matrix},
    }


def render_markdown(test_size: int, results: dict[str, dict[str, Any]]) -> str:
    lines = [
        "# Phase 11 — Rule-only vs ML-only vs Hybrid Comparison",
        "",
        f"Evaluation set: {test_size} rows (Phase 6's group-disjoint held-out "
        "test split — the same rows `ml-service/model/metrics.json` reports "
        "the ML model's own numbers on).",
        "",
        "## Summary (macro-averaged)",
        "",
        "| Method | Accuracy | Precision | Recall | F1 |",
        "|---|---|---|---|---|",
    ]
    for key, _, label in METHODS:
        r = results[key]
        macro = r["classification_report"]["macro avg"]
        lines.append(
            f"| {label} | {r['accuracy']:.4f} | {macro['precision']:.4f} | "
            f"{macro['recall']:.4f} | {macro['f1-score']:.4f} |"
        )

    lines += ["", "## Per-class breakdown", ""]
    class_labels = results["rule_only"]["confusion_matrix"]["labels"]
    for key, _, label in METHODS:
        lines.append(f"### {label}")
        lines.append("")
        lines.append("| Class | Precision | Recall | F1 | Support |")
        lines.append("|---|---|---|---|---|")
        r = results[key]["classification_report"]
        for cls in class_labels:
            c = r[cls]
            lines.append(
                f"| {cls} | {c['precision']:.4f} | {c['recall']:.4f} | "
                f"{c['f1-score']:.4f} | {int(c['support'])} |"
            )
        lines.append("")

    return "\n".join(lines) + "\n"


def main() -> None:
    rows: list[dict[str, Any]] = json.loads(PREDICTIONS_PATH.read_text(encoding="utf-8"))
    true_labels = [row["label"] for row in rows]
    labels_order = sorted(set(true_labels))

    results: dict[str, dict[str, Any]] = {}
    for key, prediction_field, label in METHODS:
        predictions = [row[prediction_field] for row in rows]
        results[key] = score_method(true_labels, predictions, labels_order)
        print(f"{label}: accuracy={results[key]['accuracy']:.4f}")

    output = {
        "test_size": len(rows),
        "labels": labels_order,
        "methods": results,
    }
    METRICS_OUTPUT_PATH.write_text(json.dumps(output, indent=2), encoding="utf-8")
    REPORT_OUTPUT_PATH.write_text(render_markdown(len(rows), results), encoding="utf-8")
    print(f"Wrote {METRICS_OUTPUT_PATH} and {REPORT_OUTPUT_PATH}")


if __name__ == "__main__":
    main()
