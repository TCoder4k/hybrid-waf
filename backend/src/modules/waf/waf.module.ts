import { Module } from '@nestjs/common';
import { UpstreamConfigModule } from '../../common/upstream-config.module';
import { DecisionModule } from '../decision/decision.module';
import { DetectionModule } from '../detection/detection.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { RequestModule } from '../request/request.module';
import { SecurityEventsModule } from '../security-events/security-events.module';
import { TrafficMetricsModule } from '../traffic-metrics/traffic-metrics.module';
import { UpstreamProxyService } from './upstream-proxy.service';
import { WafController } from './waf.controller';
import { WafService } from './waf.service';

// Orchestrates rate limiting (Phase P3, gates entry via WafController's
// RateLimitGuard before anything below even runs), Extract + Normalize
// (Phase 4), Rule-based Detection (Phase 5), ML Detection (Phase 6), the
// Hybrid Decision Engine (Phase 7), BLOCK-only Security Logging (Phase 8),
// and non-blocking Traffic Metrics (Phase 9A) ahead of forwarding (see
// docs/architecture.md §3.1/§22).
@Module({
  imports: [
    RequestModule,
    DetectionModule,
    DecisionModule,
    SecurityEventsModule,
    TrafficMetricsModule,
    RateLimitModule,
    UpstreamConfigModule,
  ],
  controllers: [WafController],
  providers: [WafService, UpstreamProxyService],
})
export class WafModule {}
