import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SecurityEvent } from '@prisma/client';
import {
  SecurityEventListFilter,
  SecurityEventListResult,
  SecurityEventRepository,
} from '../security-events/security-event.repository';
import {
  TrafficMetricRepository,
  TrafficMetricTotals,
} from '../traffic-metrics/traffic-metric.repository';

// Read side of Security Events and Traffic Metrics for the Admin API
// (docs/architecture.md §11). Persistence itself is written elsewhere —
// SecurityEvent by Phase 8's SecurityEventLogger (BLOCK only), TrafficMetric
// by Phase 9A's TrafficMetricsRecorder (every request) — this service never
// writes either.
@Injectable()
export class AdminService {
  constructor(
    private readonly securityEventRepository: SecurityEventRepository,
    private readonly trafficMetricRepository: TrafficMetricRepository,
  ) {}

  async listEvents(
    filter: SecurityEventListFilter,
  ): Promise<SecurityEventListResult> {
    try {
      return await this.securityEventRepository.findMany(filter);
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }

  async getEvent(id: string): Promise<SecurityEvent> {
    let event: SecurityEvent | null;
    try {
      event = await this.securityEventRepository.findById(id);
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }

    if (!event) {
      throw new NotFoundException('SecurityEvent not found');
    }
    return event;
  }

  async getStats(): Promise<TrafficMetricTotals> {
    try {
      return await this.trafficMetricRepository.getTotals();
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }
}
