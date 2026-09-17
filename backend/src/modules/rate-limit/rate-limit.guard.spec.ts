import { ExecutionContext, HttpException } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitRecorder } from './rate-limit-recorder.service';

function restoreEnv(key: string, original: string | undefined) {
  if (original === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = original;
  }
}

function makeContext(ip: string) {
  const req = { ip, headers: {} } as unknown as Request;
  const res = new EventEmitter() as unknown as Response;
  (res as unknown as { setHeader: jest.Mock }).setHeader = jest.fn();
  const context = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
  return { context, req, res };
}

describe('RateLimitGuard', () => {
  const envKeys = [
    'RATE_LIMIT_PER_IP_RPS',
    'RATE_LIMIT_PER_IP_BURST',
    'RATE_LIMIT_GLOBAL_RPS',
    'RATE_LIMIT_GLOBAL_BURST',
    'RATE_LIMIT_MAX_CONCURRENCY',
  ];
  const originalEnv = new Map(envKeys.map((k) => [k, process.env[k]]));
  let recordBlock: jest.Mock;
  let recorder: RateLimitRecorder;

  beforeEach(() => {
    recordBlock = jest.fn();
    recorder = { recordBlock } as unknown as RateLimitRecorder;
  });

  afterEach(() => {
    for (const key of envKeys) restoreEnv(key, originalEnv.get(key));
  });

  function makeGuard(overrides: Record<string, string>) {
    for (const [key, value] of Object.entries(overrides)) {
      process.env[key] = value;
    }
    const guard = new RateLimitGuard(recorder);
    guard.onModuleDestroy();
    return guard;
  }

  it('allows a request within the per-IP and global limits', () => {
    const guard = makeGuard({
      RATE_LIMIT_PER_IP_RPS: '10',
      RATE_LIMIT_PER_IP_BURST: '10',
      RATE_LIMIT_GLOBAL_RPS: '100',
      RATE_LIMIT_GLOBAL_BURST: '100',
      RATE_LIMIT_MAX_CONCURRENCY: '10',
    });
    const { context } = makeContext('203.0.113.9');

    expect(guard.canActivate(context)).toBe(true);
    expect(recordBlock).not.toHaveBeenCalled();
  });

  it('rejects with 429 + Retry-After once the per-IP burst is exhausted, and records the block', () => {
    const guard = makeGuard({
      RATE_LIMIT_PER_IP_RPS: '1',
      RATE_LIMIT_PER_IP_BURST: '1',
      RATE_LIMIT_GLOBAL_RPS: '100',
      RATE_LIMIT_GLOBAL_BURST: '100',
      RATE_LIMIT_MAX_CONCURRENCY: '10',
    });
    const { context, res } = makeContext('203.0.113.9');

    expect(guard.canActivate(context)).toBe(true);
    expect(() => guard.canActivate(context)).toThrow(HttpException);

    try {
      guard.canActivate(context);
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
      expect((error as HttpException).getResponse()).toMatchObject({
        statusCode: 429,
      });
    }

    expect(
      (res as unknown as { setHeader: jest.Mock }).setHeader,
    ).toHaveBeenCalledWith('Retry-After', expect.any(String));
    expect(recordBlock).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('rate limit exceeded'),
    );
  });

  it('normalizes an IPv4-mapped IPv6 address before bucketing (does not double the effective limit)', () => {
    const guard = makeGuard({
      RATE_LIMIT_PER_IP_RPS: '1',
      RATE_LIMIT_PER_IP_BURST: '1',
      RATE_LIMIT_GLOBAL_RPS: '100',
      RATE_LIMIT_GLOBAL_BURST: '100',
      RATE_LIMIT_MAX_CONCURRENCY: '10',
    });
    const { context: plain } = makeContext('203.0.113.9');
    const { context: mapped } = makeContext('::ffff:203.0.113.9');

    expect(plain !== mapped).toBe(true);
    expect(guard.canActivate(plain)).toBe(true);
    expect(() => guard.canActivate(mapped)).toThrow(HttpException);
  });

  it('rejects once the global burst is exhausted, even from different IPs', () => {
    const guard = makeGuard({
      RATE_LIMIT_PER_IP_RPS: '100',
      RATE_LIMIT_PER_IP_BURST: '100',
      RATE_LIMIT_GLOBAL_RPS: '1',
      RATE_LIMIT_GLOBAL_BURST: '1',
      RATE_LIMIT_MAX_CONCURRENCY: '10',
    });

    expect(guard.canActivate(makeContext('203.0.113.1').context)).toBe(true);
    expect(() => guard.canActivate(makeContext('203.0.113.2').context)).toThrow(
      HttpException,
    );
  });

  it('rejects once max concurrency is reached, and frees a slot on response finish', () => {
    const guard = makeGuard({
      RATE_LIMIT_PER_IP_RPS: '100',
      RATE_LIMIT_PER_IP_BURST: '100',
      RATE_LIMIT_GLOBAL_RPS: '100',
      RATE_LIMIT_GLOBAL_BURST: '100',
      RATE_LIMIT_MAX_CONCURRENCY: '1',
    });
    const first = makeContext('203.0.113.9');
    const second = makeContext('203.0.113.9');

    expect(guard.canActivate(first.context)).toBe(true);
    expect(() => guard.canActivate(second.context)).toThrow(HttpException);

    // Simulate the first request's response completing.
    (first.res as unknown as EventEmitter).emit('finish');

    expect(guard.canActivate(second.context)).toBe(true);
  });
});
