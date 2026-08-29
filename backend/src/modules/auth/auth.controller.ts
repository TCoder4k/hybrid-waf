import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { AuthService } from './auth.service';

// The only unauthenticated admin-facing route (docs/architecture.md §11).
// No logout endpoint: per ADR-5 there is nothing server-side to revoke —
// logout is a client-side token discard only.
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: unknown): Promise<{ accessToken: string }> {
    const { username, password } = parseLoginBody(body);
    return this.authService.login(username, password);
  }
}

function parseLoginBody(body: unknown): {
  username: string;
  password: string;
} {
  const record = (body ?? {}) as Record<string, unknown>;
  if (
    typeof record.username !== 'string' ||
    typeof record.password !== 'string' ||
    record.username.length === 0 ||
    record.password.length === 0
  ) {
    throw new BadRequestException('username and password are required');
  }
  return { username: record.username, password: record.password };
}
