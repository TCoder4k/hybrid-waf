import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/database/prisma.service';
import { DatabaseModule } from '../src/database/database.module';
import { AdminRepository } from '../src/modules/auth/admin.repository';
import { SecurityEventsModule } from '../src/modules/security-events/security-events.module';
import { AuthModule } from '../src/modules/auth/auth.module';
import { SecurityEventRepository } from '../src/modules/security-events/security-event.repository';

// Requires a reachable PostgreSQL with the Phase 2 migration applied
// (DATABASE_URL from backend/.env — see backend/.env.example).
describe('Database (e2e)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let adminRepository: AdminRepository;
  let securityEventRepository: SecurityEventRepository;

  const testUsername = `test-admin-${Date.now()}`;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule, AuthModule, SecurityEventsModule],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    adminRepository = moduleRef.get(AdminRepository);
    securityEventRepository = moduleRef.get(SecurityEventRepository);

    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.admin.deleteMany({ where: { username: testUsername } });
    await prisma.securityEvent.deleteMany({
      where: { sourceIp: '203.0.113.9' },
    });
    await prisma.$disconnect();
    await moduleRef.close();
  });

  it('creates and reads back an Admin row', async () => {
    const created = await adminRepository.create({
      username: testUsername,
      passwordHash: 'not-a-real-hash',
    });
    expect(created.id).toBeDefined();

    const found = await adminRepository.findByUsername(testUsername);
    expect(found?.username).toBe(testUsername);
  });

  it('creates and reads back a SecurityEvent row', async () => {
    const created = await securityEventRepository.create({
      sourceIp: '203.0.113.9',
      method: 'GET',
      endpoint: '/api/hello',
      attackType: 'SQL_INJECTION',
      ruleResult: {
        classification: 'SQL_INJECTION',
        detected: true,
        confidence: null,
        reason: 'rule match',
      },
      mlResult: {
        status: 'UNAVAILABLE',
        classification: null,
        confidence: null,
        reason: 'ml service unavailable',
      },
      confidence: null,
      decision: 'BLOCK',
      requestMeta: {
        queryParams: { id: '1 OR 1=1' },
        pathParams: {},
        endpoint: '/api/hello',
      },
    });
    expect(created.id).toBeDefined();

    const found = await securityEventRepository.findById(created.id);
    expect(found?.attackType).toBe('SQL_INJECTION');
    expect(found?.decision).toBe('BLOCK');
  });
});
