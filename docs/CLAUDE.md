# CLAUDE.md — Hybrid WAF

This is the primary Claude Code brain for this repository. Read this file, then `docs/memory.md`, before planning any task. For architecture-related tasks, also read `docs/architecture.md` once it exists.

## 1. Project mission

Build a Hybrid Web Application Firewall (Hybrid WAF) that combines rule-based detection and machine learning to detect and block SQL Injection and XSS attacks against a Web API. This is an MVP for a student capstone project, to be completed and demoable within roughly 20 days.

## 2. MVP scope

Only the following are in scope:

- SQL Injection detection
- XSS detection
- Rule-based Detection
- Machine Learning Detection
- Hybrid Decision Engine
- Security Logging
- Admin Dashboard
- Evaluation (of detection accuracy / effectiveness)

## 3. Explicit non-goals

Do not add, even if related or "nice to have," without explicit user approval:

- DDoS protection
- Bot detection
- Advanced rate limiting
- CSRF protection
- Malware scanning
- Command Injection detection
- LDAP Injection detection
- SSRF detection
- RCE detection
- XXE detection
- Kubernetes-native WAF features
- Cloud WAF integration
- Complex/deep learning models (only scikit-learn-level ML)
- Threat intelligence feeds
- Automatic AI rule generation
- Distributed ML training
- Any other feature outside the MVP scope in section 2

If a task seems to require one of these, STOP and report it as scope expansion rather than implementing it.

## 4. Core workflow

```text
API Client
    ↓
Hybrid WAF
    ↓
Request Extraction & Normalization
    ↓
┌───────────────────┬────────────────────┐
│ Rule-based        │ Machine Learning   │
│ Detection         │ Detection          │
└─────────┬─────────┴──────────┬─────────┘
          ↓                    ↓
          └──── Hybrid Decision Engine ────┐
                                           ↓
                                  ┌────────┴────────┐
                                  ↓                 ↓
                               ALLOW              BLOCK
                                  ↓                 ↓
                           Protected API       HTTP 403
                                                    ↓
                                             Security Log
                                                    ↓
                                             Admin Dashboard
```

## 5. Actors

- **API Client** — sends HTTP requests toward the protected API.
- **Hybrid WAF** — the mandatory entry point; intercepts every request before it reaches the protected API.
- **Rule Engine** — pattern/signature-based SQLi and XSS detectors.
- **ML Service** — feature extraction + scikit-learn model producing a classification and confidence score.
- **Hybrid Decision Engine** — combines rule and ML results into a final ALLOW/BLOCK decision.
- **Protected API** — the demo backend being defended; only reachable through the WAF.
- **Security Logger** — persists security events (allowed/blocked requests, reasons, scores).
- **Admin** — authenticated user who views logged events via the dashboard.
- **Database** — stores admin accounts and security events.

## 6. Logical architecture

High-level components only; a detailed component/sequence diagram belongs in `docs/architecture.md` (created in Phase 1, not yet written):

- WAF entry point
- Request normalizer
- Rule-based detection engine
- ML detection engine (calls out to the Python ML service)
- Hybrid decision engine
- Security event logger
- Admin authentication + admin API
- Dashboard (Next.js UI)

## 7. Planned technology stack

Planned, to be confirmed at architecture approval (Phase 1). Do not change without updating this section and getting explicit approval:

- **Frontend:** Next.js, TypeScript
- **Backend / WAF:** NestJS, TypeScript
- **ML Service:** Python, scikit-learn
- **Database:** PostgreSQL
- **Containerization:** Docker

## 8. Backend architecture principles

- Layered responsibility: `Controller → Service → Detection Engine → Decision Engine → Repository/Persistence`.
- Controllers stay thin — no detection, decision, or persistence logic inside controllers.
- Rule engine and ML engine are built behind a shared interface/contract so either can be swapped or mocked without touching the decision engine.
- The decision engine is a separate unit, not embedded in a controller or service that also does I/O.

## 9. ML architecture principles

```text
Request
 ↓
Feature Extraction
 ↓
ML Service
 ↓
Prediction
 ↓
Confidence
```

- The ML service is a separate Python process; the NestJS WAF calls it over HTTP.
- Only scikit-learn-level models — no deep learning, no distributed training.
- The WAF-side ML detection engine talks to the ML service through a defined interface, never by embedding Python logic in the backend.

