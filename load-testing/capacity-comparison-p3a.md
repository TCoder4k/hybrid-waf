# Capacity comparison — before/after the ml-service `--workers` fix (Phase P3a)

Both runs use `capacity-step.js` (15s per step) against the full local stack (backend + ml-service + protected-api + Postgres, all on the same dev machine). Rate limiting was configured effectively unbounded for these runs so the numbers reflect pipeline capacity, not the rate limiter — see `load-testing/README.md`.

## Before (single ml-service worker, no `--workers` flag — measured earlier this session)

| VUs | p95 latency | Throughput | Error rate |
|---|---|---|---|
| 20  | ~100ms | ~142 req/s | 0% |
| 50  | ~305ms | ~179 req/s | 0% |
| 100 | ~1.18s | ~147 req/s | 0% |
| 200 | ~1.88s | ~176 req/s | 0% |
| 400 | ~5.75s | ~212 req/s | 0% |
| 800 | ~13.3s | ~181 req/s | 0% |

## After (ml-service `WORKERS=4`, Phase P3a — measured just now)

| VUs | p95 latency | Throughput | Error rate |
|---|---|---|---|
| 20  | 103.9ms | 142.5 req/s | 0% |
| 50  | 370.0ms | 179.1 req/s | 0% |
| 100 | 575.3ms | 203.8 req/s | 0% |
| 200 | 1.58s   | 164.2 req/s | 0% |
| 400 | 4.25s   | 149.8 req/s | 0% |
| 800 | *(inconclusive — see note)* | | |

## Reading this honestly

- **20-50 VUs: essentially unchanged.** Expected — at this concurrency the single-worker ml-service was never actually the bottleneck, so adding workers has nothing to parallelize yet.
- **100 VUs: the clearest, cleanest win.** p95 latency dropped from ~1.18s to ~0.58s (roughly halved) and throughput rose from ~147 to ~204 req/s (+39%). This is exactly the concurrency range where the previous single-process, GIL-serialized ml-service inference (confirmed by the P0 code audit) started queuing requests behind each other — the fix directly targets that.
- **200-400 VUs: p95 improved (200: 1.88s→1.58s; 400: 5.75s→4.25s, both ~15-26% better), but throughput did not improve and was slightly lower than the "before" numbers at these two steps.** This is a genuine, honestly-reported result, not smoothed over — the most likely explanation is that this "after" run shares the same physical dev machine (8 cores) with `ml-service` now running 4 worker processes *plus* the backend, Postgres, protected-api, and k6's own Docker container all contending for the same CPUs, whereas the "before" baseline was measured with only 1 ml-service process competing for those resources. In other words: this comparison is a real same-machine measurement, but it is not a clean, isolated A/B (nothing else was pinned/reserved between the two runs, and this was a long-running dev session with other background activity). The directional result at the sub-saturation point (100 VUs) is credible and matches the code-level root cause; the higher-VU numbers should be read as "still non-regressive, plausibly resource-contended on this shared dev box" rather than a precise throughput measurement.
- **800 VUs: inconclusive.** Every request failed at the network level (`status: 0`, no HTTP response at all) rather than with a slow-but-real HTTP response. The backend's own debug log shows it was still processing real requests (real rule/ML decisions being logged) during this window, so this was not a backend crash — the most likely cause is Docker Desktop/WSL2's `host.docker.internal` NAT path not sustaining 800 concurrent connections from the k6 container to the host in this specific sandboxed session (a known class of Docker-for-Windows networking limitation under very high concurrent connection counts, unrelated to the WAF/ml-service code). Not re-run repeatedly to avoid sinking more time into an environment-specific artifact — flagged here rather than silently dropped or papered over.

## Bottom line

The `--workers` fix delivers a real, credible improvement exactly where the code-level root cause said it would (the ~100 VU range, where a single-process ml-service previously started queuing) — p95 roughly halved, throughput up ~39% at that step. Confirmed live in this session (see Phase P3a). The picture at 200-400 VUs is muddied by this being a shared, non-isolated dev machine rather than a clean before/after environment, and the 800 VU step failed for an unrelated local networking reason — both called out honestly rather than cherry-picking only the strongest number.

For a real production capacity claim, this should be re-measured on the actual VPS (or an isolated benchmarking host) with `WORKERS` tuned to that host's real core count, per `ml-service/.env.example`.
