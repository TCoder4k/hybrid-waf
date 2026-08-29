# ML Service

Python + FastAPI + scikit-learn foundation for the Hybrid WAF's ML detection component. See `docs/architecture.md` §7 for the request/response contract this service will implement.

Status: foundation only — no model, no feature extraction, no prediction endpoint yet (Phase 6).

## Setup

```bash
python -m venv .venv
.venv/Scripts/activate   # Windows
pip install -r requirements.txt
```

## Run

```bash
uvicorn app.main:app --reload --port 8001
```

## Test

```bash
pytest
```
