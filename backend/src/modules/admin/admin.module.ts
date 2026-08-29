import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SecurityEventsModule } from '../security-events/security-events.module';
import { TrafficMetricsModule } from '../traffic-metrics/traffic-metrics.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

// Admin API — read-only access to SecurityEvents and TrafficMetric
// (docs/architecture.md §11). The Dashboard UI itself lives in `frontend`
// (Phase 10).
@Module({
  imports: [AuthModule, SecurityEventsModule, TrafficMetricsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
