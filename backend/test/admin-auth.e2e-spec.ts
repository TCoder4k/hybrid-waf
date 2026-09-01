import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcryptjs';
import type { AdminModule as AdminModuleType } from '../src/modules/admin/admin.module';
import type { PrismaService as PrismaServiceType } from '../src/database/prisma.service';

// JwtModule.register(...) reads process.env.JWT_SECRET at import time, so
// these must be set before AdminModule/AuthModule are ever imported —
// AdminModule is imported dynamically below, after this runs.
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-only-secret';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '30m';

const KNOWN_USERNAME = 'alice';
const KNOWN_PASSWORD = 'correct-horse-battery-staple';

const sampleEvent = {
  id: 'event-1',
  timestamp: new Date('2026-01-01T00:00:00.000Z'),
  sourceIp: '203.0.113.9',
  method: 'GET',
  endpoint: '/api/hello',
  attackType: 'SQL_INJECTION',
  ruleResult: { classification: 'SQL_INJECTION', detected: true },
  mlResult: { status: 'UNAVAILABLE' },
  confidence: null,
  decision: 'BLOCK',
  requestMeta: { endpoint: '/api/hello', queryParams: {}, pathParams: {} },
};

describe('Admin Auth + API (e2e)', () => {
  let app: INestApplication<App>;
  const adminFindUnique = jest.fn();
  const securityEventFindMany = jest.fn();
  const securityEventCount = jest.fn();
  const securityEventFindUnique = jest.fn();
  const trafficMetricAggregate = jest.fn();
  const trafficMetricFindMany = jest.fn();
  const trafficMetricFindUnique = jest.fn();
  const queryRaw = jest.fn();
  const originalFetch = global.fetch;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(KNOWN_PASSWORD, 10);
    adminFindUnique.mockImplementation(
      ({ where: { username } }: { where: { username: string } }) =>
        Promise.resolve(
          username === KNOWN_USERNAME
            ? {
                id: 'admin-1',
                username: KNOWN_USERNAME,
                passwordHash,
                createdAt: new Date('2026-01-01T00:00:00.000Z'),
              }
            : null,
        ),
    );
    securityEventFindMany.mockResolvedValue([sampleEvent]);
    securityEventCount.mockResolvedValue(1);
    securityEventFindUnique.mockImplementation(
      ({ where: { id } }: { where: { id: string } }) =>
        Promise.resolve(id === 'event-1' ? sampleEvent : null),
    );
    trafficMetricAggregate.mockResolvedValue({
      _sum: {
        totalRequests: 6,
        allowedRequests: 3,
        blockedRequests: 3,
        sqlInjectionBlocks: 2,
        xssBlocks: 1,
      },
    });
    trafficMetricFindMany.mockResolvedValue([]);
    trafficMetricFindUnique.mockResolvedValue(null);
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const fakePrismaService = {
      onModuleInit: jest.fn().mockResolvedValue(undefined),
      onModuleDestroy: jest.fn().mockResolvedValue(undefined),
      admin: { findUnique: adminFindUnique },
      securityEvent: {
        findMany: securityEventFindMany,
        count: securityEventCount,
        findUnique: securityEventFindUnique,
      },
      trafficMetric: {
        aggregate: trafficMetricAggregate,
        findMany: trafficMetricFindMany,
        findUnique: trafficMetricFindUnique,
      },
      $queryRaw: queryRaw,
    };

    // require(), not import: process.env.JWT_SECRET above must be set
    // before auth.module.ts evaluates JwtModule.register(...), and a
    // static `import` would be hoisted above that assignment.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AdminModule } = require('../src/modules/admin/admin.module') as {
      AdminModule: typeof AdminModuleType;
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaService } = require('../src/database/prisma.service') as {
      PrismaService: typeof PrismaServiceType;
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AdminModule],
    })
      .overrideProvider(PrismaService)
      .useValue(fakePrismaService)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    // GET /admin/system-status pings ml-service/protected-api over real
    // `fetch` — stub it globally so those tests never make a real network
    // call. Other routes never touch `fetch`, so this is a safe default for
    // the whole file.
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  async function login(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: KNOWN_USERNAME, password: KNOWN_PASSWORD });
    return (res.body as { accessToken: string }).accessToken;
  }

  describe('POST /auth/login', () => {
    it('returns 200 + an access token for correct credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: KNOWN_USERNAME, password: KNOWN_PASSWORD });

      expect(res.status).toBe(200);
      expect(typeof (res.body as { accessToken: unknown }).accessToken).toBe(
        'string',
      );
    });

    it('returns 401 for a wrong password', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: KNOWN_USERNAME, password: 'wrong-password' });
      expect(res.status).toBe(401);
    });

    it('returns 401 for an unknown username', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'nobody', password: 'irrelevant' });
      expect(res.status).toBe(401);
    });

    it('returns 400 when username/password are missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: KNOWN_USERNAME });
      expect(res.status).toBe(400);
    });

    it('returns 503 when the database is unreachable', async () => {
      adminFindUnique.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: KNOWN_USERNAME, password: KNOWN_PASSWORD });
      expect(res.status).toBe(503);
    });
  });

  describe('GET /admin/events (authentication gate)', () => {
    it('returns 401 with no Authorization header', async () => {
      const res = await request(app.getHttpServer()).get('/admin/events');
      expect(res.status).toBe(401);
    });

    it('returns 401 with a malformed Authorization header', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/events')
        .set('Authorization', 'not-a-bearer-token');
      expect(res.status).toBe(401);
    });

    it('returns 401 with an invalid/garbage token', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/events')
        .set('Authorization', 'Bearer this.is.garbage');
      expect(res.status).toBe(401);
    });

    it('returns 200 with a valid token from /auth/login', async () => {
      const token = await login();
      const res = await request(app.getHttpServer())
        .get('/admin/events')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const body = res.body as {
        items: { country: string | null; countryCode: string | null }[];
        total: number;
      };
      expect(body.total).toBe(1);
      expect(body.items).toHaveLength(1);
      // sampleEvent's sourceIp (203.0.113.9) is a documentation-only range —
      // proves the enrichment step ran and degrades to null gracefully
      // rather than throwing or omitting the fields.
      expect(body.items[0].country).toBeNull();
      expect(body.items[0].countryCode).toBeNull();
    });

    it('returns 503 when the database is unreachable, even with a valid token', async () => {
      const token = await login();
      securityEventFindMany.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const res = await request(app.getHttpServer())
        .get('/admin/events')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(503);
    });

    it('accepts search/method/minConfidence/days and forwards them to the repository', async () => {
      const token = await login();
      securityEventFindMany.mockClear();

      const res = await request(app.getHttpServer())
        .get('/admin/events')
        .query({
          search: 'hello',
          method: 'get',
          minConfidence: '0.5',
          days: '7',
        })
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const [call] = securityEventFindMany.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      const where = call.where;
      expect(where).toMatchObject({
        method: 'GET',
        confidence: { gte: 0.5 },
        OR: [
          { endpoint: { contains: 'hello', mode: 'insensitive' } },
          { sourceIp: { contains: 'hello', mode: 'insensitive' } },
        ],
      });
      expect(where.timestamp).toBeDefined();
    });

    it('returns 400 for a minConfidence outside 0-1', async () => {
      const token = await login();
      const res = await request(app.getHttpServer())
        .get('/admin/events')
        .query({ minConfidence: '2' })
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
    });

    it('returns 400 for a "days" value above the 90-day cap', async () => {
      const token = await login();
      const res = await request(app.getHttpServer())
        .get('/admin/events')
        .query({ days: '91' })
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
    });
  });

  describe('GET /admin/events/:id', () => {
    it('returns 401 with no Authorization header', async () => {
      const res = await request(app.getHttpServer()).get(
        '/admin/events/event-1',
      );
      expect(res.status).toBe(401);
    });

    it('returns the event with a valid token', async () => {
      const token = await login();
      const res = await request(app.getHttpServer())
        .get('/admin/events/event-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const body = res.body as {
        id: string;
        country: string | null;
        countryCode: string | null;
      };
      expect(body.id).toBe('event-1');
      expect(body.country).toBeNull();
      expect(body.countryCode).toBeNull();
    });

    it('returns 404 for an unknown id with a valid token', async () => {
      const token = await login();
      const res = await request(app.getHttpServer())
        .get('/admin/events/does-not-exist')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /admin/stats', () => {
    it('returns 401 with no Authorization header', async () => {
      const res = await request(app.getHttpServer()).get('/admin/stats');
      expect(res.status).toBe(401);
    });

    it('returns the aggregated TrafficMetric totals with a valid token', async () => {
      const token = await login();
      const res = await request(app.getHttpServer())
        .get('/admin/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        totalRequests: 6,
        allowedRequests: 3,
        blockedRequests: 3,
        sqlInjectionBlocks: 2,
        xssBlocks: 1,
      });
    });

    it('returns 503 when the database is unreachable, even with a valid token', async () => {
      const token = await login();
      trafficMetricAggregate.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const res = await request(app.getHttpServer())
        .get('/admin/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(503);
    });

    it('passes a bucketStart range through to the aggregate query when days is given', async () => {
      const token = await login();

      const res = await request(app.getHttpServer())
        .get('/admin/stats?days=7')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const lastCall = trafficMetricAggregate.mock.calls[
        trafficMetricAggregate.mock.calls.length - 1
      ] as [Record<string, unknown>];
      expect(lastCall[0]).toHaveProperty('where');
    });

    it('rejects a non-integer days value with 400', async () => {
      const token = await login();

      const res = await request(app.getHttpServer())
        .get('/admin/stats?days=abc')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
    });

    it('rejects a days value above the 90-day cap with 400', async () => {
      const token = await login();

      const res = await request(app.getHttpServer())
        .get('/admin/stats?days=91')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
    });
  });

  describe('GET /admin/stats/trend', () => {
    it('returns 401 with no Authorization header', async () => {
      const res = await request(app.getHttpServer()).get('/admin/stats/trend');
      expect(res.status).toBe(401);
    });

    it('returns a zero-filled 7-point trend by default, with a valid token', async () => {
      const token = await login();

      const res = await request(app.getHttpServer())
        .get('/admin/stats/trend')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const body = res.body as { date: string }[];
      expect(body).toHaveLength(7);
    });

    it('returns 400 for an invalid days value', async () => {
      const token = await login();

      const res = await request(app.getHttpServer())
        .get('/admin/stats/trend?days=0')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
    });

    it('returns 503 when the database is unreachable', async () => {
      const token = await login();
      trafficMetricFindMany.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const res = await request(app.getHttpServer())
        .get('/admin/stats/trend')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(503);
    });
  });

  describe('GET /admin/stats/extra', () => {
    it('returns 401 with no Authorization header', async () => {
      const res = await request(app.getHttpServer()).get('/admin/stats/extra');
      expect(res.status).toBe(401);
    });

    it('returns malicious-IP/country/current-hour numbers with a valid token', async () => {
      const token = await login();
      securityEventFindMany.mockResolvedValueOnce([sampleEvent]);
      trafficMetricFindUnique.mockResolvedValueOnce({ totalRequests: 4 });

      const res = await request(app.getHttpServer())
        .get('/admin/stats/extra')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        maliciousIpCount: 1,
        countryCount: 0, // sampleEvent's IP is unresolvable (documentation range)
        requestsThisHour: 4,
      });
    });

    it('returns 503 when the database is unreachable', async () => {
      const token = await login();
      securityEventFindMany.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const res = await request(app.getHttpServer())
        .get('/admin/stats/extra')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(503);
    });
  });

  describe('GET /admin/system-status', () => {
    it('returns 401 with no Authorization header', async () => {
      const res = await request(app.getHttpServer()).get(
        '/admin/system-status',
      );
      expect(res.status).toBe(401);
    });

    it('returns 200 with every component up when DB + health pings succeed', async () => {
      const token = await login();

      const res = await request(app.getHttpServer())
        .get('/admin/system-status')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        wafEngine: 'up',
        mlService: 'up',
        protectedApi: 'up',
        database: 'up',
      });
    });

    it('returns 200 (not 503) with database "down" when the DB is unreachable', async () => {
      const token = await login();
      queryRaw.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const res = await request(app.getHttpServer())
        .get('/admin/system-status')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect((res.body as { database: string }).database).toBe('down');
    });
  });

  describe('GET /admin/system-info', () => {
    it('returns 401 with no Authorization header', async () => {
      const res = await request(app.getHttpServer()).get('/admin/system-info');
      expect(res.status).toBe(401);
    });

    it('returns version/environment/uptime/serverTime with a valid token', async () => {
      const token = await login();

      const res = await request(app.getHttpServer())
        .get('/admin/system-info')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const body = res.body as {
        version: string;
        environment: string;
        uptimeSeconds: number;
        serverTime: string;
      };
      expect(typeof body.version).toBe('string');
      expect(typeof body.environment).toBe('string');
      expect(typeof body.uptimeSeconds).toBe('number');
      expect(Number.isNaN(new Date(body.serverTime).getTime())).toBe(false);
    });
  });

  describe('GET /admin/me', () => {
    it('returns 401 with no Authorization header', async () => {
      const res = await request(app.getHttpServer()).get('/admin/me');
      expect(res.status).toBe(401);
    });

    it('returns the logged-in username with a valid token', async () => {
      const token = await login();

      const res = await request(app.getHttpServer())
        .get('/admin/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ username: KNOWN_USERNAME });
    });
  });
});
