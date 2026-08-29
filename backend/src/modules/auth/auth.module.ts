import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { DatabaseModule } from '../../database/database.module';
import { AdminRepository } from './admin.repository';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

const jwtModule = JwtModule.register({
  secret: process.env.JWT_SECRET,
  signOptions: {
    expiresIn: (process.env.JWT_EXPIRES_IN as StringValue | undefined) ?? '30m',
  },
});

// Admin auth (Phase 9, ADR-5, docs/architecture.md §13): JWT login +
// the guard every /admin/* route depends on. JwtModule is re-exported
// alongside JwtAuthGuard so a module that only imports AuthModule (like
// AdminModule) can use the guard via `@UseGuards(JwtAuthGuard)` — Nest
// resolves a class-referenced guard's own dependencies (JwtService) through
// the *consuming* module's injector, not the guard's home module.
@Module({
  imports: [DatabaseModule, jwtModule],
  controllers: [AuthController],
  providers: [AdminRepository, AuthService, JwtAuthGuard],
  exports: [AdminRepository, JwtAuthGuard, jwtModule],
})
export class AuthModule {}
