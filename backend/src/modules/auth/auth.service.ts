import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Admin } from '@prisma/client';
import { AdminRepository } from './admin.repository';

// A bcrypt hash of an arbitrary, never-used password. Compared against on an
// unknown username so login takes the same time whether or not the username
// exists — otherwise response latency would leak which usernames are valid.
const DUMMY_PASSWORD_HASH =
  '$2b$10$xgV5NZPvfn1haDJr8q/AIul/GiTyCgGsZnzhvuHEC/D41lKD/HPpe';

export interface JwtPayload {
  sub: string;
  username: string;
}

// JWT admin auth per docs/architecture.md §13 (ADR-5, approved): stateless,
// short-lived access tokens, no server-side session/blacklist. Logout is a
// client-side token discard only — there is deliberately no logout endpoint
// here, since there is nothing server-side to revoke.
@Injectable()
export class AuthService {
  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly jwtService: JwtService,
  ) {}

  async login(
    username: string,
    password: string,
  ): Promise<{ accessToken: string }> {
    let admin: Admin | null;
    try {
      admin = await this.adminRepository.findByUsername(username);
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }

    const passwordMatches = await bcrypt.compare(
      password,
      admin?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!admin || !passwordMatches) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const payload: JwtPayload = { sub: admin.id, username: admin.username };
    const accessToken = await this.jwtService.signAsync(payload);
    return { accessToken };
  }

  async changePassword(
    adminId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const admin = await this.adminRepository.findById(adminId);
    if (
      !admin ||
      !(await bcrypt.compare(currentPassword, admin.passwordHash))
    ) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.adminRepository.updatePassword(adminId, passwordHash);
  }
}
