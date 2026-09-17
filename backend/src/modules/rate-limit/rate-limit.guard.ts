import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConcurrencyLimiter } from './concurrency-limiter';
import { normalizeIp } from './ip-normalize.util';
import { loadRateLimitConfig } from './rate-limit.config';
import { RateLimitRecorder } from './rate-limit-recorder.service';
import { TokenBucketLimiter } from './token-bucket';

const GLOBAL_BUCKET_KEY = 'global';
// How long a per-IP bucket can sit untouched before it's swept — bounds
// memory under a real attack from many distinct IPs. Not configurable via
// env; this is an internal implementation detail, not a tuning knob a
// deployment needs to reach for.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const SWEEP_MAX_IDLE_MS = 10 * 60 * 1000;

// L7 rate limiting / DoS protection (Phase P3, docs/architecture.md §22,
// ADR-9). Applied to WafController only (see waf.module.ts), NOT as a
// global APP_GUARD — /auth/login and /admin/* have their own separate
// auth/authorization concerns and are not part of this gate. Runs before
// WafService.handle() is ever invoked (Nest guards run before the route
// handler), so a rejected request never reaches
// RequestNormalizerService/Rule+ML detection at all — the cheapest possible
// check happens first, which matters specifically because ML detection is
// this pipeline's expensive, serialized resource (see the amplification
// note in §22).
//
// Checked in order: global rate (protects total system capacity against
// many-IP floods), per-IP rate (fairness), concurrency (bounds requests
// actually in flight through the expensive part of the pipeline). All
// three are cheap in-memory checks — see ADR-9 for why in-memory (not
// Redis) is correct under this project's current single-instance
// deployment.
@Injectable()
export class RateLimitGuard implements CanActivate, OnModuleDestroy {
  private readonly globalBucket: TokenBucketLimiter;
  private readonly perIpBucket: TokenBucketLimiter;
  private readonly concurrency: ConcurrencyLimiter;
  private readonly sweepHandle: ReturnType<typeof setInterval>;

  constructor(private readonly recorder: RateLimitRecorder) {
    const config = loadRateLimitConfig();
    this.globalBucket = new TokenBucketLimiter({
      ratePerSecond: config.globalRatePerSecond,
      burst: config.globalBurst,
    });
    this.perIpBucket = new TokenBucketLimiter({
      ratePerSecond: config.perIpRatePerSecond,
      burst: config.perIpBurst,
    });
    this.concurrency = new ConcurrencyLimiter(config.maxConcurrency);

    this.sweepHandle = setInterval(() => {
      this.perIpBucket.sweep(SWEEP_MAX_IDLE_MS);
    }, SWEEP_INTERVAL_MS);
    this.sweepHandle.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweepHandle);
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    const global = this.globalBucket.consume(GLOBAL_BUCKET_KEY);
    if (!global.allowed) {
      this.reject(req, res, global.retryAfterMs, 'global rate limit exceeded');
      return false;
    }

    const ip = normalizeIp(req.ip ?? '');
    const perIp = this.perIpBucket.consume(ip);
    if (!perIp.allowed) {
      this.reject(
        req,
        res,
        perIp.retryAfterMs,
        `rate limit exceeded for ${ip || 'unknown client'}`,
      );
      return false;
    }

    if (!this.concurrency.tryAcquire()) {
      this.reject(req, res, 1000, 'too many concurrent requests');
      return false;
    }

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      this.concurrency.release();
    };
    res.once('finish', release);
    res.once('close', release);

    return true;
  }

  private reject(
    req: Request,
    res: Response,
    retryAfterMs: number,
    reason: string,
  ): void {
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    res.setHeader('Retry-After', String(retryAfterSeconds));
    this.recorder.recordBlock(req, reason);
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        message: `Request blocked: ${reason}`,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
