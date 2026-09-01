import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SecurityEvent } from '@prisma/client';
import { daysToRange } from '../../common/date-range.util';
import {
  SecurityEventListFilter,
  SecurityEventRepository,
} from '../security-events/security-event.repository';
import { TrendPoint } from '../traffic-metrics/trend.util';
import {
  TrafficMetricRepository,
  TrafficMetricTotals,
} from '../traffic-metrics/traffic-metric.repository';
import {
  AdminSecurityEvent,
  AdminSecurityEventListResult,
} from './admin-event.dto';
import { lookupCountry } from './geo-lookup.util';

export interface AdminStatsExtra {
  maliciousIpCount: number;
  countryCount: number;
  requestsThisHour: number;
}

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
  ): Promise<AdminSecurityEventListResult> {
    try {
      const { items, total } =
        await this.securityEventRepository.findMany(filter);
      return {
        items: items.map((event) => this.enrichWithCountry(event)),
        total,
      };
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }

  async getEvent(id: string): Promise<AdminSecurityEvent> {
    let event: SecurityEvent | null;
    try {
      event = await this.securityEventRepository.findById(id);
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }

    if (!event) {
      throw new NotFoundException('SecurityEvent not found');
    }
    return this.enrichWithCountry(event);
  }

  // `days` omitted -> all-time totals (unchanged behavior from before this
  // task). `days` given -> totals restricted to the last N days, driven by
  // the Dashboard's date-range selector.
  async getStats(days?: number): Promise<TrafficMetricTotals> {
    try {
      const range = days !== undefined ? daysToRange(days) : undefined;
      return await this.trafficMetricRepository.getTotals(range);
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }

  async getTrend(days: number): Promise<TrendPoint[]> {
    try {
      return await this.trafficMetricRepository.getDailyTrend(
        daysToRange(days),
      );
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }

  async getStatsExtra(days?: number): Promise<AdminStatsExtra> {
    try {
      const range = days !== undefined ? daysToRange(days) : undefined;
      const [ips, requestsThisHour] = await Promise.all([
        this.securityEventRepository.findDistinctSourceIps(range),
        this.trafficMetricRepository.getCurrentHourTotal(),
      ]);

      const countryCodes = new Set(
        ips
          .map((ip) => lookupCountry(ip).countryCode)
          .filter((code): code is string => code !== null),
      );

      return {
        maliciousIpCount: ips.length,
        countryCount: countryCodes.size,
        requestsThisHour,
      };
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }

  private enrichWithCountry(event: SecurityEvent): AdminSecurityEvent {
    return { ...event, ...lookupCountry(event.sourceIp) };
  }
}
