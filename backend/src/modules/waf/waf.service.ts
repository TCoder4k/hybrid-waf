import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { HybridDecisionEngine } from '../decision/hybrid-decision.engine';
import { MLDetectionEngine } from '../detection/ml/ml-detection.engine';
import { RuleDetectionEngine } from '../detection/rule-based/rule-detection.engine';
import { RequestNormalizerService } from '../request/request-normalizer.service';
import { SecurityEventLogger } from '../security-events/security-event-logger.service';
import { TrafficMetricsRecorder } from '../traffic-metrics/traffic-metrics.recorder';
import type { ForwardedResponse } from './protected-api-client.service';
import { ProtectedApiClientService } from './protected-api-client.service';

// Pipeline orchestrator per docs/architecture.md §3.1. Wires Extract +
// Normalize (Phase 4), Rule-based Detection (Phase 5), ML Detection (Phase
// 6), and the Hybrid Decision Engine (Phase 7, §8) — rule and ML run in
// parallel, per the sequence diagram in docs/architecture.md §4. A BLOCK
// decision is logged (Phase 8, ADR-3) and short-circuits to a 403 here and
// never reaches Protected API; ALLOW forwards exactly as before. Traffic
// metrics (Phase 9A, ADR-7) are recorded fire-and-forget right after the
// decision — never awaited, never allowed to gate or slow the response.
@Injectable()
export class WafService {
  private readonly logger = new Logger(WafService.name);

  constructor(
    private readonly requestNormalizer: RequestNormalizerService,
    private readonly ruleDetectionEngine: RuleDetectionEngine,
    private readonly mlDetectionEngine: MLDetectionEngine,
    private readonly decisionEngine: HybridDecisionEngine,
    private readonly securityEventLogger: SecurityEventLogger,
    private readonly trafficMetricsRecorder: TrafficMetricsRecorder,
    private readonly protectedApiClient: ProtectedApiClientService,
  ) {}

  async handle(req: Request): Promise<ForwardedResponse> {
    const normalized = this.requestNormalizer.normalize(req);
    this.logger.debug(`Normalized request: ${JSON.stringify(normalized)}`);

    const [ruleResult, mlResult] = await Promise.all([
      Promise.resolve(this.ruleDetectionEngine.detect(normalized)),
      this.mlDetectionEngine.detect(normalized),
    ]);
    this.logger.debug(`Rule detection result: ${JSON.stringify(ruleResult)}`);
    this.logger.debug(`ML detection result: ${JSON.stringify(mlResult)}`);

    const decision = this.decisionEngine.decide(
      normalized,
      ruleResult,
      mlResult,
    );
    this.logger.debug(`Decision: ${JSON.stringify(decision)}`);

    // Fire-and-forget: never await, always .catch — a slow/down metrics DB
    // must add zero latency and never change the ALLOW/BLOCK response.
    this.trafficMetricsRecorder.record(decision).catch((error: unknown) => {
      this.logger.error(
        `Failed to record traffic metrics: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });

    if (decision.action === 'BLOCK') {
      await this.securityEventLogger.logBlock(
        normalized,
        ruleResult,
        mlResult,
        decision,
      );

      return {
        status: 403,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          statusCode: 403,
          error: 'Forbidden',
          message: `Request blocked: ${decision.classification}`,
        }),
      };
    }

    return this.protectedApiClient.forward(req);
  }
}
