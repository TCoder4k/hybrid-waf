import { Injectable } from '@nestjs/common';
import { UpstreamConfigService } from '../../common/upstream-config.service';
import { PrismaService } from '../../database/prisma.service';
import { ComponentStatus, pingHealth } from './health-ping.util';

export interface SystemComponentStatus {
  status: ComponentStatus;
  latencyMs: number | null;
}

export interface SystemStatus {
  wafEngine: SystemComponentStatus;
  mlService: SystemComponentStatus;
  database: SystemComponentStatus;
  // Renamed from `protectedApi` in Phase P1 (ADR-8, docs/architecture.md
  // §21) — reflects whatever UPSTREAM_URL/PROTECTED_API_URL currently
  // resolves to, not specifically the bundled `protected-api` demo service.
  upstream: SystemComponentStatus;
  checkedAt: string;
}

// GET /admin/system-status's data source. Deliberately never throws —
// "down" is itself a valid, informative 200 response for this endpoint, not
// an error condition, so this bypasses AdminService's usual
// try/catch-to-503 facade entirely (a documented deviation from every other
// AdminService method).
@Injectable()
export class SystemStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly upstreamConfigService: UpstreamConfigService,
  ) {}

  async getStatus(): Promise<SystemStatus> {
    const [mlService, upstream, database] = await Promise.all([
      pingHealth(process.env.ML_SERVICE_URL ?? 'http://localhost:8001'),
      this.pingUpstream(),
      this.pingDatabase(),
    ]);

    // Answering this request at all already proves the WAF engine is up.
    return {
      wafEngine: { status: 'up', latencyMs: null },
      mlService,
      upstream,
      database,
      checkedAt: new Date().toISOString(),
    };
  }

  private async pingUpstream(): Promise<SystemComponentStatus> {
    let upstreamUrl: string;
    try {
      upstreamUrl = await this.upstreamConfigService.getActiveUrl();
    } catch {
      // Malformed UPSTREAM_URL/PROTECTED_API_URL — this endpoint never
      // throws (see the class comment), so a bad config just reports as
      // "down" like any other unreachable component.
      return { status: 'down', latencyMs: null };
    }
    return pingHealth(upstreamUrl);
  }

  private async pingDatabase(): Promise<SystemComponentStatus> {
    const startedAt = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'up', latencyMs: Date.now() - startedAt };
    } catch {
      return { status: 'down', latencyMs: null };
    }
  }
}
