import { Module } from '@nestjs/common';
import { RequestModule } from '../request/request.module';
import { SecurityEventsModule } from '../security-events/security-events.module';
import { TrafficMetricsModule } from '../traffic-metrics/traffic-metrics.module';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitRecorder } from './rate-limit-recorder.service';

// Phase P3, docs/architecture.md §22. Kept as its own module (not folded
// into WafModule) for the same reason traffic-metrics/security-events are
// separate — a distinct concern, independently testable/mockable, imported
// wherever it's needed rather than growing WafModule further.
//
// RateLimitRecorder is exported alongside RateLimitGuard (mirroring
// AuthModule's own AuthModule/JwtAuthGuard pattern, see its comment) — Nest
// resolves a class-referenced guard's own dependencies (RateLimitRecorder,
// for @UseGuards(RateLimitGuard) on WafController) through the *consuming*
// module's injector, not RateLimitGuard's home module here. Without this
// export, WafModule can see RateLimitGuard but not what it needs to
// construct.
@Module({
  imports: [RequestModule, SecurityEventsModule, TrafficMetricsModule],
  providers: [RateLimitRecorder, RateLimitGuard],
  exports: [RateLimitGuard, RateLimitRecorder],
})
export class RateLimitModule {}
