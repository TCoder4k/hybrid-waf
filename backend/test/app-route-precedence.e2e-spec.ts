import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import type { AppModule as AppModuleType } from '../src/app.module';
import type { PrismaService as PrismaServiceType } from '../src/database/prisma.service';

// JwtModule.register(...) (inside AuthModule, transitively imported by
// AppModule) reads process.env.JWT_SECRET at import time — must be set
// before AppModule is required below.
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-only-secret';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '30m';
// Deliberately unreachable — proves the WAF's catch-all still handles
// non-admin/non-auth paths (502) without needing a real Protected API.
process.env.PROTECTED_API_URL = 'http://127.0.0.1:1';

// Regression guard for the bug found live in Phase 9: WafModule's
// `@All('*')` catch-all was registered before AuthModule/AdminModule, so
// `/auth/login` and `/admin/*` were silently swallowed by the WAF proxy
// instead of ever reaching AuthController/AdminController. This boots the
// *real* AppModule (not a single feature module in isolation, like the
// other e2e suites do) specifically to catch a route-precedence regression
// that only shows up when every module is wired together.
describe('App route precedence (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../src/app.module') as {
      AppModule: typeof AppModuleType;
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaService } = require('../src/database/prisma.service') as {
      PrismaService: typeof PrismaServiceType;
    };

    const fakePrismaService = {
      onModuleInit: jest.fn().mockResolvedValue(undefined),
      onModuleDestroy: jest.fn().mockResolvedValue(undefined),
      admin: { findUnique: jest.fn().mockResolvedValue(null) },
      securityEvent: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
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

  it('routes POST /auth/login to AuthController, not the WAF proxy', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'nobody', password: 'wrong' });

    // 401 (AuthController rejected the credentials) proves the request was
    // handled by AuthController. A swallowed request would instead hit the
    // WAF's forward() with an unreachable Protected API and come back 502.
    expect(res.status).toBe(401);
  });

  it('routes GET /admin/events to AdminController, not the WAF proxy', async () => {
    const res = await request(app.getHttpServer()).get('/admin/events');

    // 401 (JwtAuthGuard rejected the missing token) proves AdminController's
    // guard ran, not the WAF proxy.
    expect(res.status).toBe(401);
  });

  it('still routes everything else through the WAF proxy', async () => {
    const res = await request(app.getHttpServer()).get('/api/hello');

    // 502 proves WafController's catch-all is still intact for non-admin
    // paths — it tried to forward to the (deliberately unreachable)
    // Protected API and got a connection failure, per its documented
    // failure-handling behavior.
    expect(res.status).toBe(502);
  });
});
