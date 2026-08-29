import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/database/prisma.service';
import { WafModule } from '../src/modules/waf/waf.module';

// Stands in for protected-api so this test needs no external process/DB —
// see docs/architecture.md §4 for the flow being proven here. Phase 8 wired
// SecurityEvent logging into the BLOCK path, and Phase 9A wired
// non-blocking Traffic Metrics into every path, both of which pull in
// DatabaseModule transitively; PrismaService is overridden with a fake so
// this suite still needs no live Postgres, while still letting us assert
// on what would have been written.
describe('WAF Proxy (e2e)', () => {
  let app: INestApplication<App>;
  let fakeProtectedApi: http.Server;
  const securityEventCreate = jest.fn().mockResolvedValue({});
  const executeRaw = jest.fn().mockResolvedValue(undefined);
  const fakePrismaService = {
    onModuleInit: jest.fn().mockResolvedValue(undefined),
    onModuleDestroy: jest.fn().mockResolvedValue(undefined),
    securityEvent: { create: securityEventCreate },
    $executeRaw: executeRaw,
  };

  beforeAll(async () => {
    fakeProtectedApi = http.createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/api/hello') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ message: 'Hello from the Protected API' }));
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: 'not found' }));
    });
    await new Promise<void>((resolve) => fakeProtectedApi.listen(0, resolve));
    const { port } = fakeProtectedApi.address() as AddressInfo;
    process.env.PROTECTED_API_URL = `http://127.0.0.1:${port}`;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [WafModule],
    })
      .overrideProvider(PrismaService)
      .useValue(fakePrismaService)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve) =>
      fakeProtectedApi.close(() => resolve()),
    );
  });

  afterEach(() => {
    securityEventCreate.mockClear();
    securityEventCreate.mockResolvedValue({});
    executeRaw.mockClear();
    executeRaw.mockResolvedValue(undefined);
  });

  it('forwards a request, relays the Protected API response, and records traffic metrics', async () => {
    const res = await request(app.getHttpServer()).get('/api/hello');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Hello from the Protected API' });
    expect(securityEventCreate).not.toHaveBeenCalled();
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it('relays a Protected API 404 verbatim', async () => {
    const res = await request(app.getHttpServer()).get('/api/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('returns 403, logs a SecurityEvent, records traffic metrics, and never reaches Protected API when the rule engine detects SQL Injection', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/hello?id=1 OR 1=1',
    );
    expect(res.status).toBe(403);
    const body = res.body as {
      statusCode: number;
      error: string;
      message: string;
    };
    expect(body.statusCode).toBe(403);
    expect(body.error).toBe('Forbidden');
    expect(body.message).toContain('SQL_INJECTION');
    expect(securityEventCreate).toHaveBeenCalledTimes(1);
    expect(securityEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attackType: 'SQL_INJECTION',
          decision: 'BLOCK',
        }) as unknown,
      }),
    );
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it('still returns 403 when the SecurityEvent write fails (DB outage must not weaken the BLOCK decision)', async () => {
    securityEventCreate.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const res = await request(app.getHttpServer()).get(
      '/api/hello?id=1 OR 1=1',
    );

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ statusCode: 403, error: 'Forbidden' });
  });

  it('still returns 200 immediately when the traffic-metrics write fails (must not block or weaken ALLOW)', async () => {
    executeRaw.mockRejectedValueOnce(new Error('metrics DB unreachable'));

    const res = await request(app.getHttpServer()).get('/api/hello');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Hello from the Protected API' });
    // Let the fire-and-forgotten rejection settle so it doesn't leak into
    // the next test as an unhandled rejection.
    await new Promise((resolve) => process.nextTick(resolve));
  });

  it('still returns 403 immediately when the traffic-metrics write fails (must not block or weaken BLOCK)', async () => {
    executeRaw.mockRejectedValueOnce(new Error('metrics DB unreachable'));

    const res = await request(app.getHttpServer()).get(
      '/api/hello?id=1 OR 1=1',
    );

    expect(res.status).toBe(403);
    await new Promise((resolve) => process.nextTick(resolve));
  });

  it('returns 502 Bad Gateway once the Protected API becomes unreachable', async () => {
    await new Promise<void>((resolve) =>
      fakeProtectedApi.close(() => resolve()),
    );

    const res = await request(app.getHttpServer()).get('/api/hello');
    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ statusCode: 502, error: 'Bad Gateway' });
  });
});
