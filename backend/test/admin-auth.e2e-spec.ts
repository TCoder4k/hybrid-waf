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

    const fakePrismaService = {
      onModuleInit: jest.fn().mockResolvedValue(undefined),
      onModuleDestroy: jest.fn().mockResolvedValue(undefined),
      admin: { findUnique: adminFindUnique },
      securityEvent: {
        findMany: securityEventFindMany,
        count: securityEventCount,
        findUnique: securityEventFindUnique,
      },
      trafficMetric: { aggregate: trafficMetricAggregate },
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
      const body = res.body as { items: unknown[]; total: number };
      expect(body.total).toBe(1);
      expect(body.items).toHaveLength(1);
    });

    it('returns 503 when the database is unreachable, even with a valid token', async () => {
      const token = await login();
      securityEventFindMany.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const res = await request(app.getHttpServer())
        .get('/admin/events')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(503);
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
      expect((res.body as { id: string }).id).toBe('event-1');
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
  });
});
