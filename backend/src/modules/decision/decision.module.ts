import { Module } from '@nestjs/common';
import { HybridDecisionEngine } from './hybrid-decision.engine';

@Module({
  providers: [HybridDecisionEngine],
  exports: [HybridDecisionEngine],
})
export class DecisionModule {}
