import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import {
  DecisionResult,
  DetectionResult,
  MLDetectionResult,
} from '../../common/types';
import { RequestNormalizerService } from '../request/request-normalizer.service';
import { SecurityEventLogger } from '../security-events/security-event-logger.service';
import { TrafficMetricsRecorder } from '../traffic-metrics/traffic-metrics.recorder';

// Records a rate-limit rejection through the SAME machinery a real
// rule/ML BLOCK uses (SecurityEventLogger, TrafficMetricsRecorder) rather
// than a parallel implementation — see docs/architecture.md §22. The
// request never actually reaches RuleDetectionEngine/MLDetectionEngine (the
// whole point of rejecting this early), so ruleResult/mlResult here are
// synthetic, clearly-labeled stand-ins: ruleResult says the *limiter*
// detected this, and mlResult uses the existing UNAVAILABLE shape with a
// reason explaining ML never got a chance to run — not a real ML call.
//
// Deliberately fire-and-forget from the guard's point of view (unlike the
// awaited SecurityEventLogger.logBlock() call on the real BLOCK path in
// WafService): a 429 response is meant to be fast, especially under an
// actual flood where many rejections happen in a burst — awaiting a DB
// write per rejection would let a slow/contended DB turn the shedding
// mechanism itself into a bottleneck. SecurityEventLogger.logBlock() never
// throws on its own (see its own doc comment), so the .catch() below is
// purely defensive/symmetric with TrafficMetricsRecorder's pattern.
@Injectable()
export class RateLimitRecorder {
  private readonly logger = new Logger(RateLimitRecorder.name);

  constructor(
    private readonly normalizer: RequestNormalizerService,
    private readonly securityEventLogger: SecurityEventLogger,
    private readonly trafficMetricsRecorder: TrafficMetricsRecorder,
  ) {}

  recordBlock(req: Request, reason: string): void {
    const normalized = this.normalizer.normalize(req);

    const ruleResult: DetectionResult = {
      classification: 'RATE_LIMIT',
      detected: true,
      confidence: null,
      reason,
    };
    const mlResult: MLDetectionResult = {
      status: 'UNAVAILABLE',
      classification: null,
      confidence: null,
      reason:
        'ML detection skipped — request was blocked by the rate limiter before normalization',
    };
    const decision: DecisionResult = {
      classification: 'RATE_LIMIT',
      action: 'BLOCK',
      reason: `rate limit: ${reason}`,
    };

    this.trafficMetricsRecorder.record(decision).catch((error: unknown) => {
      this.logger.error(
        `Failed to record traffic metrics for a rate-limit block: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });

    this.securityEventLogger
      .logBlock(normalized, ruleResult, mlResult, decision)
      .catch((error: unknown) => {
        this.logger.error(
          `Unexpected error recording a rate-limit SecurityEvent: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  }
}
