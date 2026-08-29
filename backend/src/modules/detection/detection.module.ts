import { Module } from '@nestjs/common';
import { MLDetectionEngine } from './ml/ml-detection.engine';
import { RuleDetectionEngine } from './rule-based/rule-detection.engine';
import { SqlInjectionRuleDetector } from './rule-based/sql-injection.detector';
import { XssRuleDetector } from './rule-based/xss.detector';

// Rule-based detection (Phase 5) and ML detection (Phase 6). The Hybrid
// Decision Engine lands in Phase 7 (see docs/architecture.md §6-8).
@Module({
  providers: [
    SqlInjectionRuleDetector,
    XssRuleDetector,
    RuleDetectionEngine,
    MLDetectionEngine,
  ],
  exports: [RuleDetectionEngine, MLDetectionEngine],
})
export class DetectionModule {}
