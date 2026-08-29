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

export type AttackClassification = 'NORMAL' | 'SQL_INJECTION' | 'XSS';

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
}
