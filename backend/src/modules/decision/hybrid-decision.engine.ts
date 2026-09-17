import { Injectable } from '@nestjs/common';
import { resolveWafMode, WafMode } from '../../common/waf-mode.util';
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
// inputs (plus the configured mode/threshold) always produce the same
// decision.
//
// WAF_MODE (Phase P5, §23, ADR-10), read once at construction like
// ML_CONFIDENCE_THRESHOLD already was — an additive gate on top of the
// existing decision table, not a redesign:
//   - HYBRID_BLOCK (default): unchanged, today's full behavior.
//   - RULE_BLOCK_ML_MONITOR: rule BLOCK unchanged; the ML-confidence BLOCK
//     branch is suppressed (ALLOW instead) — ML is still evaluated and
//     recorded (see DecisionResult.shadow), just never gates the decision.
//   - MONITOR: both the rule BLOCK and the ML-confidence BLOCK branches are
//     suppressed — always ALLOW, for observing a newly-protected site's
//     traffic before enforcing anything.
@Injectable()
export class HybridDecisionEngine {
  private readonly confidenceThreshold: number;
  private readonly mode: WafMode;

  constructor() {
    const configured = process.env.ML_CONFIDENCE_THRESHOLD;
    const parsed = configured !== undefined ? Number(configured) : NaN;
    this.confidenceThreshold = Number.isFinite(parsed)
      ? parsed
      : DEFAULT_ML_CONFIDENCE_THRESHOLD;
    this.mode = resolveWafMode();
  }

  decide(
    _request: NormalizedRequest,
    ruleResult: DetectionResult,
    mlResult: MLDetectionResult,
  ): DecisionResult {
    // Rule engine is authoritative when it fires — deterministic and
    // explainable, and it wins regardless of what ML says (agreement,
    // disagreement, or ML being unavailable all fall into this branch) —
    // unless MONITOR mode suppresses enforcement entirely.
    if (ruleResult.detected) {
      if (this.mode === 'MONITOR') {
        return {
          classification: 'NORMAL',
          action: 'ALLOW',
          reason: `monitor mode: rule would have blocked (${ruleResult.reason})`,
          shadow: {
            wouldBlock: true,
            classification: ruleResult.classification,
            reason: `rule match: ${ruleResult.reason}`,
          },
        };
      }
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
      if (this.mode === 'MONITOR' || this.mode === 'RULE_BLOCK_ML_MONITOR') {
        return {
          classification: 'NORMAL',
          action: 'ALLOW',
          reason: `${this.mode.toLowerCase()} mode: ml would have blocked (${mlResult.reason})`,
          shadow: {
            wouldBlock: true,
            classification: mlResult.classification,
            reason: `ml match: ${mlResult.reason}`,
          },
        };
      }
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