## 10. Security principles

- The Hybrid WAF is a mandatory choke point — the protected API must not be reachable except through it.
- No hardcoded secrets, passwords, JWT secrets, database credentials, or API keys anywhere in code or commits.
- Only `.env.example` is committed; `.env` is never committed.
- Admin API and dashboard require authentication.
- Database access follows least privilege.

## 11. Database principles

Minimal schema for the MVP — do not add entities beyond what's justified by the current phase:

- `Admin`
- `SecurityEvent`

## 12. Testing principles

- Each service (backend, ML service, protected API, frontend) has a basic test setup from the start.
- Unit tests are written in the same phase as the feature they cover, not deferred to a later phase.
- The WAF pipeline gets integration/e2e tests once it exists (Phase 3+).
- Build, lint, and tests must pass before a phase is considered done.

## 13. Coding conventions

- TypeScript strict mode for backend and frontend.
- No dumping business logic into `app.controller.ts` or equivalent catch-all files.
- One responsibility per folder/module (see backend structure planned in Phase 1B).
- Python code in the ML service follows PEP8.

## 14. Git conventions

- Claude never commits. The user reviews and commits.
- Remote branches observed: `main`, `linh`, `tu`, `tung` — treat `linh`/`tu`/`tung` as teammate branches; do not push to or rewrite them.
- No force-push, no rewriting shared history, without explicit user instruction.

## 15. Claude working workflow

Every task in this repository follows this flow:

```text
READ PROJECT
↓
Read docs/CLAUDE.md
↓
Read docs/memory.md
↓
ANALYZE
↓
PLAN
↓
REVIEW PLAN
↓
WAIT FOR USER APPROVAL
↓
IMPLEMENT
↓
BUILD
↓
LINT
↓
UNIT TEST
↓
E2E TEST
↓
PRODUCTION REVIEW
↓
UPDATE docs/memory.md
↓
STOP
```

If a task touches architecture, also read `docs/architecture.md` before planning.

Claude does not skip the approval step for architectural changes, and does not commit.

If an architectural blocker is hit:

```text
STOP
REPORT BLOCKER
DO NOT CHANGE APPROVED ARCHITECTURE
```

Do not pull multiple phases into a single task just because they are related. One task = one phase = one clear goal → implementation → tests → review → memory update → STOP.

If scope expansion, an architectural conflict, a security concern, an unexpected dependency, a database redesign, or a technology stack change comes up mid-task: STOP and report it — do not resolve it by silently changing the architecture.

## 16. Definition of Done

A phase is done only when:

- Build passes
- Lint passes
- Unit tests pass
- E2E/integration tests pass (where applicable to the phase)
- `docs/memory.md` is updated to reflect the new state
- No scope creep beyond section 2 (MVP scope) / section 3 (non-goals)
- The user has reviewed the work
- Claude has not committed anything

## 17. 20-day implementation strategy

Phase-level roadmap. Phases may be adjusted if a better grouping is found, but scope (sections 2 and 3) does not expand.

```text
Phase 0  — Foundation
Phase 1A — Architecture Design
Phase 1B — Repository Scaffolding
Phase 2  — Database + Core Domain
Phase 3  — Protected API + WAF Proxy
Phase 4  — Request Extraction + Normalization
Phase 5  — Rule-based SQLi/XSS
Phase 6  — Dataset + ML
Phase 7  — Hybrid Decision Engine
Phase 8  — Security Logging
Phase 9  — Admin Authentication/API
Phase 9A — Traffic Metrics Foundation (architecture adjustment, inserted 2026-08-26 ahead of Phase 10 — see ADR-7)
Phase 10 — Dashboard
Phase 11 — Evaluation
Phase 12+ — Integration / Testing / Docker / Deploy
```

Revised 2026-08-25 to match the phase breakdown actually agreed after Phase 1A — Phase 1 split into 1A/1B, and Database work was moved ahead of the WAF proxy/pipeline work. No scope changed, only ordering/grouping.

Revised again 2026-08-26 to insert Phase 9A (Traffic Metrics Foundation) ahead of Phase 10 — a small architecture adjustment (ADR-7) so the Dashboard's Total/Allowed Requests figures have real aggregate data to read, not a `SecurityEvent`-count workaround that would misrepresent BLOCK-only rows as total traffic.

Current phase status is tracked in `docs/memory.md`, not here.
