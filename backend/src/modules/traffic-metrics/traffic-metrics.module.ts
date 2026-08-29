import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { TrafficMetricRepository } from './traffic-metric.repository';
import { TrafficMetricsRecorder } from './traffic-metrics.recorder';

// Aggregate traffic counters (Phase 9A, ADR-7) — separate from
// SecurityEventsModule's BLOCK-only forensic logging.
@Module({
  imports: [DatabaseModule],
  providers: [TrafficMetricRepository, TrafficMetricsRecorder],
  // TrafficMetricRepository is also exported so AdminModule (Phase 10) can
  // read aggregate totals for GET /admin/stats without duplicating the
  // aggregate query elsewhere.
  exports: [TrafficMetricsRecorder, TrafficMetricRepository],
})
export class TrafficMetricsModule {}
