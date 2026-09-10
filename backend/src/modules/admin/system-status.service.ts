import { Injectable } from '@nestjs/common';
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
  protectedApi: SystemComponentStatus;
  checkedAt: string;
}

// GET /admin/system-status's data source. Deliberately never throws —
// "down" is itself a valid, informative 200 response for this endpoint, not
// an error condition, so this bypasses AdminService's usual
// try/catch-to-503 facade entirely (a documented deviation from every other
// AdminService method).
@Injectable()
export class SystemStatusService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(): Promise<SystemStatus> {
    const [mlService, protectedApi, database] = await Promise.all([
      pingHealth(process.env.ML_SERVICE_URL ?? 'http://localhost:8001'),
      pingHealth(process.env.PROTECTED_API_URL ?? 'http://localhost:3001'),
      this.pingDatabase(),
    ]);

    // Answering this request at all already proves the WAF engine is up.
    return {
      wafEngine: { status: 'up', latencyMs: null },
      mlService,
      protectedApi,
      database,
      checkedAt: new Date().toISOString(),
    };
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
