import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../database/prisma.service';
import {
  UpstreamConfigService,
  validateAdminUpstreamUrl,
} from './upstream-config.service';

function makePrisma() {
  return {
    wafConfiguration: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
    },
  } as unknown as PrismaService;
}

describe('UpstreamConfigService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses the environment fallback when no runtime row exists', async () => {
    process.env.UPSTREAM_URL = 'http://env-upstream.test';
    const prisma = makePrisma();
    const service = new UpstreamConfigService(prisma);

    await expect(service.getActiveUrl()).resolves.toBe(
      'http://env-upstream.test',
    );
    await expect(service.getConfiguration()).resolves.toMatchObject({
      url: 'http://env-upstream.test',
      source: 'ENVIRONMENT',
    });
    delete process.env.UPSTREAM_URL;
  });

  it.each([
    '',
    'not-a-url',
    'ftp://example.com',
    'http://user:password@example.com',
  ])('rejects unsafe or invalid URL %s', (value) => {
    expect(() => validateAdminUpstreamUrl(value)).toThrow(BadRequestException);
  });

  it('tests connectivity before persisting and activates the saved URL', async () => {
    const prisma = makePrisma();
    const updatedAt = new Date('2026-09-18T10:00:00.000Z');
    prisma.wafConfiguration.upsert = jest.fn().mockResolvedValue({
      id: 1,
      upstreamUrl: 'http://new-upstream.test',
      updatedAt,
      lastCheckedAt: updatedAt,
      lastStatus: 200,
      lastLatencyMs: 12,
    });
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));
    const service = new UpstreamConfigService(prisma);

    const result = await service.updateUrl('http://new-upstream.test/');

    expect(result).toMatchObject({
      url: 'http://new-upstream.test',
      source: 'RUNTIME',
      connection: { ok: true, status: 200 },
    });
    expect(
      (prisma.wafConfiguration.upsert as jest.Mock).mock.calls.length,
    ).toBeGreaterThan(0);
    await expect(service.getActiveUrl()).resolves.toBe(
      'http://new-upstream.test',
    );
  });

  it('does not persist when connectivity fails', async () => {
    const prisma = makePrisma();
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const service = new UpstreamConfigService(prisma);

    await expect(
      service.updateUrl('http://offline-upstream.test'),
    ).rejects.toThrow('Cấu hình hiện tại vẫn được giữ nguyên');
    expect(
      (prisma.wafConfiguration.upsert as jest.Mock).mock.calls.length,
    ).toBe(0);
  });
});
