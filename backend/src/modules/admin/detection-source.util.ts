export type DetectionSource = 'RULE' | 'ML' | 'BOTH';

export interface ConfidenceBuckets {
  '0.7-0.8': number;
  '0.8-0.9': number;
  '0.9-1.0': number;
}

export interface TopReasonItem {
  reason: string;
  count: number;
}

export interface TopEndpointItem {
  endpoint: string;
  count: number;
}

export interface DetectionAnalysisResult {
  totalBlocked: number;
  ruleOnlyCount: number;
  mlOnlyCount: number;
  bothCount: number;
  unclassifiedCount: number;
  ruleContributionCount: number;
  mlContributionCount: number;
  confidenceBuckets: ConfidenceBuckets;
  topReasons: TopReasonItem[];
  topEndpoints: TopEndpointItem[];
}

export interface SecurityEventLike {
  id?: string;
  timestamp?: Date | string;
  sourceIp?: string;
  method?: string;
  endpoint?: string;
  attackType?: string;
  ruleResult?: unknown;
  mlResult?: unknown;
  confidence?: number | null;
  decision?: string;
  reason?: string | null;
}

/**
 * Checks if ML Engine classified the request as an attack or malicious.
 * Follows system conventions: SQL_INJECTION, XSS, attack, malicious, etc.
 * Strings like "NORMAL", "normal", "benign", or status "UNAVAILABLE" without attack
 * are treated as non-detection.
 */
