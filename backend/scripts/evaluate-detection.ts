import 'reflect-metadata';
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HybridDecisionEngine } from '../src/modules/decision/hybrid-decision.engine';
import { MLDetectionEngine } from '../src/modules/detection/ml/ml-detection.engine';
import { RuleDetectionEngine } from '../src/modules/detection/rule-based/rule-detection.engine';
import { SqlInjectionRuleDetector } from '../src/modules/detection/rule-based/sql-injection.detector';
import { XssRuleDetector } from '../src/modules/detection/rule-based/xss.detector';
import type { NormalizedRequest } from '../src/common/types';

// Phase 11 — runs the REAL RuleDetectionEngine / MLDetectionEngine /
// HybridDecisionEngine (the exact classes the WAF pipeline uses) against
// Phase 6's held-out test split, so the comparison reflects production
// behavior rather than a re-implementation of the detection/decision logic.
// A standalone script, same pattern as scripts/seed-admin.ts — no Nest
// application context is bootstrapped; these classes have no dependencies
// beyond each other and process.env, so they're instantiated directly.

const EVALUATION_DIR = resolve(__dirname, '../../ml-service/evaluation');
const TEST_SET_PATH = resolve(EVALUATION_DIR, 'test_set.json');
const PREDICTIONS_PATH = resolve(EVALUATION_DIR, 'predictions.json');
const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? 'http://localhost:8001';

interface TestSetRow {
  text: string;
  label: string;
}

interface PredictionRow {
  text: string;
  label: string;
  rulePrediction: string;
  mlPrediction: string;
  mlConfidence: number | null;
  hybridPrediction: string;
  hybridReason: string;
}

// Wraps a bare payload/phrase string (dataset.csv's `text` column) into a
// NormalizedRequest, the same shape every real request is reduced to before
// detection. The payload goes in a query param value — exactly how both
// search-surface builders (rule-based/search-surface.util.ts and
// ml-service's search_surface.py) already expect to find it; `endpoint` is
// a fixed, inert path with no SQLi/XSS-triggering substrings of its own.
function toNormalizedRequest(text: string): NormalizedRequest {
  return {
    method: 'GET',
    url: `/eval?value=${encodeURIComponent(text)}`,
    endpoint: '/eval',
    queryParams: { value: text },
    pathParams: {},
    body: null,
    sourceIp: '127.0.0.1',
    headers: {},
    timestamp: new Date().toISOString(),
  };
}

async function checkMlServiceHealthy(): Promise<void> {
  try {
    const res = await fetch(`${ML_SERVICE_URL}/health`);
    if (!res.ok) {
      throw new Error(`status ${res.status}`);
    }
  } catch (error) {
    throw new Error(
      `ml-service is not reachable at ${ML_SERVICE_URL} (${
        error instanceof Error ? error.message : String(error)
      }). Start it before running this evaluation.`,
    );
  }
}

async function main(): Promise<void> {
  await checkMlServiceHealthy();

  const testSet = JSON.parse(
    readFileSync(TEST_SET_PATH, 'utf-8'),
  ) as TestSetRow[];
  console.log(
    `Loaded ${testSet.length} evaluation rows from ${TEST_SET_PATH}`,
  );

  const ruleDetectionEngine = new RuleDetectionEngine(
    new SqlInjectionRuleDetector(),
    new XssRuleDetector(),
  );
  const mlDetectionEngine = new MLDetectionEngine();
  const decisionEngine = new HybridDecisionEngine();

  const predictions: PredictionRow[] = [];

  for (const [index, row] of testSet.entries()) {
    const request = toNormalizedRequest(row.text);
    const ruleResult = ruleDetectionEngine.detect(request);
    const mlResult = await mlDetectionEngine.detect(request);

    if (mlResult.status === 'UNAVAILABLE') {
      throw new Error(
        `Row ${index} ("${row.text}"): ML detection was UNAVAILABLE ` +
          `(${mlResult.reason}). Aborting rather than let a hole corrupt ` +
          'the ML-only/Hybrid numbers — confirm ml-service is healthy and ' +
          're-run.',
      );
    }

    const decision = decisionEngine.decide(request, ruleResult, mlResult);

    predictions.push({
      text: row.text,
      label: row.label,
      rulePrediction: ruleResult.classification,
      mlPrediction: mlResult.classification,
      mlConfidence: mlResult.confidence,
      hybridPrediction: decision.classification,
      hybridReason: decision.reason,
    });
  }

  writeFileSync(PREDICTIONS_PATH, JSON.stringify(predictions, null, 2));
  console.log(
    `Wrote ${predictions.length} predictions to ${PREDICTIONS_PATH}`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
