// Core domain contracts shared across the WAF pipeline. Definitions match
// docs/architecture.md §5-§8 exactly — type-only, no runtime logic.
// Consuming implementations (normalizer, rule/ML engines, decision engine)
// land in Phase 4 onward.

export interface NormalizedRequest {
  method: string;
  url: string;
  endpoint: string;
  queryParams: Record<string, string>;
  pathParams: Record<string, string>;
  body: unknown;
  sourceIp: string;
  headers: Record<string, string>;
  timestamp: string;
}

// 'RATE_LIMIT' added in Phase P3 (docs/architecture.md §22, ADR-9) for a
// request rejected by the rate limiter — it never goes through Rule/ML
// detection or HybridDecisionEngine (the limiter runs before
// normalization), but reuses this same classification type so it can flow
// through the existing SecurityEvent/TrafficMetric recording machinery
// unchanged (see RateLimitRecorder). SecurityEvent.attackType is a
// free-text Prisma String, not a DB enum, so this needed no migration.
export type AttackClassification =
  'NORMAL' | 'SQL_INJECTION' | 'XSS' | 'RATE_LIMIT';

export type SecurityEventAttackType = Exclude<AttackClassification, 'NORMAL'>;

// Rule engine result. Always deterministic — no "unavailable" state (see
// docs/architecture.md §6).
export interface DetectionResult {
  classification: AttackClassification;
  detected: boolean;
  confidence: number | null;
  reason: string;
}

// ML engine result. Unlike DetectionResult, has a genuine failure mode —
// UNAVAILABLE is a distinct outcome, never coerced to NORMAL
// (see docs/architecture.md §7, ADR-2).
export type MLDetectionResult =
  | {
      status: 'AVAILABLE';
      classification: AttackClassification;
      confidence: number;
      reason: string;
    }
  | {
      status: 'UNAVAILABLE';
      classification: null;
      confidence: null;
      reason: string;
    };

export interface DecisionResult {
  classification: AttackClassification;
  action: 'ALLOW' | 'BLOCK';
  reason: string;
  // Phase P5 (docs/architecture.md §23, ADR-10) — populated only in
  // MONITOR/RULE_BLOCK_ML_MONITOR modes, only when a suppressed branch
  // would otherwise have blocked. Lets onboarding data actually be
  // reviewed (was this really an attack?) without a WAF_MODE below
  // HYBRID_BLOCK affecting real traffic yet. Absent entirely in normal
  // HYBRID_BLOCK operation and on every ALLOW that wasn't a suppressed
  // BLOCK.
  shadow?: {
    wouldBlock: true;
    classification: AttackClassification;
    reason: string;
  };
}
