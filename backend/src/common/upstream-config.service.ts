import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { resolveUpstreamUrl } from './upstream-config.util';

const CONFIG_ID = 1;
const CONNECTION_TIMEOUT_MS = 5_000;

export interface UpstreamConnection {
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  checkedAt: string;
}

export interface UpstreamConfiguration {
  url: string;
  source: 'RUNTIME' | 'ENVIRONMENT';
  updatedAt: string | null;
  connection: UpstreamConnection | null;
}

@Injectable()
export class UpstreamConfigService {
  private cachedRuntimeUrl: string | null | undefined;

  constructor(private readonly prisma: PrismaService) {}

  async getActiveUrl(): Promise<string> {
    if (this.cachedRuntimeUrl !== undefined) {
      return this.cachedRuntimeUrl ?? resolveUpstreamUrl();
    }

    try {
      const configuration = await this.prisma.wafConfiguration.findUnique({
        where: { id: CONFIG_ID },
      });
      this.cachedRuntimeUrl = configuration?.upstreamUrl ?? null;
    } catch {
      this.cachedRuntimeUrl = null;
    }

    return this.cachedRuntimeUrl ?? resolveUpstreamUrl();
  }

  async getConfiguration(): Promise<UpstreamConfiguration> {
    const activeUrl = await this.getActiveUrl();
    let configuration: {
      upstreamUrl: string;
      updatedAt: Date;
      lastCheckedAt: Date | null;
      lastStatus: number | null;
      lastLatencyMs: number | null;
    } | null = null;

    try {
      configuration = await this.prisma.wafConfiguration.findUnique({
        where: { id: CONFIG_ID },
      });
    } catch {
      // The active URL is still useful when the DB is temporarily unavailable.
    }

    return {
      url: activeUrl,
      source: configuration ? 'RUNTIME' : 'ENVIRONMENT',
      updatedAt: configuration?.updatedAt.toISOString() ?? null,
      connection: configuration?.lastCheckedAt
        ? {
            ok: configuration.lastStatus !== null,
            status: configuration.lastStatus,
            latencyMs: configuration.lastLatencyMs,
            checkedAt: configuration.lastCheckedAt.toISOString(),
          }
        : null,
    };
  }

  async updateUrl(rawUrl: string): Promise<UpstreamConfiguration> {
    const validatedUrl = validateAdminUpstreamUrl(rawUrl);
    const connection = await this.testConnection(validatedUrl);

    try {
      const saved = await this.prisma.wafConfiguration.upsert({
        where: { id: CONFIG_ID },
        update: {
          upstreamUrl: validatedUrl,
          lastCheckedAt: new Date(connection.checkedAt),
          lastStatus: connection.status,
          lastLatencyMs: connection.latencyMs,
        },
        create: {
          id: CONFIG_ID,
          upstreamUrl: validatedUrl,
          lastCheckedAt: new Date(connection.checkedAt),
          lastStatus: connection.status,
          lastLatencyMs: connection.latencyMs,
        },
      });
      this.cachedRuntimeUrl = saved.upstreamUrl;

      return {
        url: saved.upstreamUrl,
        source: 'RUNTIME',
        updatedAt: saved.updatedAt.toISOString(),
        connection,
      };
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }

  private async testConnection(url: string): Promise<UpstreamConnection> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
      });
      return {
        ok: true,
        status: response.status,
        latencyMs: Date.now() - startedAt,
        checkedAt,
      };
    } catch {
      throw new BadRequestException(
        'Không thể kết nối tới ứng dụng đích. Cấu hình hiện tại vẫn được giữ nguyên.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function validateAdminUpstreamUrl(rawUrl: string): string {
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    throw new BadRequestException('url must be a non-empty absolute URL');
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new BadRequestException('url must be a valid absolute URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new BadRequestException('url must use http or https');
  }
  if (parsed.username || parsed.password) {
    throw new BadRequestException('url must not contain credentials');
  }
  parsed.hash = '';

  return parsed.toString().replace(/\/$/, '');
}
