import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { SecurityEventsModule } from '../security-events/security-events.module';
import { TrafficMetricsModule } from '../traffic-metrics/traffic-metrics.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SystemStatusService } from './system-status.service';

// Admin API — read-only access to SecurityEvents and TrafficMetric
// (docs/architecture.md §11). The Dashboard UI itself lives in `frontend`
// (Phase 10). DatabaseModule is imported directly (in addition to the
// transitive access SecurityEventsModule/TrafficMetricsModule already have)
// so SystemStatusService can inject PrismaService for its own DB health
// check — safe to import a second time, Nest treats each module class as a
// singleton across the whole application graph.
@Module({
  imports: [
    AuthModule,
    SecurityEventsModule,
    TrafficMetricsModule,
    DatabaseModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, SystemStatusService],
})
export class AdminModule {}