export function isMlDetected(mlResult: unknown): boolean {
  if (!mlResult || typeof mlResult !== 'object') {
    return false;
  }
  const ml = mlResult as Record<string, unknown>;

  // Check status if directly stating attack/malicious
  if (typeof ml.status === 'string') {
    const statusLower = ml.status.toLowerCase().trim();
    if (statusLower === 'attack' || statusLower === 'malicious') {
      return true;
    }
    if (statusLower === 'unavailable') {
      return false;
    }
  }

  // Check classification
  if (typeof ml.classification === 'string') {
    const classificationLower = ml.classification.toLowerCase().trim();
    if (
      classificationLower === 'normal' ||
      classificationLower === 'benign' ||
      classificationLower === '' ||
      classificationLower === 'none'
    ) {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Classifies the detection source of a blocked security event:
 * - 'BOTH': Both Rule and ML Engines detected the attack
 * - 'RULE': Rule Engine detected, ML did not
 * - 'ML': ML Engine detected, Rule did not
 * - null: Neither engine detected (unclassified / anomaly in blocked set)
 */
export function classifyDetectionSource(
  ruleResult: unknown,
  mlResult: unknown,
): DetectionSource | null {
  const ruleDetected = Boolean(
    ruleResult &&
    typeof ruleResult === 'object' &&
    'detected' in ruleResult &&
    (ruleResult as { detected?: unknown }).detected === true,
  );

  const mlDetected = isMlDetected(mlResult);

  if (ruleDetected && mlDetected) {
    return 'BOTH';
  }
  if (ruleDetected && !mlDetected) {
    return 'RULE';
  }
  if (!ruleDetected && mlDetected) {
    return 'ML';
  }
  return null;
}

/**
 * Extracts the primary original detection reason string from an event.
 */
export function extractEventReason(event: SecurityEventLike): string | null {
  if (typeof event.reason === 'string' && event.reason.trim()) {
    return event.reason.trim();
  }

  const rule = event.ruleResult as Record<string, unknown> | null | undefined;
  if (
    rule &&
    typeof rule === 'object' &&
    rule.detected === true &&
    typeof rule.reason === 'string' &&
    rule.reason.trim()
  ) {
    return rule.reason.trim();
  }

  const ml = event.mlResult as Record<string, unknown> | null | undefined;
  if (
    ml &&
    typeof ml === 'object' &&
    typeof ml.reason === 'string' &&
    ml.reason.trim()
  ) {
    return ml.reason.trim();
  }

  if (
    rule &&
    typeof rule === 'object' &&
    typeof rule.reason === 'string' &&
    rule.reason.trim()
  ) {
    return rule.reason.trim();
  }

  return null;
}

/**
 * Formats endpoint as "METHOD endpoint" (e.g. "POST /api/login")
 * or bare endpoint if method is already included or absent.
 */
export function formatEndpoint(event: SecurityEventLike): string | null {
  if (!event.endpoint || typeof event.endpoint !== 'string') {
    return null;
  }

  const ep = event.endpoint.trim();
  if (!ep) {
    return null;
  }

  if (event.method && typeof event.method === 'string') {
    const method = event.method.trim().toUpperCase();
    if (method && !ep.startsWith(method + ' ')) {
      return `${method} ${ep}`;
    }
  }

  return ep;
}

/**
 * Aggregates a list of blocked SecurityEvents in-memory into DetectionAnalysisResult.
 * Computes Rule/ML contributions, confidence buckets (0.7-1.0), top 10 reasons, and top 10 endpoints.
 */
export function aggregateDetectionAnalysis(
  events: SecurityEventLike[],
): DetectionAnalysisResult {
  let ruleOnlyCount = 0;
  let mlOnlyCount = 0;
  let bothCount = 0;
  let unclassifiedCount = 0;

  const confidenceBuckets: ConfidenceBuckets = {
    '0.7-0.8': 0,
    '0.8-0.9': 0,
    '0.9-1.0': 0,
  };

  const reasonCounts = new Map<string, number>();
  const endpointCounts = new Map<string, number>();

  for (const event of events) {
    const source = classifyDetectionSource(event.ruleResult, event.mlResult);

    if (source === 'RULE') {
      ruleOnlyCount++;
    } else if (source === 'ML') {
      mlOnlyCount++;
    } else if (source === 'BOTH') {
      bothCount++;
    } else {
      unclassifiedCount++;
    }

    // Confidence buckets: 0.7 <= c < 0.8, 0.8 <= c < 0.9, 0.9 <= c <= 1.0
    // Limitations of this aggregation:
    // (a) it only ever runs over BLOCKED events (the route only reads
    //     blocked/BLOCK-decision SecurityEvent rows), never ALLOWed traffic;
    // (b) confidence buckets only include events where ML was a detecting
    //     source (source === 'ML' || 'BOTH') — a RULE-only event can still
    //     carry a numeric mlResult.confidence for a NORMAL classification
    //     (ML disagreeing/not detecting), and that must not count toward
    //     "ML Engine confidence in its detections".
    if (source === 'ML' || source === 'BOTH') {
      const rawConf =
        event.confidence ??
        (event.mlResult as Record<string, unknown> | null | undefined)
          ?.confidence;
      if (typeof rawConf === 'number' && !Number.isNaN(rawConf)) {
        if (rawConf >= 0.7 && rawConf < 0.8) {
          confidenceBuckets['0.7-0.8']++;
        } else if (rawConf >= 0.8 && rawConf < 0.9) {
          confidenceBuckets['0.8-0.9']++;
        } else if (rawConf >= 0.9 && rawConf <= 1.0) {
          confidenceBuckets['0.9-1.0']++;
        }
        // Confidence < 0.7 or > 1.0 ignored per BR-11
      }
    }

    // Reason frequency
    const reason = extractEventReason(event);
    if (reason) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }

    // Endpoint frequency
    const endpoint = formatEndpoint(event);
    if (endpoint) {
      endpointCounts.set(endpoint, (endpointCounts.get(endpoint) ?? 0) + 1);
    }
  }

  const topReasons: TopReasonItem[] = Array.from(reasonCounts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, 10);

  const topEndpoints: TopEndpointItem[] = Array.from(endpointCounts.entries())
    .map(([endpoint, count]) => ({ endpoint, count }))
    .sort((a, b) => b.count - a.count || a.endpoint.localeCompare(b.endpoint))
    .slice(0, 10);

  return {
    totalBlocked: events.length,
    ruleOnlyCount,
    mlOnlyCount,
    bothCount,
    unclassifiedCount,
    ruleContributionCount: ruleOnlyCount + bothCount,
    mlContributionCount: mlOnlyCount + bothCount,
    confidenceBuckets,
    topReasons,
    topEndpoints,
  };
}
