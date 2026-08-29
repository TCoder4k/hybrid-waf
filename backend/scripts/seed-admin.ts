import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

// One-time/idempotent admin provisioning (docs/architecture.md §13: "decide
// in Phase 9"). Deliberately a standalone script, not an HTTP endpoint —
// there is no registration API, since an open way to create Admin accounts
// would be a real vulnerability in a single-admin-role MVP.
async function main() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    throw new Error(
      'ADMIN_USERNAME and ADMIN_PASSWORD must be set (see backend/.env.example) to seed an admin.',
    );
  }

  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await prisma.admin.upsert({
      where: { username },
      update: { passwordHash },
      create: { username, passwordHash },
    });
    console.log(`Admin '${admin.username}' seeded (id=${admin.id}).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
