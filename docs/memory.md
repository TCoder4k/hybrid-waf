# Hybrid WAF — Project Memory

This file tracks the current state of the Hybrid WAF project. It is scoped to this project only. Read alongside `docs/CLAUDE.md` before planning any task, and update it after finishing a phase.

Last updated: 2026-09-01

## Current Phase

Phase 11 — Evaluation (complete). This was the last phase on the `docs/CLAUDE.md` §17 roadmap. Since then, two standalone, explicitly-scoped tasks (not numbered phases) have also been completed: the Admin Dashboard UI Redesign, and the full Security Events page — see "Dashboard UI Redesign detail" and "Security Events Page detail" below. Awaiting review/next instruction.

## Status

- Phase 0 (Project Foundation) complete and reviewed
- Phase 1A (Architecture Design) complete and approved — ADR-1 through ADR-6, ADR-2/ADR-5 with clarifications
- Phase 1B (Repository Scaffolding) complete
- Phase 2 (Database + Core Domain) complete
- Phase 3 (Protected API + WAF Proxy) complete
- Phase 4 (Request Extraction + Normalization) complete
- Phase 5 (Rule-based SQLi/XSS) complete
- Phase 6 (Dataset + ML) complete: TF-IDF + Logistic Regression classifier trained on a synthetic dataset, served via `ml-service` `/predict`, called from `backend`'s new `MLDetectionEngine` — every request now gets BOTH a rule result and an ML result, still observed/logged only — see "Phase 6 detail" below
- Phase 7 (Hybrid Decision Engine) complete: `HybridDecisionEngine` combines the rule and ML results into one `DecisionResult` per `docs/architecture.md` §8 (ADR-2) — **BLOCK/HTTP 403 happens for the first time in this project.** See "Phase 7 detail" below
- Phase 8 (Security Logging) complete: a `SecurityEvent` row is now persisted for every BLOCK decision (ADR-3), with redacted `requestMeta` only (ADR-4) — ALLOWed traffic is still not persisted, and a database outage does not weaken the BLOCK decision. See "Phase 8 detail" below
- Phase 9 (Admin Authentication/API) complete: JWT login (`POST /auth/login`) + a read-only Admin API (`GET /admin/events`, `GET /admin/events/:id`) protected by a JWT guard, per ADR-5. **A real route-precedence bug was found and fixed live** — see "Phase 9 detail" below; this is now the most important architectural gotcha to remember about this codebase.
- Phase 9A (Traffic Metrics Foundation) complete: a new `TrafficMetric` table (hourly UTC buckets: total/allowed/blocked/SQLi/XSS) is incremented atomically on **every** request — ALLOW and BLOCK both — via a **fire-and-forget, `.catch()`-guarded** call that is never awaited before the response (ADR-7). `SecurityEvent` stays BLOCK-only, unchanged. See "Phase 9A detail" below.
- Roadmap in `docs/CLAUDE.md` §17 reconciled to the Phase 0/1A/1B/2/3/... breakdown actually in use (was still showing the old Phase-1-only numbering); one stale "Phase 2+" reference in §12 fixed to "Phase 3+"; Phase 9A inserted ahead of Phase 10 (2026-08-26)
- Phase 10 (Dashboard) complete: `GET /admin/stats` (reads `TrafficMetric` only) plus a real Next.js Dashboard (login, stat tiles, Attack Distribution, Recent Security Events, logout) — the frontend now has real logic for the first time since Phase 1B's scaffold. See "Phase 10 detail" below.
- Phase 11 (Evaluation) complete: a 3-step Rule-only vs ML-only vs Hybrid comparison harness (`ml-service/evaluation/` + `backend/scripts/evaluate-detection.ts`), run for real against Phase 6's held-out test split, reusing the actual production `RuleDetectionEngine`/`MLDetectionEngine`/`HybridDecisionEngine` — no detection/decision logic re-implemented. See "Phase 11 detail" below.
- **Dashboard UI Redesign** (standalone task, not a numbered phase) complete: the Overview page rebuilt to match a user-supplied reference design — persistent Header/Sidebar/Footer chrome, a date-range selector, a Request Trend line chart and Attack Distribution donut (`recharts`), an enriched Recent Security Events table (IP/country/confidence-bar/badges + a detail modal), and 4 summary panels (System Status, System Info, Quick Stats, Recent Activity) — backed by 6 new/extended Admin API endpoints and a new `geoip-lite` backend dependency. See "Dashboard UI Redesign detail" below.
- **Security Events Page** (standalone task, not a numbered phase) complete: the `/events` sidebar destination — previously one of the 5 "Sắp ra mắt" placeholders — is now a fully real, filterable, paginated events page matching a second user-supplied reference screenshot: a filter bar (search/attack type/method/min confidence/date range), the same enriched events table reused from the Dashboard, pagination with a page-size selector, and client-side CSV export. `GET /admin/events` gained `search`/`method`/`minConfidence`/`days` query params. See "Security Events Page detail" below.

## Completed

- Project context defined
- MVP scope defined
- Core workflow defined
- Phase 0 documentation foundation (`docs/CLAUDE.md`, `docs/memory.md`, root `CLAUDE.md` pointer)
- Phase 1A: `docs/architecture.md` written, approved with two clarifications (ADR-2, ADR-5), architecture cross-reference cleanup done
- Phase 1B: repository scaffolded per `docs/architecture.md` §14 — see "Phase 1B scaffolding detail" below
- Phase 2: database + core domain wired — see "Phase 2 detail" below
- Phase 3: WAF reverse proxy wired — see "Phase 3 detail" below

## Phase 1B scaffolding detail

