import { PrismaService } from '../../database/prisma.service';
import { SystemStatusService } from './system-status.service';

describe('SystemStatusService', () => {
  const originalFetch = global.fetch;
  const originalMlUrl = process.env.ML_SERVICE_URL;
  const originalApiUrl = process.env.PROTECTED_API_URL;

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.ML_SERVICE_URL = originalMlUrl;
    process.env.PROTECTED_API_URL = originalApiUrl;
  });

  function makePrisma(queryRaw: jest.Mock): PrismaService {
    return { $queryRaw: queryRaw } as unknown as PrismaService;
  }

  it('reports everything up when the DB query and both health pings succeed', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    const queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const service = new SystemStatusService(makePrisma(queryRaw));

    const status = await service.getStatus();
    expect(status.wafEngine).toEqual({ status: 'up', latencyMs: null });
    expect(status.mlService.status).toBe('up');
    expect(status.protectedApi.status).toBe('up');
    expect(status.database.status).toBe('up');
    expect(status.checkedAt).toEqual(expect.any(String));
  });

  it('reports database down when $queryRaw throws, without affecting the other checks', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    const queryRaw = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const service = new SystemStatusService(makePrisma(queryRaw));

    const status = await service.getStatus();
    expect(status.wafEngine.status).toBe('up');
    expect(status.mlService.status).toBe('up');
    expect(status.protectedApi.status).toBe('up');
    expect(status.database).toEqual({ status: 'down', latencyMs: null });
  });

  it('reports mlService down when its health ping fails, protectedApi unaffected', async () => {
    process.env.ML_SERVICE_URL = 'http://ml.test';
    process.env.PROTECTED_API_URL = 'http://api.test';
    global.fetch = jest.fn((url: string) =>
      Promise.resolve({ ok: !url.startsWith('http://ml.test') }),
    ) as unknown as typeof fetch;
    const queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const service = new SystemStatusService(makePrisma(queryRaw));

    const status = await service.getStatus();
    expect(status.wafEngine.status).toBe('up');
    expect(status.mlService.status).toBe('down');
    expect(status.protectedApi.status).toBe('up');
    expect(status.database.status).toBe('up');
  });

  it('wafEngine is always up (answering the request proves it)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('down'));
    const queryRaw = jest.fn().mockRejectedValue(new Error('down'));
    const service = new SystemStatusService(makePrisma(queryRaw));

    const status = await service.getStatus();
    expect(status.wafEngine.status).toBe('up');
  });
});
