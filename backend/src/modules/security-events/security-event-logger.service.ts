import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DecisionResult,
  DetectionResult,
  MLDetectionResult,
  NormalizedRequest,
} from '../../common/types';
import { SecurityEventRepository } from './security-event.repository';

// Persists a SecurityEvent for BLOCK decisions only (ADR-3, docs/architecture.md
// §10) — ALLOWed traffic is never logged here. requestMeta is a redacted
// subset (endpoint/queryParams/pathParams) per ADR-4: no raw body, no full
// headers. Deliberately never throws: a database outage is an operational
// concern, not a reason to weaken the BLOCK decision the Hybrid Decision
// Engine already made — the 403 must still reach the client either way.
@Injectable()
export class SecurityEventLogger {
  private readonly logger = new Logger(SecurityEventLogger.name);

  constructor(private readonly repository: SecurityEventRepository) {}

  async logBlock(
    request: NormalizedRequest,
    ruleResult: DetectionResult,
    mlResult: MLDetectionResult,
    decision: DecisionResult,
  ): Promise<void> {
    try {
      await this.repository.create({
        sourceIp: request.sourceIp,
        method: request.method,
        endpoint: request.endpoint,
        attackType: decision.classification,
        ruleResult: ruleResult as unknown as Prisma.InputJsonValue,
        mlResult: mlResult,
        confidence:
          mlResult.status === 'AVAILABLE' ? mlResult.confidence : null,
        decision: decision.action,
        requestMeta: {
          endpoint: request.endpoint,
          queryParams: request.queryParams,
          pathParams: request.pathParams,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to persist SecurityEvent for a BLOCK decision (request was still blocked): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