**backend** (`backend/`, NestJS + TypeScript, via Nest CLI):
- `GET /health` → `{ status: 'ok' }` (replaces the CLI's default `GET /`)
- Empty module foundations wired into `AppModule`, one per `docs/architecture.md` §3.1: `modules/{waf,request,detection,decision,security-events,auth,admin}` — each is a bare `@Module({})` with a comment pointing at the phase that will fill it in; `common/` created empty (`.gitkeep`) for the shared types Phase 4 will add
- No DB/ORM wired yet — deferred to Phase 2 per the roadmap's own "Database + Core Domain" phase; `DATABASE_URL` is documented in `.env.example` but nothing reads it yet
- Build/lint/unit/e2e all pass

**protected-api** (`protected-api/`, NestJS + TypeScript, separate Nest CLI project):
- `GET /health` → `{ status: 'ok' }`, `GET /api/hello` → `{ message: 'Hello from the Protected API' }` (the demo route `docs/architecture.md` §9 asks for)
- No business logic. Build/lint/unit/e2e all pass

**ml-service** (`ml-service/`, Python 3.13 + FastAPI, hand-scaffolded — no CLI generator for this stack):
- `GET /health` → `{"status": "ok"}`
- `app/{api,services,models}/` created as empty package foundations for Phase 6 (feature extraction, model loading, `/predict`) — no model, no training, no dataset
- `requirements.txt`: fastapi, uvicorn[standard], scikit-learn, pydantic, pytest, httpx — pinned, no ML-training/charting/unrelated libs. (Initially also pinned `pydantic-settings` speculatively; removed during the production review since nothing consumed it yet — dependency policy requires each dependency to have a current-phase purpose.)
- 1 pytest smoke test on `/health`, passes

**frontend** (`frontend/`, Next.js + TypeScript + Tailwind, via `create-next-app`):
- Default starter page only, unmodified — no dashboard, no auth UI, no charts
- Build and lint clean; production server verified to start and serve `200` on `/`
- Note: `create-next-app` auto-generated `frontend/AGENTS.md` and `frontend/CLAUDE.md` (framework-standard files documenting Next.js API changes for coding agents, regenerated by `next dev` if deleted) — left in place; they don't conflict with `docs/CLAUDE.md`, which remains this repo's actual project brain

**Environment / secrets:**
- `.env.example` created for root (Postgres creds for docker-compose), `backend`, `protected-api`, `ml-service`, `frontend` — placeholder values only
- Root `.gitignore` covers `.env`/`.env.*` with `!.env.example` at any depth; `frontend/.gitignore` (auto-generated by `create-next-app`) needed an added `!.env.example` line too — its own `.env*` rule was silently swallowing the example file until fixed
- No `.env` files exist in the repo; verified via `git status` and a secret-pattern grep across all authored source before finishing

**Docker (`docker-compose.yml` + one `Dockerfile`/`.dockerignore` per service):**
- Services: `postgres`, `ml-service`, `backend`, `protected-api`, `frontend` — dev-level single-stage Dockerfiles, no multi-stage/production optimization, no Kubernetes/Nginx/Redis/mesh
- `protected-api` deliberately has **no host port mapping** — only reachable from `backend` over the internal compose network (`http://protected-api:3001`), enforcing "WAF is the only path to the Protected API" (`docs/architecture.md` §15/§17) even in local dev
- `backend` gets `DATABASE_URL`/`ML_SERVICE_URL`/`PROTECTED_API_URL` pointing at service DNS names via compose `environment:`, layered over each service's own `.env`
- Verified end-to-end: `docker compose build` (all 4 images), `docker compose up` (all 5 containers, postgres reports `healthy`), host→`backend`/`ml-service`/`frontend` all `200`, `backend`→`protected-api` reachable internally (`docker compose exec backend wget ...`), host→`protected-api` **unreachable** (connection timeout) — confirms the network boundary actually holds
- Verification used a temporary local port remap for `postgres` (5433) because this dev machine already has a local Postgres bound to 5432 — reverted back to the correct `5432:5432` default before finishing; this is a note about the local test machine, not a defect in the compose file

**Root docs:** `README.md` updated with a repository-structure tree and "Getting Started" (run individually / `docker compose up --build`) — no extensive user docs added.

## Phase 2 detail

**ORM decision:** Prisma (was the open item flagged after Phase 1B). Chosen over TypeORM for less boilerplate on two simple entities and a typed client that maps cleanly onto the `DetectionResult`/`SecurityEvent`-style contracts already in `docs/architecture.md`.

**Schema** (`backend/prisma/schema.prisma`, migration `20260825070627_init`): `Admin` (`id`, `username` unique, `passwordHash`, `createdAt`) and `SecurityEvent` (`id`, `timestamp`, `sourceIp`, `method`, `endpoint`, `attackType`, `ruleResult` jsonb, `mlResult` jsonb, `confidence` nullable float, `decision`, `requestMeta` jsonb) — matches `docs/architecture.md` §12 exactly: no FK between the two tables, indexes on `SecurityEvent(timestamp)` and `SecurityEvent(attackType)`. No other tables.

**Backend wiring:**
- `backend/src/database/{prisma.service.ts,database.module.ts}` — a small `PrismaService` (connect/disconnect lifecycle hooks) exported by `DatabaseModule`
- `modules/security-events/security-event.repository.ts` and `modules/auth/admin.repository.ts` — thin CRUD wrappers only (`create`/`findById`/`findByUsername`/`findMany`), no business logic; wired into their respective (previously-empty) module files, each importing `DatabaseModule`
- `backend/src/common/types.ts` replaces the Phase 1B `.gitkeep` placeholder: `NormalizedRequest`, `DetectionResult`, `MLDetectionResult` (the `AVAILABLE`/`UNAVAILABLE` tagged union per ADR-2), `DecisionResult` — copied verbatim from `docs/architecture.md` §5-§8, type-only, no runtime logic

**Verification performed:**
- `prisma migrate dev` against a throwaway Postgres container produced SQL matching the ERD exactly
- Migration re-verified reproducible via `prisma migrate deploy` against a second, completely fresh database
- `npm run build` / `lint` / `test` / `test:e2e` all pass — `test:e2e` now includes a DB smoke test (`test/database.e2e-spec.ts`) that creates+reads back one `Admin` row and one `SecurityEvent` row against a real Postgres, then cleans up (confirmed 0 rows left afterward)
- Full `docker compose up` cycle re-run: backend image rebuilds cleanly with Prisma (client generation wired via `postinstall: prisma generate`, with `prisma/` + `prisma.config.ts` copied into the image *before* `npm install` so postinstall can find the schema), and `docker compose exec backend npx prisma migrate deploy` applied the migration against the real `postgres` service by its compose DNS name — confirmed `admins`/`security_events`/`_prisma_migrations` tables exist and `backend`'s `/health` still returns `200`
- Local-only fix along the way: the Prisma-generated `prisma.config.ts` needed `earlyAccess: true` added (type error otherwise) and was excluded from `tsconfig.build.json` (CLI-only config, not part of the compiled app)
- Cleanup: all throwaway/local Postgres containers removed, `docker-compose.yml`'s postgres port reverted to the correct `5432:5432`, no `.env` files left in the repo (checked via `git status` + secret-pattern grep)

**Not done in Phase 2** (intentionally): no WAF proxy, no request normalization runtime, no rule/ML detection runtime, no decision engine runtime, no admin login/JWT, no dashboard. The repositories exist only as persistence primitives for those later phases to call into.

## Phase 3 detail

**Scope:** pure reverse-proxy forwarding only — no normalization, detection, or decision logic (those are Phases 4-7). Goal was strictly `API Client → Hybrid WAF → Protected API → Response` end-to-end.

**Backend wiring:**
- `modules/waf/{waf.controller.ts,waf.service.ts}` — replaces the Phase 1B empty `WafModule` stub. `WafController` uses a NestJS `@All('*')` catch-all; `WafService.forward()` reads `PROTECTED_API_URL` per-request (not cached at construction — makes it swappable and simpler to test), forwards method/headers(minus hop-by-hop)/body via native `fetch` (no new HTTP client dependency), and relays status/headers/body back verbatim.
- Confirmed empirically (via Nest's route-registration log) that `AppController`'s `/health` maps *before* `WafController`'s `{/*, ALL}` wildcard, so the proxy doesn't swallow the backend's own health endpoint — this was a real risk with a wildcard catch-all in a separate module, not just a theoretical one.
- Added `502 Bad Gateway` handling for when Protected API is unreachable, matching `docs/architecture.md` §16 Failure Handling exactly (`{ statusCode: 502, error: 'Bad Gateway', message: 'Protected API is unavailable' }`) — this wasn't in my first pass; a raw unhandled `fetch` rejection would otherwise have surfaced as a generic `500`, which is a real correctness gap I caught and fixed during this phase, not something flagged in advance.

**Tests added:**
- `waf.service.spec.ts` (unit, mocked `fetch`): forwards to `PROTECTED_API_URL + originalUrl`, strips hop-by-hop headers, forwards JSON body, returns 502 on fetch failure
- `test/waf-proxy.e2e-spec.ts` (e2e): boots only `WafModule` (not full `AppModule` — deliberately avoids requiring a live DB just to test the proxy) against an in-process stand-in HTTP server; proves a real request forwards through, a Protected-API 404 relays verbatim, and closing the stand-in server produces `502`
- `npm run build` / `lint` / `test` (5/5) / `test:e2e` (6/6 across 3 suites) all pass

**Manual live verification** (real `backend` + real `protected-api` processes, throwaway Postgres for the DB-dependent `PrismaService.onModuleInit`):
- `GET /health` → backend's own `200` (not proxied)
- `GET /api/hello` through the WAF → protected-api's actual `200` response, byte-identical
- `GET /api/does-not-exist` through the WAF → protected-api's real `404` relayed verbatim
- `POST /api/hello` with a JSON body through the WAF → protected-api's real `404` (no POST route there) relayed verbatim, proving the body-forwarding path doesn't crash
- Pointed `PROTECTED_API_URL` at a closed port → confirmed `502 Bad Gateway` with the exact documented body

**Incidental discovery, not a Phase 3 bug:** `PrismaService.onModuleInit()` (from Phase 2) connects to Postgres eagerly at app boot, so `backend` cannot start at all — not even to serve the WAF proxy — without a reachable database. Worth being aware of for local dev; not changed this phase since it's standard NestJS+Prisma behavior and wasn't in scope to revisit.

**Cleanup:** throwaway Postgres container and local `.env` files removed after verification; `git status` and a secret-pattern grep confirm nothing stray was left.

*(Superseded in Phase 4: the forwarding logic described above as living in `WafService.forward()` was relocated to `ProtectedApiClientService.forward()`; `WafService` is now the pipeline orchestrator. See "Phase 4 detail" below.)*

## Phase 4 detail

**Scope:** Extract + Normalize only — produce a `NormalizedRequest` on every request through the WAF. Explicitly no rule-based/ML detection, no decision logic, no BLOCK — every request is still unconditionally forwarded, exactly as directed.

**Architectural refactor (per explicit direction, not optional cleanup):** `WafService.forward()` was not to become a "God Service" as more pipeline stages get added. Split into:
- `modules/request/request-normalizer.service.ts` (`RequestNormalizerService`) — pure `normalize(req): NormalizedRequest`. Header handling is allow-list based (`content-type`, `user-agent`, `accept` only — `Authorization`/`Cookie` deliberately excluded per `docs/architecture.md` §5/§17).
- `modules/waf/protected-api-client.service.ts` (`ProtectedApiClientService`) — the Phase 3 forwarding logic, relocated verbatim (unchanged behavior, just renamed/moved). Sole responsibility: relay to Protected API and back.
- `modules/waf/waf.service.ts` (`WafService`) — now a thin orchestrator: `handle(req)` calls `RequestNormalizerService.normalize()`, logs the result at debug level (the only "consumer" that exists right now), then unconditionally calls `ProtectedApiClientService.forward()`. This is exactly the shape `docs/architecture.md` §3.1 already specified (`Controller → Service (WafService) → Normalizer → [Detection/Decision, not yet wired] → Persistence/Forward`) — Phase 5-7 will insert detection/decision between the normalize and forward calls, not require touching `WafService`'s shape again.

**Tests added/changed:**
- `request-normalizer.service.spec.ts` (new): method/url/endpoint extraction (query string stripped from `endpoint`), query/path params and body pass through, sourceIp captured, header allow-list enforced (explicitly asserts `Authorization`/`Cookie` are dropped), timestamp is valid ISO 8601
- `protected-api-client.service.spec.ts` (renamed from the old `waf.service.spec.ts`, same 4 test cases, now targeting `ProtectedApiClientService`)
- `waf.service.spec.ts` (rewritten): now tests the orchestrator — normalizer is called with the request, then the (mocked) Protected API client is called, result relayed
- `npm run build` / `lint` / `test` (13/13 across 4 suites) / `test:e2e` (6/6 across 3 suites, `waf-proxy.e2e-spec.ts` unaffected since normalization doesn't change forwarding behavior yet) all pass

**Manual live verification** (real `backend` + `protected-api` processes, throwaway Postgres): `/health` still `200` (untouched by WAF), `GET /api/hello?id=1 OR 1=1` through the WAF still gets protected-api's real `200` — and the debug log confirms normalization actually ran on that real request: query param correctly URL-decoded to `"1 OR 1=1"`, endpoint correctly stripped to `/api/hello`, only allow-listed headers present, valid sourceIp/timestamp.

**Real finding, not fixed (documented instead):** `pathParams` on a normalized request currently comes out as `{"path":["api","hello"]}` — an artifact of Express's route-matching against the WAF's own `@All('*')` catch-all, not real named route parameters. The WAF has no visibility into Protected API's actual route table (`/api/users/:id` etc.) and isn't meant to — making it route-aware would be scope creep beyond what's approved. For SQLi/XSS detection purposes this is likely fine since `endpoint`/`queryParams`/`body` carry the real signal; flagging so Phase 5's rule engine doesn't accidentally rely on `pathParams` expecting it to be meaningful.

**Cleanup:** throwaway Postgres container and local `.env` file removed; `git status` and a secret-pattern grep confirm nothing stray was left.

## Phase 5 detail

**Scope:** real pattern/signature-based SQLi and XSS detectors, composed into a `RuleDetectionEngine`, wired into the live pipeline as an observed stage — same "runs on every request but doesn't change behavior yet" pattern as Phase 4's normalizer. No ML, no decision logic, no BLOCK — confirmed live that an actual SQLi/XSS payload through the WAF still gets forwarded (Phase 7's Decision Engine is what will act on this).

**`modules/detection/rule-based/`** (new):
- `rule-detector.interface.ts` — shared `RuleDetector.detect(request): DetectionResult` contract
- `search-surface.util.ts` — builds the string scanned by both detectors: `endpoint + queryParams + body`, deliberately excluding `pathParams` (per the Phase 4 finding: not meaningful under the WAF's catch-all route) and headers (out of scope for SQLi/XSS signatures)
- `sql-injection.detector.ts` (`SqlInjectionRuleDetector`) — 7 regex signatures: boolean/quote-based tautologies (`OR 1=1`, `' OR '1'='1`), `UNION SELECT`, stacked queries, SQL comment sequences, time-based blind functions (`SLEEP`/`BENCHMARK`/`WAITFOR DELAY`), `xp_cmdshell`
- `xss.detector.ts` (`XssRuleDetector`) — 7 regex signatures: `<script>`, `javascript:` URIs, inline event handlers (`onerror=`, `onload=`, etc.), `<img onerror>`, `<svg onload>`, `<iframe>`, `document.cookie`
- `rule-detection.engine.ts` (`RuleDetectionEngine`) — composes both detectors, SQLi checked first (returns on first match, matching `docs/architecture.md` §6's "highest-severity result")

**`WafService` updated** (still the thin orchestrator from Phase 4, not touched structurally): now also calls `RuleDetectionEngine.detect(normalized)` after normalizing and logs the result at debug level, then unconditionally forwards regardless of the result — this is deliberate, not an oversight; blocking only starts once the Hybrid Decision Engine exists (Phase 7) and has both rule *and* ML input to work with.

**Tests added:**
- `sql-injection.detector.spec.ts` / `xss.detector.spec.ts` — table-driven (`it.each`), 7 attack payloads + 3-4 benign payloads each, explicitly including near-miss benign cases (`"coffee or tea"`, a normal `id=42`) to guard against false positives
- `rule-detection.engine.spec.ts` — NORMAL when neither fires, correct classification when one fires, SQLi takes priority when both patterns are present in the same request
- `waf.service.spec.ts` updated for the third constructor dependency; new test explicitly asserts the WAF still forwards even when the rule engine detects an attack
- `npm run build` / `lint` / `test` (37/37 across 7 suites) / `test:e2e` (6/6 across 3 suites, unaffected) all pass

**Manual live verification** (real `backend` + `protected-api`, throwaway Postgres): benign request → `NORMAL`, still `200`; `id=1' OR '1'='1` in the query string → logged as `SQL_INJECTION` with the correct reason, still `200` (forwarded); `<script>alert(1)</script>` in a POST body → logged as `XSS` with the correct reason, request still reaches protected-api (which 404s it — no POST route there, unrelated to detection). Confirms detection is real and correct on live traffic without yet affecting the ALLOW-everything behavior.

**Cleanup:** throwaway Postgres container and local `.env` file removed; `git status` and a secret-pattern grep confirm nothing stray was left.

## Phase 6 detail

**Framing (per explicit user instruction, carried into this file and any future report/SRS text):** the rule engine's 7+7 regex signatures (Phase 5) and this ML classifier are both representative-pattern prototypes for an MVP/capstone, not a claim of general/exhaustive SQLi-XSS coverage or production-grade detection. Keep that framing whenever this project is described.

**Dataset** (`ml-service/dataset/generate_dataset.py` → `dataset.csv`, 225 rows, synthetic, not real traffic): ~30 base SQLi templates (tautologies, UNION-based, error-based, time-based blind, stacked queries, comment-based, xp_cmdshell), ~25 base XSS templates (script tags, event handlers, `javascript:` URIs, encoded/case variants), ~45 base benign phrases — each expanded to a few variants via light templating (table/column substitution, case variants). Includes deliberate **hard-negative benign examples** containing SQL/XSS-adjacent tokens in innocent contexts (`"the discount code is valid until 2026 -- act fast"`, `"please select your country"`, `"5 < 10"`) — added specifically so the evaluation isn't trivial and so Rule vs ML differences actually show up in Phase 11's comparison (confirmed live: the rule engine's `--` pattern would flag the "act fast" example; the ML model correctly calls it `NORMAL`).

**Leakage prevention (the part flagged for careful review):** every row carries a `group_id` (its base template). Splitting uses `GroupShuffleSplit`, not plain `train_test_split` — all variants of one base template land entirely in train or entirely in test, never both, with an explicit assertion in `training/train.py` that no group appears on both sides. `TfidfVectorizer` is fit on the train split only; test is only ever `.transform()`-ed.

**Pipeline** (`training/train.py`): clean (dedupe) → group-aware split (75/25) → `TfidfVectorizer(analyzer='char_wb', ngram_range=(2,5))` → `LogisticRegression`. The `char_wb` analyzer is a deliberate deviation from sklearn's word-level default — word tokenization strips `'`, `--`, `<`, `=`, which carries essentially all the SQLi/XSS signal in these short strings. Artifacts committed to `ml-service/model/` (`vectorizer.joblib`, `classifier.joblib`, `metrics.json` — small, ~175KB total) so the demo doesn't require retraining.

**Result, reported honestly:** 100% accuracy/precision/recall/F1 on the held-out (group-disjoint) test set, even with hard negatives included. This reflects that char n-gram TF-IDF cleanly separates these three lexically-distinct classes on a clean synthetic corpus — it is **not** evidence of real-world generalization to obfuscated payloads or genuinely ambiguous traffic, and should be presented that way in the SRS/evaluation writeup, not as "the model is perfect."

**`ml-service` `/predict`** (`app/api/predict.py`, `app/services/{predictor,search_surface}.py`): request/response schema matches `docs/architecture.md` §7 exactly. **Real bug found and fixed during live verification:** the first version of `build_search_surface` JSON-wrapped the input (endpoint + `json.dumps(queryParams)` + `json.dumps(body)`), but the training data is bare payload strings with no endpoint prefix or JSON punctuation — this train/serve mismatch caused a completely benign `id=42` to be misclassified as `SQL_INJECTION`. Fixed by extracting raw parameter/body *values* only (no endpoint, no JSON structure) — deliberately different from the rule engine's search-surface util, since regex substring matching doesn't care about surrounding punctuation but a statistical model trained on bare values does. Caught by `tests/test_predict.py`'s benign-request case, not by inspection.

**Backend `MLDetectionEngine`** (`modules/detection/ml/ml-detection.engine.ts`): POSTs the `{method, endpoint, queryParams, pathParams, body}` subset to `ML_SERVICE_URL/predict` with a 2s timeout (`AbortController`). Maps to `MLDetectionResult` per ADR-2 — `AVAILABLE` only on a well-formed 2xx response with a valid classification, `UNAVAILABLE` (never `NORMAL`) on timeout, connection error, non-2xx, or malformed body. Wired into `WafService`: rule and ML detection now run **in parallel** (`Promise.all`), matching the sequence diagram in `docs/architecture.md` §4. Both results are logged; forwarding is still unconditional — no BLOCK until Phase 7.

**Second real bug found and fixed, this one in `RequestNormalizerService` (Phase 4 code):** live end-to-end testing hit real `422` errors from `ml-service` — `pathParams` was coming out as `{"path": ["api","hello"]}` (an array value, the Phase 4-documented wildcard-route artifact), which violates `NormalizedRequest`'s own `Record<string,string>` contract and fails Pydantic validation on the Python side. This had been merely "documented" in Phase 4 as a cosmetic oddity; Phase 6 is what actually exercised it over the wire and turned it into a real failure. Fixed at the source: `normalize()` now filters both `queryParams` and `pathParams` through a `stringValuesOnly()` helper, dropping any non-string entries rather than silently violating the declared type. Confirmed live: `pathParams` now correctly comes out as `{}`.

**Tests added:** `dataset/generate_dataset.py` produces the CSV; `tests/test_dataset.py` (class balance, no duplicates, every row has a group), `tests/test_search_surface.py`, `tests/test_predict.py` (benign/SQLi/XSS via the real trained model, confidence bounds) — ml-service pytest 13/13. Backend: `ml-detection.engine.spec.ts` (AVAILABLE, non-2xx, connection error, timeout/abort, malformed body, invalid classification value — all → UNAVAILABLE except the well-formed case), `waf.service.spec.ts` updated for the 4th constructor dependency — backend `test` 44/44 across 8 suites, `test:e2e` 6/6 across 3 suites (unaffected).

**Manual live verification** (all three services + throwaway Postgres, started with readiness polling after an earlier run raced on cold-start timing): benign → Rule `NORMAL` + ML `NORMAL` (0.61 confidence), agree; SQLi → Rule `SQL_INJECTION` + ML `SQL_INJECTION` (0.77 confidence), agree; XSS → Rule `XSS` + ML `XSS` (0.84 confidence), agree; all three still forwarded (200/404 from protected-api as appropriate) — no BLOCK, exactly as scoped.

**Cleanup:** all test processes/containers stopped, local `.env` removed, `git status` + secret-pattern grep confirm nothing stray was left (checked `__pycache__` stays gitignored despite the new Python modules).

## Phase 7 detail

**Scope discipline (explicit user instruction for this phase):** define and test the complete decision policy first, before wiring it into the pipeline; keep the policy deterministic and configurable; this is the first phase allowed to return BLOCK/HTTP 403; do **not** implement `SecurityEvent` persistence, Admin auth, or Dashboard yet (those are Phases 8-10).

**`HybridDecisionEngine`** (`backend/src/modules/decision/hybrid-decision.engine.ts`): pure, stateless `decide(request, ruleResult, mlResult): DecisionResult`, implementing the decision table already locked in at Phase 1A (`docs/architecture.md` §8, ADR-2) exactly — no new policy invented at implementation time. Branch order:

1. `ruleResult.detected === true` → **BLOCK**, classification = rule's, reason = `"rule match: " + ruleResult.reason`. The rule engine is authoritative whenever it fires — regardless of what ML says (agrees, disagrees, or is unavailable).
2. `mlResult.status === 'UNAVAILABLE'` (rule silent) → **ALLOW**, `"rule: normal; ml: unavailable"`. Rule engine is the deterministic fallback (ADR-2) — an unreachable ML service never blocks traffic on its own.
3. `mlResult.classification === 'NORMAL'` (rule silent, ML available) → **ALLOW**, `"rule: normal; ml: normal"`.
4. `mlResult.confidence >= ML_CONFIDENCE_THRESHOLD` (rule silent, ML reports an attack) → **BLOCK**, classification = ML's, reason = `"ml match: " + mlResult.reason`.
5. Otherwise (rule silent, ML reports an attack below the threshold) → **ALLOW**, reason names the classification, confidence, and threshold explicitly (e.g. `"...SQL_INJECTION below confidence threshold (0.60 < 0.7)"`) — this is not silently folded into the generic "ml: normal" message, so an operator reading the log can see the model *did* raise a flag, just not confidently enough.

`ML_CONFIDENCE_THRESHOLD` is read from the environment (default `0.7`, `backend/.env.example` documents it) — configurable per the user's requirement, not hardcoded; an unparseable value falls back to the default rather than throwing.

**All 6 required policy scenarios are unit-tested** in `hybrid-decision.engine.spec.ts` (10 tests) before any pipeline wiring, per the user's explicit instruction:
1. Rule detected + ML available (agreeing) → BLOCK via rule
2. Rule normal + ML high-confidence attack → BLOCK via ML
3. ML UNAVAILABLE — both with rule normal (→ ALLOW, fallback) and rule detecting (→ BLOCK still fires)
4. Both NORMAL → ALLOW
5. Rule/ML disagreement — rule fires while ML disagrees (reports NORMAL) → rule still wins
6. ML confidence threshold — below threshold → ALLOW, exactly at threshold (`>=`) → BLOCK, and a configured (non-default) threshold value is honored

**Pipeline wiring** (`waf.service.ts`): after the existing parallel rule+ML detection, `WafService` now calls `decisionEngine.decide(...)`. On `BLOCK` it returns a `403 Forbidden` JSON body directly — `protectedApiClient.forward()` is **never called**, so a blocked request genuinely never reaches Protected API. On `ALLOW` it forwards exactly as before (Phase 3-6 behavior unchanged). `DecisionModule` now provides/exports `HybridDecisionEngine`; `WafModule` imports it.

**Tests:** `hybrid-decision.engine.spec.ts` (10, new) + `waf.service.spec.ts` (rewritten: ALLOW forwards, rule-detected attack now asserts 403 **and** that `protectedApiClient.forward` was never called, ML-unavailable+rule-normal still forwards) — backend unit suite 54/54 across 9 suites. `waf-proxy.e2e-spec.ts` gained a 4th case (SQLi payload → 403, Protected API's fake server never hit) — 4/4 in that suite. (The two DB-backed e2e suites, `app.e2e-spec.ts`/`database.e2e-spec.ts`, require a live Postgres per the known/accepted Prisma eager-connection behavior and weren't exercised standalone here beyond the full live run below, which did have a real DB up.)

**Manual live verification** (all three services + a throwaway Postgres, readiness-polled one at a time, same pattern as Phase 6):
- Benign (`id=1`) → rule `NORMAL`, ML `SQL_INJECTION` at **0.60 confidence** (below the 0.7 threshold) → **ALLOW**, reason correctly names the sub-threshold ML flag. This is a genuine, honest finding: the model has some false-positive pull on plain benign input, caught here specifically *because* the confidence gate exists — worth keeping in mind for Phase 11's evaluation writeup, not something to paper over.
- SQLi (`1 OR 1=1`) → rule `SQL_INJECTION`, ML `SQL_INJECTION` (0.74) → **BLOCK 403**, Protected API never hit.
- XSS (`<script>alert(1)</script>`) → rule `XSS`, ML `XSS` (0.90) → **BLOCK 403**.
- Two rule-evading SQLi-shaped payloads (`' OR SUBSTRING(...)='a`, `(SELECT password FROM users WHERE id=1)`) were tried specifically to probe the ML-only-BLOCK branch live; both scored 0.54 ML confidence — below threshold, ALLOWed. The dataset's SQLi templates (Phase 6) all happen to also trip one of the 7 rule patterns (tautology, UNION, comment, sleep/benchmark/waitfor, xp_cmdshell), so a natural rule-blind-but-ML-confident example didn't surface in this session's ad hoc probing — the ML-only-BLOCK branch is proven correct by the unit tests (scenario 2 above) rather than by a live example this time. Documenting this rather than manufacturing a live case, consistent with the "don't oversell" framing from Phase 5/6.
- ML-unavailable fallback verified by killing `ml-service` mid-session: benign request still **ALLOW** (`"rule: normal; ml: unavailable"`), SQLi request still **BLOCK 403** via the rule engine alone — confirms ADR-2's fallback guarantee end-to-end, not just in mocks.

**Cleanup:** backend/protected-api/ml-service processes killed, throwaway Postgres container removed, no `.env` files left, nothing committed.

**User's approval note on Phase 7** (kept verbatim in substance, since it sets expectations for Phase 11): the user explicitly approved Phase 7 despite the live session not producing a natural ML-only-BLOCK example above the confidence threshold (both rule-evading probes scored 0.54) — they were satisfied because the policy was unit-tested in isolation (all 6 scenarios), the threshold boundary was tested, rule+ML agreement was live-tested, the ML-unavailable fallback was live-tested, and BLOCK-never-reaches-Protected-API was e2e-tested. They explicitly asked that Phase 11 (Evaluation) build a dedicated harness proving Rule-only, ML-only, and Hybrid detection separately, compared on the same evaluation set with Accuracy/Precision/Recall/F1, per the SRS's required comparison table/chart.

## Phase 8 detail

**Scope discipline (explicit user instruction for this phase):** strictly Security Logging only — create a `SecurityEvent` only for BLOCK (ADR-3), store only redacted request metadata (ADR-4), no Admin APIs/Dashboard/statistics yet, verify a blocked request is logged without reaching Protected API, and explicitly test DB failure behavior without weakening the BLOCK decision.

**`SecurityEventLogger`** (`backend/src/modules/security-events/security-event-logger.service.ts`): `logBlock(request, ruleResult, mlResult, decision): Promise<void>`, called from `WafService` only on the `BLOCK` branch. Maps directly onto the `SecurityEvent` Prisma model already in place since Phase 2 — no schema change needed this phase:
- `attackType` = `decision.classification`, `decision` = `decision.action` (always `'BLOCK'` by construction, matching the architecture note).
- `confidence` = `mlResult.confidence` when `mlResult.status === 'AVAILABLE'`, else `null` — never fabricated.
- `ruleResult` / `mlResult` stored as-is (whatever they were at decision time), per `docs/architecture.md` §10.
- `requestMeta` is a **redacted subset only** — `{ endpoint, queryParams, pathParams }` — deliberately excludes the raw body and full headers (ADR-4), even though `NormalizedRequest` carries both.
- **Never throws.** A repository failure is caught, logged as an `ERROR`-level operational log line, and swallowed — the method still resolves. This is the deliberate mechanism behind "DB outage must not weaken the BLOCK decision": the decision was already made by `HybridDecisionEngine` before logging is attempted, and a failed write must not turn a 403 into a 500 or (worse) an ALLOW.

**Pipeline wiring** (`waf.service.ts`): on `BLOCK`, `WafService` now `await`s `securityEventLogger.logBlock(...)` before returning the 403 — ensuring the log attempt happens (or fails safely) before the response goes out, not fire-and-forget. `ALLOW` never calls it. `SecurityEventsModule` now exports `SecurityEventLogger` (in addition to the existing `SecurityEventRepository`); `WafModule` imports `SecurityEventsModule`.

**Tests:**
- `security-event-logger.service.spec.ts` (new, 4 tests): correct field mapping for a rule-caused BLOCK, confidence populated from an AVAILABLE ML result, `requestMeta` proven to contain only `endpoint`/`queryParams`/`pathParams` (no `body`, no `headers`), and — the explicit DB-failure requirement — `logBlock` resolves without throwing when the repository's `create()` rejects.
- `waf.service.spec.ts` (updated, 4 tests total): ALLOW never calls `logBlock`; a rule-detected attack returns 403, calls `logBlock` exactly once, and the repository `create` call is asserted with the right `attackType`/`decision`; ML-unavailable+rule-normal still forwards without logging; and a new case wires a *real* `SecurityEventLogger` to a repository whose `create()` rejects, proving `WafService` itself still returns 403 and never calls `protectedApiClient.forward` even when persistence fails.
- `waf-proxy.e2e-spec.ts` (updated, 5 e2e cases): `PrismaService` is overridden with a fake in the test module (`.overrideProvider(PrismaService).useValue(...)`) so this suite still needs no live Postgres, now that `WafModule` transitively depends on `DatabaseModule` via `SecurityEventsModule`. New cases: BLOCK logs exactly once with the right `attackType`/`decision` in the `data` payload passed to `prisma.securityEvent.create`; and BLOCK still returns 403 when the fake `create()` rejects.
- Full results: backend unit **59/59** across 10 suites; `waf-proxy` e2e **5/5**.

**Manual live verification** (all three services + a throwaway Postgres, same readiness-polling pattern as prior phases):
- Sent one benign, one SQLi, one XSS request. Queried `security_events` directly via `psql`: **exactly 2 rows** (the two BLOCKs) — the benign ALLOW was correctly not persisted. Both rows had the expected `attackType`/`decision`/`confidence`, and `requestMeta` contained only `endpoint`/`pathParams`/`queryParams` — no `body`, no `headers`, confirming the redaction live, not just in unit tests.
- **DB-failure live test:** stopped the throwaway Postgres container mid-session, then re-sent the SQLi request — still got **403 Forbidden** (identical body to the DB-up case), and a benign request still got **200**. Backend log showed `ERROR [SecurityEventLogger] Failed to persist SecurityEvent for a BLOCK decision (request was still blocked): ... Can't reach database server ...` — the failure was visible operationally but never changed the client-facing decision.

**Cleanup:** backend/protected-api/ml-service processes killed, throwaway Postgres container removed, no `.env` files left, nothing committed.

## Phase 9 detail

**Scope discipline (explicit user instruction for this phase):** strictly Admin Authentication + Admin API — JWT per approved ADR-5, protect `/admin/*` with a guard, no Dashboard UI, no attack-statistics endpoint, no unrelated features; logout stays stateless/client-side (no logout endpoint at all — see below); authentication/authorization tests required before considering the phase done.

**`AuthService`** (`auth.service.ts`): `login(username, password)` looks up the `Admin` row, compares the password with `bcryptjs`, and on success signs a JWT (`{ sub, username }`) via `@nestjs/jwt`'s `JwtService`. On a wrong password *or* an unknown username, the same `401 Invalid username or password` is thrown — and a dummy bcrypt hash is compared against even when no admin row was found, so a login attempt against a nonexistent username takes the same time as one against a real username with a wrong password (prevents username enumeration via response timing). A repository failure (DB down) is caught and rethrown as `503 Service Unavailable`, per `docs/architecture.md` §16's documented failure-handling table.

**`JwtAuthGuard`** (`jwt-auth.guard.ts`): a plain `CanActivate`, not a Passport strategy — reads `Authorization: Bearer <token>`, verifies via `JwtService.verifyAsync`, attaches the decoded payload to the request, throws `401` on anything missing/malformed/invalid/expired. Deliberately lighter-weight than Passport since this is a single-admin-role MVP with one verification rule.

**No logout endpoint.** Per ADR-5, logout is a client-side token discard only — there is nothing server-side to revoke (no blacklist/session store), so a logout route would have nothing meaningful to do. This is a deliberate omission, not an oversight.

**Admin API** (`admin.controller.ts` / `admin.service.ts`): `GET /admin/events` (paginated, filterable by `attackType` and `from`/`to` date range) and `GET /admin/events/:id`, both behind `JwtAuthGuard`. `SecurityEventRepository.findMany` was extended from a bare list to `{ page, pageSize, attackType?, from?, to? } → { items, total }`; a DB failure on either endpoint is caught and rethrown as `503`, an unknown id on the detail route is `404`. No `/admin/stats` — explicitly out of scope per the user's instruction, deferred to whichever phase the SRS's stats/dashboard work actually lands in.

**Admin provisioning:** no HTTP registration endpoint — an open way to create Admin accounts would be a real vulnerability in a single-admin-role system. Instead, `backend/scripts/seed-admin.ts` (run via `npm run seed:admin`) upserts one `Admin` row from `ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars (documented in `.env.example` as seed-only, never read by the running app itself), hashing the password with `bcryptjs`.

**A real bug found and fixed live, not by inspection:** `POST /auth/login` returned `404 Cannot POST /auth/login` the first time it was exercised end-to-end. Root cause: `WafController`'s catch-all `@All('*')` route was registered (via `WafModule` in `AppModule`'s `imports` array) *before* `AuthModule`/`AdminModule`, and Nest/Express resolve overlapping routes in registration order — first match wins, and the WAF's handler never calls `next()`. The wildcard was silently swallowing `/auth/login` and would have done the same to `/admin/*`. `/health` had coincidentally survived since Phase 3 only because it's declared directly on the root `AppController`, which registers before any imported module's controllers regardless of import order — that coincidence is exactly why this went unnoticed until Phase 9 added the first *other* real routes. **Fixed** by reordering `AppModule`'s `imports` array to put `AuthModule`/`AdminModule` before `WafModule`, with a comment on the module explaining why the order is load-bearing. **Guarded against regressing silently** by a new `test/app-route-precedence.e2e-spec.ts` that boots the *real, fully-wired* `AppModule` (the other e2e suites each test one feature module in isolation and would never have caught a cross-module ordering bug) and asserts `/auth/login` and `/admin/events` are reachable while non-admin paths still go through the WAF proxy.

**Tests:**
- Unit (25 new, backend total **84/84** across 15 suites): `auth.service.spec.ts` (4 — success, wrong password, unknown username, DB failure → 503), `jwt-auth.guard.spec.ts` (4 — no header, malformed header, invalid/expired token, valid token attaches payload), `auth.controller.spec.ts` (5 — body validation), `admin.service.spec.ts` (5 — list, get, 404, both failure→503 paths), `admin.controller.spec.ts` (7 — query-param parsing: defaults, full parse, pageSize cap, invalid page/attackType/date).
- e2e: new `admin-auth.e2e-spec.ts` (13 cases — login success/wrong-password/unknown-user/missing-fields/DB-down, and the full authentication gate: no header / malformed header / garbage token / valid token / DB-down-with-valid-token, for both `/admin/events` and `/admin/events/:id`, plus 404 for an unknown id) and new `app-route-precedence.e2e-spec.ts` (3 cases, described above). `waf-proxy.e2e-spec.ts` unaffected (5/5).
- All DB interaction in e2e is against a fake `PrismaService` (`.overrideProvider`), consistent with the pattern established in Phase 8 — no live Postgres needed for these suites.

**Manual live verification** (all three services + a throwaway Postgres + seeded admin):
- `npm run seed:admin` created the admin row; `POST /auth/login` with correct credentials → `200` + a real JWT (confirmed the route-precedence fix worked end-to-end, not just under the test double).
- Wrong password → `401`; `GET /admin/events` with no token → `401`; with a garbage token → `401`; with the real token → `200 {"items":[],"total":0}`.
- Sent a live SQLi request through the WAF (`?id=1 OR 1=1`) → `403` as expected (Phase 7/8 behavior unchanged) → `GET /admin/events` with the token now showed **exactly that event**, full `ruleResult`/`mlResult`/`confidence`/`requestMeta` intact; `GET /admin/events/:id` returned it directly; an unknown id returned `404`; `?attackType=XSS` correctly returned an empty list (the one event was SQL_INJECTION).
- Confirmed `GET /api/hello` (a non-admin path) still round-trips through the WAF to Protected API — the reordered imports didn't disturb the WAF's own catch-all for everything else.
- **DB-down live test:** stopped the throwaway Postgres — `POST /auth/login` → `503`, `GET /admin/events` with an already-issued (still cryptographically valid) token → `503`, and — critically — sending the SQLi payload through the WAF *still* returned `403` (the BLOCK decision and its logging-failure-is-swallowed behavior from Phase 8 are completely independent of the Admin API's own DB error handling).

**Cleanup:** backend/protected-api/ml-service processes killed, throwaway Postgres container removed, no `.env` files left, nothing committed.

## Phase 9A detail

**Why this phase exists:** the SRS's Dashboard needs "Total Requests" and "Allowed Requests," which `SecurityEvent` (BLOCK-only, ADR-3) cannot supply — `COUNT(security_events)` would only ever show blocked traffic, misrepresented as a total. The user explicitly required a small, separate architecture-adjustment phase — designed and approved *before* implementation — rather than letting Claude quietly bolt this onto Phase 10.

**Approval process (explicit user instruction):** a plan-only turn was run first (via plan mode) proposing the `TrafficMetric` design; the user approved it **with one required change** — the original proposal had the metrics write `await`ed inline (like `SecurityEventLogger`), and the user correctly pushed back that this would add a DB round-trip's latency to *every* request including the high-volume ALLOW path, for a statistic the Dashboard can tolerate being slightly delayed. The approved, implemented design is fire-and-forget instead. This distinction (await-and-swallow vs. fire-and-forget-with-`.catch()`) is the single most important design decision in this phase — see below.

**`TrafficMetric` model** (`prisma/schema.prisma`, migration `20260826080630_add_traffic_metrics`): `bucketStart` (unique, hour-truncated UTC timestamp), `totalRequests`, `allowedRequests`, `blockedRequests`, `sqlInjectionBlocks`, `xssBlocks`. No FK, no retention policy — same rationale as `SecurityEvent`.

**New `traffic-metrics/` module** (`backend/src/modules/traffic-metrics/`), kept deliberately separate from `security-events/` — forensic BLOCK-only logging and aggregate ALLOW+BLOCK counting are two different concerns, consistent with the "don't let `WafService` become a God Service" direction from Phase 3:
- `bucket.util.ts`: pure `truncateToHour(date): Date` — zeroes minutes/seconds/ms in UTC.
- `TrafficMetricRepository.incrementBucket(bucketStart, counts)`: a single atomic `INSERT ... ON CONFLICT ("bucketStart") DO UPDATE SET col = col + n` via `$executeRaw` — **not** Prisma's `.upsert()`, which is two round-trips (try create, catch unique violation, update) and is not safe against concurrent requests landing in the same hour bucket at once.
- `TrafficMetricsRecorder.record(decision: DecisionResult): Promise<void>` — derives all five counters from `action`/`classification` alone (no raw request data touched). **Deliberately does not catch its own errors** — it propagates them. This is the load-bearing design choice from the approved plan: the failure-handling responsibility lives at the one call site that matters (`WafService`), not buried inside the recorder, so it's visible and auditable in one place.

**`WafService` wiring — the required non-blocking change:**
```typescript
this.trafficMetricsRecorder.record(decision).catch((error) => {
  this.logger.error(`Failed to record traffic metrics: ${...}`);
});
// immediately continues to BLOCK (await securityEventLogger.logBlock, unchanged from Phase 8) or ALLOW (forward)
```
Never `await`ed before the ALLOW/BLOCK response; the `.catch()` is unconditional so there is never an unhandled rejection. `SecurityEventLogger`'s own behavior (Phase 8 — still awaited on BLOCK, still internally swallowing its own errors) is completely unchanged; the two are independent async operations with deliberately different failure-handling strategies.

**Tests:**
- Unit (20 new, backend total **95/95** across 17 suites): `bucket.util.spec.ts` (4), `traffic-metrics.recorder.spec.ts` (5 — including a test that a rejecting repository call *propagates* rather than being swallowed, proving the recorder doesn't hide the caller's responsibility), `waf.service.spec.ts` (+2 new: traffic-metrics rejection does not change the ALLOW or BLOCK response, and `Logger.prototype.error` is confirmed called after the fire-and-forgotten rejection settles — proving no silent failure and no unhandled rejection).
- e2e: `waf-proxy.e2e-spec.ts` extended with a `$executeRaw` mock — asserts it's called once per request (ALLOW and BLOCK), plus two new cases where it rejects and the response (200/403) is unaffected. `app-route-precedence.e2e-spec.ts`'s fake Prisma updated with `$executeRaw` for consistency (no functional change needed there). `admin-auth.e2e-spec.ts` unaffected (doesn't import `WafModule`).

**Manual live verification** (throwaway Postgres + all three services + seeded admin):
- Sent 3 ALLOW + 2 SQLi BLOCK + 1 XSS BLOCK (6 total) → queried `traffic_metrics` directly via `psql`: **exactly** `totalRequests=6, allowedRequests=3, blockedRequests=3, sqlInjectionBlocks=2, xssBlocks=1`. `security_events` still showed exactly 3 rows (the BLOCKs only) — ADR-3 unaffected.
- **Concurrency check:** fired 30 concurrent ALLOW requests (`curl ... & ... wait`) into the same hour bucket. Result: `totalRequests=36, allowedRequests=33` (6 previous + 30) — **zero lost updates**, confirming the atomic `ON CONFLICT DO UPDATE` is race-safe under real concurrent writers.
- **DB-down live test:** stopped Postgres, then timed both an ALLOW and a BLOCK request. ALLOW returned in **~0.1s** (completely unaffected by the dead metrics DB — proves the non-blocking design). BLOCK took **~4s** — but the backend log confirmed this latency comes entirely from the *pre-existing, unchanged* Phase 8 `await securityEventLogger.logBlock(...)` retrying its own now-broken Prisma connection, not from the new metrics call (which fired, failed, and logged in parallel, adding no observable extra delay). This is an honest, pre-existing Phase 8 characteristic (Prisma's connection-retry behavior on a dead DB) — not touched, since the user's instruction was explicitly to keep `SecurityEventLogger` behavior unchanged and implement only Phase 9A.

**Docs updated:** `docs/architecture.md` — new §8a (Traffic Metrics), §3.1 pipeline diagram annotated, §11's `GET /admin/stats` line updated from "not implemented this phase" to "not implemented yet, Phase 10, will read `TrafficMetric`", §12's ER diagram gained `TRAFFIC_METRIC`, new **ADR-7** in §19. `docs/CLAUDE.md` §17 roadmap: inserted "Phase 9A" between Phase 9 and Phase 10.

**Cleanup:** backend/protected-api/ml-service processes killed, throwaway Postgres container removed, no `.env` files left, nothing committed.

## Phase 10 detail

**Scope discipline (explicit user instruction for this phase):** `Admin Authentication → GET /admin/stats → TrafficMetric → Dashboard → Total Requests / Allowed Requests / Blocked Requests / SQL Injection / XSS / Attack Distribution / Recent Security Events` — nothing beyond that pipeline.

**Backend — `GET /admin/stats`:**
- `TrafficMetricRepository.getTotals()` (new): a single `prisma.trafficMetric.aggregate({ _sum: {...} })` over **all** rows — "Total Requests" means all-time, not a windowed count. `null` sums (a fresh DB with zero rows) are coalesced to `0`. `TrafficMetricsModule` now also exports `TrafficMetricRepository` (previously only `TrafficMetricsRecorder`) so `AdminModule` can inject it.
- `AdminService.getStats()` (new): same `ServiceUnavailableException`-on-failure pattern as `listEvents`/`getEvent`. `AdminController` gets a new `@Get('stats')` route under the same class-level `JwtAuthGuard` — no new guard wiring needed.
- **Deliberately not duplicated:** `/admin/stats` returns only the five `TrafficMetric` counters. "Recent Security Events" is served by the *existing* `GET /admin/events?page=1&pageSize=10` (already ordered `timestamp: 'desc'` since Phase 9, so page 1 is already "most recent") — the Dashboard makes two calls rather than `/admin/stats` growing a second, duplicate query path over `SecurityEvent`. "Attack Distribution" is derived client-side from `sqlInjectionBlocks`/`xssBlocks` — no extra field, no extra query.
- **CORS**: `backend/src/main.ts` now calls `app.enableCors({ origin: process.env.FRONTEND_URL })`, gated behind `FRONTEND_URL` being set at all (unset = no cross-origin access, never a wildcard) — the Dashboard is a browser app on a different origin/port and needs this to call the Admin API directly.

**Frontend — the Dashboard itself** (`frontend/src/`), the first real logic since Phase 1B's starter scaffold. No new dependencies — native `fetch`, Tailwind, no chart library (Attack Distribution is a plain two-bar comparison built from the two counters already in hand):
- `lib/auth.ts` — `getToken`/`setToken`/`clearToken` over `localStorage` (ADR-5: stateless, client-side only; there is no server session to join or revoke).
- `lib/api.ts` — typed `fetch` wrapper (`login`, `getStats`, `getRecentEvents`) against `NEXT_PUBLIC_ADMIN_API_URL`. Any authenticated GET clears the stored token on a `401` (missing/expired/invalid either way) so a dead token isn't retried.
- `app/login/page.tsx` — username/password → `lib/api.login()` → store token → redirect to `/dashboard`; shows the `401`/`503` message inline.
- `app/dashboard/page.tsx` — redirects to `/login` if no token; else fetches `/admin/stats` + `/admin/events?pageSize=10` in parallel and renders 5 stat tiles, `AttackDistribution`, and `RecentEventsTable`. A `401` from either call (token expired mid-session) redirects to `/login`; a `503` renders an inline "database unavailable" banner instead of crashing the page. Logout clears the token and redirects — no server call, per ADR-5.
- `app/page.tsx` (root) — replaces the `create-next-app` starter with a redirect to `/dashboard`, which itself redirects onward to `/login` when unauthenticated. Single entry point.

**Explicitly out of scope, flagged rather than silently decided:** no new frontend test framework (Vitest/RTL/Playwright) was introduced — `frontend` has had build+lint only since Phase 1B, and this phase's frontend verification is build+lint clean plus full live browser verification (below) rather than an automated frontend test suite. No time-range selector on the Dashboard (`/admin/stats` is all-time totals only). No Detection Evaluation page (Phase 11).

**Tests:**
- Unit (backend, 6 new, total **101/101** across 18 suites): `traffic-metric.repository.spec.ts` (new — `getTotals` sums correctly, coalesces `null` to `0`, propagates a repository failure), `admin.service.spec.ts` (+2 — `getStats` success and DB-failure→503), `admin.controller.spec.ts` (+1 — delegates to `getStats`).
- e2e (backend): `admin-auth.e2e-spec.ts` extended with a `GET /admin/stats` describe block — `401` with no token, correct aggregated numbers with a valid token against the fake Prisma, `503` when the fake `trafficMetric.aggregate` rejects. Full e2e run: the 3 DB-independent suites (`waf-proxy`, `admin-auth`, `app-route-precedence`) **26/26**; `app.e2e-spec.ts`/`database.e2e-spec.ts` still require a live Postgres (pre-existing, unchanged Prisma eager-connection behavior, not exercised standalone here beyond the live run below, which did have a real DB).
- Frontend: `npm run build` and `npm run lint` both clean (no test framework, per the scope note above).

**Live verification** (throwaway Postgres + all three backend services + seeded admin + the frontend running as a real `next start` production server, since no browser-automation tool existed in this environment before this phase — installed Playwright + Chromium into the session's scratchpad on demand, not added to the repo, to actually drive a headless browser rather than only curl the API):
- Sent 3 ALLOW + 2 SQLi BLOCK + 1 XSS BLOCK through the WAF. `psql` on `traffic_metrics` showed exactly `totalRequests=6, allowedRequests=3, blockedRequests=3, sqlInjectionBlocks=2, xssBlocks=1`; `security_events` showed exactly the 3 BLOCK rows. `curl`ing `/admin/stats` and `/admin/events` with a real JWT matched those numbers exactly.
- **Real browser, logged in as the seeded admin:** the Dashboard rendered all 5 stat tiles, the Attack Distribution bars (SQL Injection 2/67%, XSS 1/33%), and a Recent Security Events table listing exactly the 3 BLOCK rows (XSS 0.90, SQL_INJECTION 0.66, SQL_INJECTION 0.74) — an exact match to the numbers above, confirmed both by a DOM text dump and a visual screenshot. No browser console errors.
- Logout → redirected to `/login`, token cleared. A fresh browser context visiting `/dashboard` directly with no token → redirected to `/login`. A browser context with a garbage token in `localStorage` visiting `/dashboard` → the API call correctly `401`'d, the token was cleared, and it redirected to `/login` (proving the "clear-on-401" path, not just the "no-token" path).
- **DB-down live test:** stopped Postgres, reloaded `/dashboard` with a still-valid (JWT signature verification is stateless, so this doesn't need the DB) token → the inline "The database is unavailable right now..." banner rendered instead of a crash, confirmed visually.

**Cleanup:** backend/protected-api/ml-service/frontend processes killed, throwaway Postgres container removed, ml-service's temporary `.venv` removed, no `.env` files left, nothing committed. The scratchpad Playwright install was local to the session's temp directory, not added to `frontend/package.json` or any repo file.

## Phase 11 detail

**Scope discipline (explicit user instruction for this phase):** exactly the harness approved in the Phase 7 approval note — Rule-only vs ML-only vs Hybrid, same evaluation set, Accuracy/Precision/Recall/F1 — nothing else. No new detection logic, no retraining, no Dashboard/`architecture.md` changes (the "Detection Evaluation" Dashboard page listed in `docs/architecture.md` §11's original Dashboard scope was deliberately **not** built here — it would be a UI addition beyond "build a comparison harness," and the user explicitly said not to expand scope).

**Design principle:** the three "methods" are not re-implementations — the harness calls the actual `RuleDetectionEngine`, `MLDetectionEngine`, and `HybridDecisionEngine` (the exact classes running in the live WAF pipeline), so the comparison reflects real production behavior rather than a second, divergence-prone copy of the detection/decision logic.

**Evaluation set:** Phase 6's exact held-out test split (64 rows, 25 groups, group-disjoint — the same rows `ml-service/model/metrics.json` already reports the ML model's own numbers on), not the full 225-row dataset — the model trained on the other 161 rows, so including them would let ML/Hybrid "cheat" on memorized data. Reproducing scikit-learn's `GroupShuffleSplit` output isn't something to re-derive in TypeScript, so the split happens once in Python and is handed to the TypeScript step as a plain JSON fixture.

**Three-step pipeline** (`ml-service/evaluation/` + one `backend/scripts/` file — no edits to `training/train.py`, the detection/decision engines, or the trained model):
1. `ml-service/evaluation/export_test_set.py` — imports `training.train`'s `load_dataset()`/`RANDOM_STATE`/`TEST_SIZE` directly (reused, not duplicated) and re-runs the identical `GroupShuffleSplit`, writing `test_set.json` ({text,label} × 64). Asserts its row/group counts match `model/metrics.json`'s `test_size`/`test_groups` — a drift here would mean evaluating on a silently different set than Phase 6 reported on.
2. `backend/scripts/evaluate-detection.ts` (new; `npm run evaluate`, same standalone-script pattern as `scripts/seed-admin.ts` — no Nest app bootstrap) — wraps each `text` into a synthetic `NormalizedRequest` (payload as a query-param value, matching how both search-surface builders already expect to find it), and runs the three real engines in-process: `RuleDetectionEngine.detect()` (sync), `MLDetectionEngine.detect()` (real HTTP call to a live `ml-service`), `HybridDecisionEngine.decide()` (sync, using both prior results — exactly as `WafService` does). Preflight-checks `ml-service`'s `/health`; aborts loudly if any row's ML call comes back `UNAVAILABLE` rather than silently hole the numbers. Writes `predictions.json` (64 rows: `text, label, rulePrediction, mlPrediction, mlConfidence, hybridPrediction, hybridReason`).
3. `ml-service/evaluation/compute_metrics.py` — computes `accuracy_score`/`classification_report`/`confusion_matrix` per method via the same `sklearn.metrics` functions `training/train.py` already uses (methodological consistency with Phase 6's own reported numbers), with the label order fixed from the ground-truth column so all three reports share one row/column order. Writes `comparison_metrics.json` (machine-readable) and `comparison_report.md` (the human-readable SRS comparison table).

Only `ml-service` needs to be running to execute this — no Postgres, no backend server, no `protected-api` — since the harness calls the detection/decision classes directly rather than going through the WAF's own HTTP layer.

**Live run and result, reported honestly:** all 64 held-out rows produced complete predictions (no `UNAVAILABLE` holes). All three methods — Rule-only, ML-only, and Hybrid — scored **100% accuracy/precision/recall/F1 (macro and per-class)** on this split, with the "rows where rule and ML predictions differ from each other" check coming back empty. This is a real result, not a fabricated one, but it should be read for what it is: this held-out set is drawn from the same clean, lexically-separable synthetic corpus documented in Phase 6 ("not evidence of real-world generalization to obfuscated payloads or genuinely ambiguous traffic") — so the harness demonstrates that the comparison methodology works correctly and is genuinely being exercised (real per-row confidences from 0.52 to 0.90 were observed, real rule-match reasons, real hybrid decision reasons), more than it demonstrates a dramatic difference between the three approaches on this particular dataset. That framing (methodology-sound, not a strong differentiator on this corpus) should carry into the SRS write-up rather than presenting the 100%-across-the-board result as proof the three methods are interchangeable in general.

**Verification:** `test_set.json` had exactly 64 rows / 25 groups (assertion against `model/metrics.json` passed); `predictions.json` had 64 complete rows; spot-checked sample rows and confidence values by hand; `cd backend && npm run build && npm run lint` both clean (the new script also passed a full `tsc --noEmit` project check — `scripts/` isn't in the lint glob, same as the pre-existing `seed-admin.ts`, so this was checked directly rather than assumed).

**Cleanup:** `ml-service` process killed, its temporary `.venv` removed, no `.env` files left, nothing committed. `ml-service/evaluation/test_set.json`, `predictions.json`, `comparison_metrics.json`, and `comparison_report.md` were left in place (not deleted) as the phase's actual deliverable artifacts, the same way Phase 6 kept `model/metrics.json` — regenerable by re-running the three commands above, but worth keeping for the SRS write-up and for review.

## Dashboard UI Redesign detail

**Scope discipline (explicit user instruction for this task):** make the Dashboard UI "giống và đẹp y hệt 100%" (100% identical) to a reference screenshot, planning and implementing any missing feature/data needed to get there. Two decisions were confirmed with the user before implementation: (1) country-by-IP uses `geoip-lite` (offline, local lookup, no external network call) rather than skipping country data or calling a third-party API; (2) only "Tổng quan" (Overview) becomes a fully real page — the other 5 sidebar destinations render as real routes with a shared "Sắp ra mắt" placeholder, rather than inventing functionality the reference image didn't show.

**Backend — 6 new/extended `/admin/*` routes**, all under the existing `JwtAuthGuard`, no Prisma schema change (see `docs/architecture.md` §11 for the full route table):
- `GET /admin/stats` gained an optional `?days=N` (1–90) — omitted behaves byte-identically to before (regression-tested); given, restricts the `TrafficMetric` aggregate to a `bucketStart` range via a new `common/date-range.util.ts#daysToRange`.
- `GET /admin/stats/trend?days=N` (default 7) — daily-bucketed totals for the Request Trend chart. Summed in application code (`traffic-metrics/trend.util.ts#groupBucketsByDay`), not a `date_trunc` SQL query — at most `days*24` rows even at the cap, and it keeps the zero-fill-missing-days logic as an independently unit-testable pure function. Every day in range appears even with zero traffic (continuous line, no gaps).
- `GET /admin/stats/extra?days=N` — `{maliciousIpCount, countryCount, requestsThisHour}`. `maliciousIpCount` is `SecurityEventRepository.findDistinctSourceIps()`'s length (every row is already an attacker per ADR-3's BLOCK-only logging); `countryCount` is distinct non-null `geoip-lite` country codes over those same IPs; `requestsThisHour` is the current UTC hour's `TrafficMetric.totalRequests` (new `getCurrentHourTotal()`, reusing `bucket.util.ts#truncateToHour`) — "current throughput," not a range average. Kept as a sibling of `/admin/stats` rather than growing its response shape, preserving that endpoint's "`TrafficMetric`-only" contract.
- `GET /admin/system-status` — `{wafEngine:'up', mlService, database, protectedApi}`, each `'up'`/`'down'`. New `SystemStatusService` pings `ml-service`/`protected-api`'s existing `/health` endpoints (via `ML_SERVICE_URL`/`PROTECTED_API_URL`, reusing `MLDetectionEngine`'s `AbortController`+timeout pattern, factored into `admin/health-ping.util.ts`) and runs a trivial `SELECT 1` for the DB. **Deliberately never 503s** — "down" is itself a valid `200` answer, a documented deviation from `AdminService`'s usual try/catch-to-503 wrapping; `AdminController` calls `SystemStatusService` directly.
- `GET /admin/system-info` — `{version, environment, uptimeSeconds, serverTime}` from `backend/package.json`'s version, `NODE_ENV`, and `process.uptime()` (a plain function, `admin/system-info.ts`, no DI needed).
- `GET /admin/me` — `{username}` decoded from the guard's already-verified JWT payload — zero new DB read, stays stateless per ADR-5.
- **GeoIP enrichment**: `GET /admin/events`/`GET /admin/events/:id` now return `country`/`countryCode` per row, resolved server-side in `AdminService` (new `admin/geo-lookup.util.ts#lookupCountry`, using `geoip-lite` + `Intl.DisplayNames`) — offline, no external call, no new PII stored (enriches the already-unredacted `sourceIp`, ADR-4 only redacts `requestMeta`). Private/reserved/dev IPs resolve to `null` fields, not an error — confirmed live against the actual dev Docker network's internal gateway IP.

New backend dependency: `geoip-lite` + `@types/geoip-lite`.

**A real TS1272 build error was found and fixed**: `isolatedModules` + `emitDecoratorMetadata` rejects a decorated method (e.g. `@Get(...)`) whose return type comes from an import statement that also imports a *value* from the same module (e.g. `import { SystemInfo, buildSystemInfo } from './system-info'` — mixing the type-only `SystemInfo` with the real function `buildSystemInfo`). Fixed by splitting every such mixed import into a separate `import type {...}` + `import {...}` pair (`admin.controller.ts`, for `system-info.ts`/`system-status.service.ts`/`admin.service.ts`'s exports).

**Frontend** (`frontend/`) — new dependencies `recharts` (charts) and `lucide-react` (icons); still no state-management/data-fetching library:
- New `app/(dashboard)/layout.tsx` route group: Header + Sidebar + Footer chrome, the "no token" auth guard (moved here from the old `app/dashboard/page.tsx`, no longer duplicated per-page), and a one-time `GET /admin/me` fetch for the header's username. The old `app/dashboard/page.tsx` moved to `app/(dashboard)/dashboard/page.tsx` (URL unchanged); 5 new thin pages (`/events`, `/statistics`, `/reports`, `/system`, `/settings`) render a shared `ComingSoonPage` — real routes, not 404s, but intentionally not built out further.
- Overview page: 5 redesigned `StatCard`s (icon + color + percentage pill), a `RequestTrendChart` (recharts line chart, 3 series) and `AttackDistributionChart` (recharts donut with a center total + manual legend, **replacing** the old two-bar `AttackDistribution.tsx`, deleted), a redesigned `RecentEventsTable` (IP+flag+country column via a pure Unicode flag-emoji helper — no library needed — confidence progress bar, attack-type/method/decision badges, an `EventDetailModal` fed from the already-fetched row, no second request), and 4 new summary panels (`SystemStatusPanel`, `SystemInfoPanel`, `QuickStatsPanel`, `RecentActivityPanel`). A `DateRangeSelector` (native `<select>`, 7/14/30 days) drives `?days=` on the three range-aware endpoints; a refresh button re-triggers the same load.
- New shared primitives: `Card`, `InfoRow`, `PageHeader` — factoring out card styling that used to be copy-pasted per component.

**A real ESLint error was found and fixed** (`react-hooks/set-state-in-effect`, part of this project's already-installed `eslint-plugin-react-hooks` — not introduced by this task, just newly triggered by patterns this task added): a synchronous `setState()` call as the first statement in an effect body (`Header.tsx`'s clock, `layout.tsx`'s auth-guard-derived `ready` state) and an effect that merely invokes a `useCallback`-memoized async fetcher (`dashboard/page.tsx`'s original `load` design) are both flagged. Fixed by (1) deferring `Header.tsx`'s first clock tick via `setTimeout(fn, 0)` instead of calling it synchronously before `setInterval`; (2) removing `layout.tsx`'s separate `ready` state entirely — the redirect itself (not a state setter) is enough, and `dashboard/page.tsx`'s own data-fetch effect independently self-redirects on a missing token anyway; (3) reverting `dashboard/page.tsx` to the pre-existing nested-function-in-effect idiom (matching Phase 10's original `dashboard/page.tsx`) with a `refreshKey` state added to the dependency array so the header's refresh button can re-trigger the same effect, rather than hoisting the loader out via `useCallback` and calling it from both an effect and a click handler.

**Tests:**
- Backend unit (full suite: **144/144** across 25 suites, up from 101/18): new spec files for every new util (`date-range.util.spec.ts`, `trend.util.spec.ts`, `geo-lookup.util.spec.ts`, `health-ping.util.spec.ts`, `system-info.spec.ts`, `system-status.service.spec.ts`) and the first-ever `security-event.repository.spec.ts`; extended `traffic-metric.repository.spec.ts` (range-omitted-is-unchanged regression, `getDailyTrend`, `getCurrentHourTotal`), `admin.service.spec.ts`, `admin.controller.spec.ts`.
- Backend e2e (full suite: **46/46** across 5 suites): `admin-auth.e2e-spec.ts` extended with 401/200/edge-case coverage for `stats?days=`, `stats/trend`, `stats/extra`, `system-status` (incl. a DB-down-still-200 case), `system-info`, `me`; existing `events`/`events/:id` cases extended to assert `country`/`countryCode` fields are present (null, for the fixture's documentation-range IP).
- `cd backend && npm run build && npm run lint && npm test && npm run test:e2e` clean; `cd frontend && npm run build && npm run lint` clean.

**Live verification** (the existing local Docker Compose stack — already running from prior manual testing — rebuilt for `backend` then `frontend`, real Postgres/ml-service/protected-api):
- Sent a real ALLOW/SQLi/XSS mix through the WAF; `curl`'d every new endpoint with a real JWT — response shapes matched exactly what the frontend types expect (confirmed `country`/`countryCode` correctly `null` for the dev Docker network's internal gateway source IP, and correctly resolved for real public IPs in isolated `geoip-lite` testing: `8.8.8.8`→US, `1.0.0.1`→AU).
- **Real browser (Playwright), full flow**: login → Overview renders all 5 stat cards, both charts, the enriched events table, and all 4 bottom panels with numbers matching the seeded data exactly; opened and closed the event detail modal; switched the date-range selector to 30 days and clicked refresh with no crash; clicked all 5 placeholder nav items and confirmed each renders "Sắp ra mắt" (not a 404); logged out and confirmed the redirect to `/login`. Zero console errors.
- **Dark mode** (Playwright `colorScheme: 'dark'` emulation, repeated runs): confirmed correct dark theming throughout (verified via `matchMedia`/computed-style checks and screenshots), zero console errors. One screenshot in an early combined run showed a visually broken donut chart (a `ResponsiveContainer` first-measurement race, not deterministic — 6 subsequent isolated re-runs across both themes all rendered it correctly) — noted here as an observed flake in headless-browser testing, not a code defect, since it did not reproduce.

**Cleanup:** `frontend/src/components/AttackDistribution.tsx` and the old `frontend/src/app/dashboard/page.tsx` deleted (moved/replaced, not left dangling). Nothing committed.

## Security Events Page detail

**Trigger:** the user pasted a second reference screenshot (the "Sự kiện bảo mật" list page: filter bar, filtered/paginated table, CSV export) and asked for the `/events` placeholder to be built out to match it — the first of the 5 Dashboard-UI-Redesign placeholder pages to graduate to real. Also asked why some source IPs showed no flag/country in the existing table.

**The "no flag" question — not a bug:** the IP shown (`::ffff:172.20.0.1`) is the IPv6-mapped form of `172.20.0.1`, the local Docker bridge network's gateway address — a private/reserved IP. No GeoIP database (including `geoip-lite`) can map a private address to a country, so `lookupCountry` correctly returns `null`/`null` there (same for `192.168.x.x`, `10.x.x.x`, documentation-range `203.0.113.x`/`198.51.100.x`, etc.). This was already-correct behavior from the Dashboard UI Redesign task, just visually silent (blank space) — fixed for clarity, not correctness, by adding an explicit "IP nội bộ / không xác định" label (`RecentEventsTable.tsx`, `EventDetailModal.tsx`) plus a `title` tooltip on the table cell, instead of leaving a blank gap that reads as broken.

**Backend — `GET /admin/events` gained 4 new optional query params** (`security-event.repository.ts`, `admin.controller.ts`; no schema change):
- `search` — case-insensitive `contains` match against `endpoint` OR `sourceIp` (Prisma `OR` + `mode: 'insensitive'`, Postgres). Deliberately **not** user-agent, despite the reference screenshot's placeholder text suggesting it — `requestMeta` never stores one (ADR-4 redaction excludes all headers), so there is nothing there to search; the frontend's placeholder text was written to match what's actually searchable instead of promising a field that doesn't exist.
- `method` — exact match (case-normalized to uppercase), no enum validation needed since the frontend drives it from a fixed dropdown (GET/POST/PUT/PATCH/DELETE) and an unmatched value just yields zero rows, not an error.
- `minConfidence` — `confidence >= N`, validated to `[0, 1]` (400 otherwise).
- `days` — sugar for `from`/`to` (reuses `common/date-range.util.ts#daysToRange`, same 1–90 bound as the Dashboard's other range-aware endpoints); wins over an explicit `from`/`to` if both given.

**Frontend** — new `events/page.tsx` (previously a `ComingSoonPage` stub) replaces the placeholder; reuses `RecentEventsTable` rather than a second table implementation:
- `RecentEventsTable` gained optional `title`/`headerRight`/`footer`/`emptyMessage` props (all defaulting to the Dashboard widget's existing behavior, so that usage is unchanged) — the Events page passes its own title, a "Xuất CSV" button, and a `Pagination` footer into the same table markup.
- New `EventsFilterBar.tsx` — search input, attack-type/method selects, min-confidence number input, and the existing `DateRangeSelector`, plus a refresh button.
- New `Pagination.tsx` — prev/next + a 5-button sliding window + a page-size select (10/20/50), computed from `total`/`pageSize`.
- New `lib/csv.ts` — client-side CSV generation (no backend export endpoint needed; every field a row needs is already in the fetched list), UTF-8 BOM-prefixed for correct Vietnamese-diacritic rendering in Excel, RFC 4180 quoting. "Xuất CSV" loops `GET /admin/events` (capped at `pageSize=100`) until every row matching the current filter is collected, bounded by a 5000-row hard cap.
- **Debounce without tripping `react-hooks/set-state-in-effect`:** the free-text search and min-confidence fields update an immediate `filter` state on every keystroke (for responsive UI), but only commit into a separate `appliedFilter` state — which actually drives fetching, and resets pagination back to page 1 — after a 300ms pause, via a `setTimeout` callback inside a `useEffect`. The `setState` calls happen inside that timeout callback, not synchronously in the effect body, matching the same deferred pattern the Dashboard UI Redesign task already established for `Header.tsx`'s clock — confirmed clean via `npm run lint` with no new suppressions.

**Tests:**
- Backend unit (full suite: **150/150** across 25 suites, up from 144/144): `security-event.repository.spec.ts` extended (method+minConfidence where-clause, search OR-clause); `admin.controller.spec.ts` extended (method/search/minConfidence parsing, minConfidence range validation, `days`→from/to resolution and its 90-day cap).
- Backend e2e (full suite: **49/49** across 5 suites, up from 46/46): `admin-auth.e2e-spec.ts` extended — a combined search+method+minConfidence+days request asserting the exact Prisma `where` clause built, plus 400 cases for an out-of-range `minConfidence` and a `days` above the cap.
- `cd backend && npm run build && npm run lint && npm test && npm run test:e2e` clean; `cd frontend && npm run build && npm run lint` clean.

**Live verification:** the Docker Compose stack wasn't up this time (only a standalone `hwaf-pg` Postgres container was running, pre-existing, left untouched); ran `backend`/`frontend` directly via `npm run start:dev` / `next dev -p 3002` (matching the backend's `FRONTEND_URL` CORS origin) instead of rebuilding images, against the same Postgres. Seeded 38 synthetic `security_events` rows (varied method/attackType/confidence/source IP — a mix of public IPs that resolve to real countries and private/reserved ones that don't) directly via SQL for volume, verified everything, then **deleted every seeded row and confirmed via `psql` that the 2 pre-existing real events were untouched** before stopping the dev servers, restoring the DB to its prior state.
- **Real browser (Playwright), full flow**: login → Events page → confirmed total count narrows correctly for `attackType=XSS`, `method=POST`, `search=/api/login`, and `minConfidence=0.8` filters (each checked against the exact expected count from the seeded data), and recovers to the full count when filters are cleared; paginated to page 2 with no crash; changed page size to 50; opened the detail modal from this page; exported CSV and verified the downloaded file has the correct header row, UTF-8 BOM, RFC 4180 quoting, and all 40 matching rows; confirmed the "IP nội bộ / không xác định" hint renders for every private/reserved-IP row. Zero console errors, light and dark mode both screenshotted.

**Cleanup:** all 38 seeded rows removed; local `backend`/`frontend` dev processes fully killed (including orphaned child processes — the first background-start attempt via a manually-backgrounded subshell silently detached without ever binding its port, so it was killed and restarted using the harness's own background-process tracking instead). Nothing committed.

**Follow-up fix — real flag icons:** the user found that on Windows, the Unicode regional-indicator flag "emoji" (`lib/flag.ts#countryCodeToFlagEmoji`, from the Dashboard UI Redesign task) rendered as plain two-letter text ("US", "AU") instead of an actual flag image — a real Windows/Segoe-UI-Emoji font limitation (macOS/iOS/Android render the same Unicode correctly), not a data bug. Fixed by replacing it with real SVG icons: new `country-flag-icons` dependency, new `CountryFlag.tsx` component (`FLAGS[countryCode]` dynamic lookup against the package's per-ISO-code named exports), wired into both `RecentEventsTable.tsx` and `EventDetailModal.tsx`; `lib/flag.ts` deleted (no longer used anywhere). Verified via a fresh Playwright screenshot showing real flag images for US/AU/NL rows. `npm run build && npm run lint` clean.

## In Progress

(none — awaiting review/next instruction)

## Next

- No further phase or task is currently approved. `docs/CLAUDE.md` §17's roadmap (Phase 0 through Phase 11), the Dashboard UI Redesign task, and the Security Events Page task are all complete; anything beyond this (building out the remaining 4 placeholder pages, a real domain/HTTPS/Nginx layer for local dev, Phase 12+ integration/deploy hardening, or anything else) needs its own explicit scoping and approval before any work starts, per the same workflow used for every phase/task so far.

## Architecture Decisions Log

Full detail and rationale in `docs/architecture.md` §19. Final status — all seven **Approved**:

- ADR-1: WAF (`backend`) and Protected API are separate NestJS processes — Approved
- ADR-2: ML failure is an explicit `UNAVAILABLE` result (classification/confidence `null`, never coerced to `NORMAL`); decision engine falls back to the rule engine; ML unavailability alone never creates a `SecurityEvent`; documented MVP trade-off is that the WAF does not fail closed when ML is down — Approved (clarified)
- ADR-3: SecurityEvent created only on BLOCK, not every request — Approved
- ADR-4: SecurityEvent stores redacted `requestMeta`, not raw body/full headers — Approved
- ADR-5: JWT admin auth, stateless, access tokens short-lived (~15–30 min), logout is client-side only and does not revoke an already-issued token, no Redis/session store added solely for logout — Approved (clarified)
- ADR-6: Four independent top-level services rather than a merged app — Approved
- ADR-7: Aggregate traffic counters (`TrafficMetric`, hourly UTC buckets) updated atomically per-request, fire-and-forget (never awaited, always `.catch()`-guarded) — a counter-write failure or delay can never affect the ALLOW/BLOCK decision — Approved

## Known Issues / Blockers

- Not a blocker, informational: this dev machine has a local PostgreSQL already bound to host port 5432, so `docker compose up` here needs that stopped first (or a local port override) — the committed `docker-compose.yml` maps `5432:5432`, which is correct for a clean machine. Same applies to running `prisma migrate dev`/`deploy` locally outside Docker.
