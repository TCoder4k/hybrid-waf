import { Module } from '@nestjs/common';
import { DecisionModule } from '../decision/decision.module';
import { DetectionModule } from '../detection/detection.module';
import { RequestModule } from '../request/request.module';
import { SecurityEventsModule } from '../security-events/security-events.module';
import { TrafficMetricsModule } from '../traffic-metrics/traffic-metrics.module';
import { ProtectedApiClientService } from './protected-api-client.service';
import { WafController } from './waf.controller';
import { WafService } from './waf.service';

// Orchestrates Extract + Normalize (Phase 4), Rule-based Detection
// (Phase 5), ML Detection (Phase 6), the Hybrid Decision Engine (Phase 7),
// BLOCK-only Security Logging (Phase 8), and non-blocking Traffic Metrics
// (Phase 9A) ahead of forwarding (see docs/architecture.md §3.1).
@Module({
  imports: [
    RequestModule,
    DetectionModule,
    DecisionModule,
    SecurityEventsModule,
    TrafficMetricsModule,
  ],
  controllers: [WafController],
  providers: [WafService, ProtectedApiClientService],
})
export class WafModule {}
