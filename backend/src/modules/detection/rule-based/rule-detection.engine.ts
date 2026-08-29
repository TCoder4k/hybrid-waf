import { Injectable } from '@nestjs/common';
import { DetectionResult, NormalizedRequest } from '../../../common/types';
import { SqlInjectionRuleDetector } from './sql-injection.detector';
import { XssRuleDetector } from './xss.detector';

// Composition point for individual rule detectors — runs each against the
// normalized request and returns the highest-severity result (SQLi checked
// first, matching docs/architecture.md §6). classification is always one of
// the three enum values here — no "unavailable" state, unlike the ML engine.
@Injectable()
export class RuleDetectionEngine {
  constructor(
    private readonly sqlInjectionDetector: SqlInjectionRuleDetector,
    private readonly xssDetector: XssRuleDetector,
  ) {}

  detect(request: NormalizedRequest): DetectionResult {
    const sqlResult = this.sqlInjectionDetector.detect(request);
    if (sqlResult.detected) {
      return sqlResult;
    }

    const xssResult = this.xssDetector.detect(request);
    if (xssResult.detected) {
      return xssResult;
    }

    return {
      classification: 'NORMAL',
      detected: false,
      confidence: null,
      reason: 'no rule matched',
    };
  }
}
