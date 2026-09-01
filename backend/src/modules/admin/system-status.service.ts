import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ComponentStatus, pingHealth } from './health-ping.util';

export interface SystemStatus {
  wafEngine: 'up';
  mlService: ComponentStatus;
  database: ComponentStatus;
  protectedApi: ComponentStatus;
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

    // Answering this request at all already proves the WAF engine (this
    // process) is up — no separate check needed.
    return { wafEngine: 'up', mlService, protectedApi, database };
  }

  private async pingDatabase(): Promise<ComponentStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
  }
}
