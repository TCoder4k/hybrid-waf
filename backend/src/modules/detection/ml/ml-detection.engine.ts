import { Injectable, Logger } from '@nestjs/common';
import {
  AttackClassification,
  MLDetectionResult,
  NormalizedRequest,
} from '../../../common/types';

const ML_REQUEST_TIMEOUT_MS = 2000;
const VALID_CLASSIFICATIONS: AttackClassification[] = [
  'NORMAL',
  'SQL_INJECTION',
  'XSS',
];

// Calls the Python ML service's /predict endpoint (docs/architecture.md
// §7). UNAVAILABLE is a first-class outcome per ADR-2 — never coerced to
// NORMAL — covering timeout, connection failure, non-2xx, and malformed
// responses alike, so the Hybrid Decision Engine (Phase 7) can fall back
// to the rule engine whenever ML genuinely has no opinion.
@Injectable()
export class MLDetectionEngine {
  private readonly logger = new Logger(MLDetectionEngine.name);

  async detect(request: NormalizedRequest): Promise<MLDetectionResult> {
    const mlServiceUrl = process.env.ML_SERVICE_URL ?? 'http://localhost:8001';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ML_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${mlServiceUrl}/predict`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          method: request.method,
          endpoint: request.endpoint,
          queryParams: request.queryParams,
          pathParams: request.pathParams,
          body: request.body,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return this.unavailable(
          `ML service responded with status ${response.status}`,
        );
      }

      const data: unknown = await response.json();
      if (!this.isValidPrediction(data)) {
        return this.unavailable('ML service returned a malformed response');
      }

      return {
        status: 'AVAILABLE',
        classification: data.classification,
        confidence: data.confidence,
        reason: `ML model predicted ${data.classification}`,
      };
    } catch (error) {
      const reason =
        error instanceof Error && error.name === 'AbortError'
          ? 'ML service timeout'
          : 'ML service connection error';
      return this.unavailable(reason);
    } finally {
      clearTimeout(timeout);
    }
  }

  private unavailable(reason: string): MLDetectionResult {
    this.logger.warn(`ML detection unavailable: ${reason}`);
    return {
      status: 'UNAVAILABLE',
      classification: null,
      confidence: null,
      reason,
    };
  }

  private isValidPrediction(
    data: unknown,
  ): data is { classification: AttackClassification; confidence: number } {
    if (typeof data !== 'object' || data === null) {
      return false;
    }
    const record = data as Record<string, unknown>;
    return (
      typeof record.classification === 'string' &&
      VALID_CLASSIFICATIONS.includes(
        record.classification as AttackClassification,
      ) &&
      typeof record.confidence === 'number'
    );
  }
}
