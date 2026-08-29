import { Injectable } from '@nestjs/common';
import {
  DecisionResult,
  DetectionResult,
  MLDetectionResult,
  NormalizedRequest,
} from '../../common/types';

const DEFAULT_ML_CONFIDENCE_THRESHOLD = 0.7;

// Combines the Rule Engine's always-available result with the ML Engine's
// possibly-UNAVAILABLE result into one ALLOW/BLOCK decision, per
// docs/architecture.md §8 (ADR-2). Deterministic and stateless: the same two
// inputs always produce the same decision, and the confidence threshold is
// the only configurable input (env var, not hardcoded).
@Injectable()
export class HybridDecisionEngine {
  private readonly confidenceThreshold: number;

  constructor() {
    const configured = process.env.ML_CONFIDENCE_THRESHOLD;
    const parsed = configured !== undefined ? Number(configured) : NaN;
    this.confidenceThreshold = Number.isFinite(parsed)
      ? parsed
      : DEFAULT_ML_CONFIDENCE_THRESHOLD;
  }

  decide(
    _request: NormalizedRequest,
    ruleResult: DetectionResult,
    mlResult: MLDetectionResult,
  ): DecisionResult {
    // Rule engine is authoritative when it fires — deterministic and
    // explainable, and it wins regardless of what ML says (agreement,
    // disagreement, or ML being unavailable all fall into this branch).
    if (ruleResult.detected) {
      return {
        classification: ruleResult.classification,
        action: 'BLOCK',
        reason: `rule match: ${ruleResult.reason}`,
      };
    }

    if (mlResult.status === 'UNAVAILABLE') {
      return {
        classification: 'NORMAL',
        action: 'ALLOW',
        reason: 'rule: normal; ml: unavailable',
      };
    }

    if (mlResult.classification === 'NORMAL') {
      return {
        classification: 'NORMAL',
        action: 'ALLOW',
        reason: 'rule: normal; ml: normal',
      };
    }

    if (mlResult.confidence >= this.confidenceThreshold) {
      return {
        classification: mlResult.classification,
        action: 'BLOCK',
        reason: `ml match: ${mlResult.reason}`,
      };
    }

    return {
      classification: 'NORMAL',
      action: 'ALLOW',
      reason: `rule: normal; ml: ${mlResult.classification} below confidence threshold (${mlResult.confidence} < ${this.confidenceThreshold})`,
    };
  }
}
