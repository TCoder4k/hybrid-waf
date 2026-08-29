# Hybrid WAF

Hybrid Web Application Firewall using Rule-based Detection
and Machine Learning for SQL Injection and XSS detection.

## Tech Stack

- Next.js
- NestJS
- Python
- scikit-learn
- PostgreSQL
- Docker

## Main Features

- SQL Injection Detection
- XSS Detection
- Rule-based Detection
- Machine Learning Detection
- Hybrid Decision Engine
- Request Blocking
- Security Logging
- Security Dashboard

## Repository Structure

```text
hybrid-waf/
├── backend/         # Hybrid WAF (NestJS) — request pipeline, detection, decision, admin API
├── protected-api/    # Minimal demo API sitting behind the WAF
├── ml-service/        # ML detection service foundation (Python + FastAPI + scikit-learn)
├── frontend/           # Admin dashboard (Next.js)
├── docs/                # Project docs — see docs/CLAUDE.md for full context, docs/architecture.md for architecture
└── docker-compose.yml    # Local dev orchestration for all services + PostgreSQL
```

Full architecture, scope, and phase roadmap: [docs/CLAUDE.md](docs/CLAUDE.md) and [docs/architecture.md](docs/architecture.md).

## Getting Started

Prerequisites: Node.js 22+, Python 3.13+, Docker (optional, for running everything together).

For each service (`backend`, `protected-api`, `ml-service`, `frontend`), copy its `.env.example` to `.env` and adjust values as needed. Also copy the root `.env.example` to `.env` (used by `docker-compose.yml` for PostgreSQL credentials).

**Run individually:**

```bash
# backend / protected-api (NestJS)
cd backend && npm install && npm run start:dev

# ml-service (Python)
cd ml-service && python -m venv .venv && .venv/Scripts/activate && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8001

# frontend (Next.js)
cd frontend && npm install && npm run dev
```

**Run everything with Docker Compose:**

```bash
docker compose up --build
```

This currently only starts service foundations (health checks, one demo endpoint) — detection, decision, logging, auth, and the dashboard are implemented in later phases (see `docs/CLAUDE.md` §17).
