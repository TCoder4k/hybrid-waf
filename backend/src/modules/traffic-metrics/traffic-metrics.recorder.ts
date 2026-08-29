import { Injectable } from '@nestjs/common';
import { DecisionResult } from '../../common/types';
import { truncateToHour } from './bucket.util';
import { TrafficMetricRepository } from './traffic-metric.repository';

// Aggregate request counters only (Phase 9A) — separate from
// SecurityEventLogger (Phase 8, BLOCK-only forensic detail). Derives
// everything from the DecisionResult alone; never reads or stores raw
// request data.
//
// Deliberately does NOT catch its own errors. WafService calls this
// fire-and-forget with an explicit `.catch(...)` at the call site — see
// docs/architecture.md §8a / ADR-7. Metrics recording must never gate or
// slow the ALLOW/BLOCK response, so the failure-handling responsibility
// lives at that one call site, not buried in here.
@Injectable()
export class TrafficMetricsRecorder {
  constructor(private readonly repository: TrafficMetricRepository) {}

  record(decision: DecisionResult): Promise<void> {
    const bucketStart = truncateToHour(new Date());
    const allowed = decision.action === 'ALLOW' ? 1 : 0;
    const blocked = decision.action === 'BLOCK' ? 1 : 0;
    const sqlInjectionBlocks =
      decision.action === 'BLOCK' && decision.classification === 'SQL_INJECTION'
        ? 1
        : 0;
    const xssBlocks =
      decision.action === 'BLOCK' && decision.classification === 'XSS' ? 1 : 0;

    return this.repository.incrementBucket(bucketStart, {
      allowed,
      blocked,
      sqlInjectionBlocks,
      xssBlocks,
    });
  }
}
