import { Injectable } from '@nestjs/common';
import { Admin, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

// Persistence primitives only — login/JWT logic is wired in Phase 9.
@Injectable()
export class AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.AdminCreateInput): Promise<Admin> {
    return this.prisma.admin.create({ data });
  }

  findByUsername(username: string): Promise<Admin | null> {
    return this.prisma.admin.findUnique({ where: { username } });
  }
}
