# Phase 11 — Rule-only vs ML-only vs Hybrid Comparison

Evaluation set: 64 rows (Phase 6's group-disjoint held-out test split — the same rows `ml-service/model/metrics.json` reports the ML model's own numbers on).

## Summary (macro-averaged)

| Method | Accuracy | Precision | Recall | F1 |
|---|---|---|---|---|
| Rule-only | 1.0000 | 1.0000 | 1.0000 | 1.0000 |
| ML-only | 1.0000 | 1.0000 | 1.0000 | 1.0000 |
| Hybrid | 1.0000 | 1.0000 | 1.0000 | 1.0000 |

## Per-class breakdown

### Rule-only

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| NORMAL | 1.0000 | 1.0000 | 1.0000 | 25 |
| SQL_INJECTION | 1.0000 | 1.0000 | 1.0000 | 21 |
| XSS | 1.0000 | 1.0000 | 1.0000 | 18 |

### ML-only

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| NORMAL | 1.0000 | 1.0000 | 1.0000 | 25 |
| SQL_INJECTION | 1.0000 | 1.0000 | 1.0000 | 21 |
| XSS | 1.0000 | 1.0000 | 1.0000 | 18 |

### Hybrid

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| NORMAL | 1.0000 | 1.0000 | 1.0000 | 25 |
| SQL_INJECTION | 1.0000 | 1.0000 | 1.0000 | 21 |
| XSS | 1.0000 | 1.0000 | 1.0000 | 18 |

