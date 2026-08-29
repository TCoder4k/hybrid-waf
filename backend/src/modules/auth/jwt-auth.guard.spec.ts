import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { JwtAuthGuard } from './jwt-auth.guard';

function makeContext(headers: Record<string, string>): {
  context: ExecutionContext;
  request: Request & { admin?: unknown };
} {
  const request = { headers } as unknown as Request & { admin?: unknown };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('JwtAuthGuard', () => {
  it('rejects a request with no Authorization header', async () => {
    const jwtService = { verifyAsync: jest.fn() } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwtService);
    const { context } = makeContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a malformed Authorization header (missing "Bearer " prefix)', async () => {
    const jwtService = { verifyAsync: jest.fn() } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwtService);
    const { context } = makeContext({ authorization: 'some-token' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an invalid or expired token', async () => {
    const verifyAsync = jest.fn().mockRejectedValue(new Error('jwt expired'));
    const jwtService = { verifyAsync } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwtService);
    const { context } = makeContext({ authorization: 'Bearer bad-token' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('allows a valid token through and attaches the decoded payload to the request', async () => {
    const payload = { sub: 'admin-1', username: 'alice' };
    const verifyAsync = jest.fn().mockResolvedValue(payload);
    const jwtService = { verifyAsync } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwtService);
    const { context, request } = makeContext({
      authorization: 'Bearer good-token',
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(verifyAsync).toHaveBeenCalledWith('good-token');
    expect(request.admin).toEqual(payload);
  });
});
