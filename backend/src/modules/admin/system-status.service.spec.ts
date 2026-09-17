import { PrismaService } from '../../database/prisma.service';
import { SystemStatusService } from './system-status.service';
import { resolveUpstreamUrl } from '../../common/upstream-config.util';

// Node coerces `process.env.X = undefined` to the literal string
// "undefined" rather than deleting it — restoring an originally-unset var
// this way would leak a bogus value into every test file that runs after
// this one in the same Jest worker process. Delete instead when there was
// nothing there to begin with.
function restoreEnv(key: string, original: string | undefined) {
  if (original === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = original;
  }
}

describe('SystemStatusService', () => {
  const originalFetch = global.fetch;
  const originalMlUrl = process.env.ML_SERVICE_URL;
  const originalUpstreamUrl = process.env.UPSTREAM_URL;
  const originalApiUrl = process.env.PROTECTED_API_URL;

  afterEach(() => {
    global.fetch = originalFetch;
    restoreEnv('ML_SERVICE_URL', originalMlUrl);
    restoreEnv('UPSTREAM_URL', originalUpstreamUrl);
    restoreEnv('PROTECTED_API_URL', originalApiUrl);
  });

  function makePrisma(queryRaw: jest.Mock): PrismaService {
    return { $queryRaw: queryRaw } as unknown as PrismaService;
  }

  function makeService(queryRaw: jest.Mock): SystemStatusService {
    return new SystemStatusService(makePrisma(queryRaw), {
      getActiveUrl: jest.fn(() => resolveUpstreamUrl()),
    } as never);
  }

  it('reports everything up when the DB query and both health pings succeed', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    const queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const service = makeService(queryRaw);

    const status = await service.getStatus();
    expect(status.wafEngine).toEqual({ status: 'up', latencyMs: null });
    expect(status.mlService.status).toBe('up');
    expect(status.upstream.status).toBe('up');
    expect(status.database.status).toBe('up');
    expect(status.checkedAt).toEqual(expect.any(String));
  });

  it('reports database down when $queryRaw throws, without affecting the other checks', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    const queryRaw = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const service = makeService(queryRaw);

    const status = await service.getStatus();
    expect(status.wafEngine.status).toBe('up');
    expect(status.mlService.status).toBe('up');
    expect(status.upstream.status).toBe('up');
    expect(status.database).toEqual({ status: 'down', latencyMs: null });
  });

  it('reports mlService down when its health ping fails, upstream unaffected', async () => {
    process.env.ML_SERVICE_URL = 'http://ml.test';
    process.env.UPSTREAM_URL = 'http://api.test';
    global.fetch = jest.fn((url: string) =>
      Promise.resolve({ ok: !url.startsWith('http://ml.test') }),
    ) as unknown as typeof fetch;
    const queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const service = makeService(queryRaw);

    const status = await service.getStatus();
    expect(status.wafEngine.status).toBe('up');
    expect(status.mlService.status).toBe('down');
    expect(status.upstream.status).toBe('up');
    expect(status.database.status).toBe('up');
  });

  it('resolves upstream status via UPSTREAM_URL, falling back to PROTECTED_API_URL (Phase P1 backward compatibility)', async () => {
    delete process.env.UPSTREAM_URL;
    process.env.PROTECTED_API_URL = 'http://legacy-api.test';
    global.fetch = jest.fn((url: string) =>
      Promise.resolve({ ok: url.startsWith('http://legacy-api.test') }),
    ) as unknown as typeof fetch;
    const queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const service = makeService(queryRaw);

    const status = await service.getStatus();
    expect(status.upstream.status).toBe('up');
  });

  it('reports upstream down (never throws) when the resolved upstream URL is malformed', async () => {
    process.env.UPSTREAM_URL = 'not-a-valid-url';
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    const queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const service = makeService(queryRaw);

    const status = await service.getStatus();
    expect(status.upstream).toEqual({ status: 'down', latencyMs: null });
  });

  it('wafEngine is always up (answering the request proves it)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('down'));
    const queryRaw = jest.fn().mockRejectedValue(new Error('down'));
    const service = makeService(queryRaw);

    const status = await service.getStatus();
    expect(status.wafEngine.status).toBe('up');
  });
});
