// Pure, in-memory token-bucket limiter (Phase P3, docs/architecture.md §22,
// ADR-9). Deliberately not Redis-backed — see ADR-9 for why in-memory is
// correct (not just simpler) under this project's current single-instance
// deployment, and what the failure-mode policy will be if that ever
// changes. No timers inside this class — refill is computed lazily from
// elapsed time on each `consume()` call, which makes this trivially
// testable with an injected clock and imposes zero background CPU cost.
export interface TokenBucketOptions {
  // Sustained rate once the burst allowance is exhausted.
  ratePerSecond: number;
  // Max tokens a bucket can hold — the size of an allowed burst above the
  // sustained rate.
  burst: number;
}

export interface ConsumeResult {
  allowed: boolean;
  // Only meaningful when `allowed` is false — how long until at least one
  // token would be available again.
  retryAfterMs: number;
}

interface Bucket {
  tokens: number;
  lastRefillAt: number;
}

export class TokenBucketLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly options: TokenBucketOptions) {}

  consume(key: string, now: number = Date.now()): ConsumeResult {
    const bucket = this.buckets.get(key) ?? {
      tokens: this.options.burst,
      lastRefillAt: now,
    };

    const elapsedSeconds = Math.max(0, now - bucket.lastRefillAt) / 1000;
    const refilled = Math.min(
      this.options.burst,
      bucket.tokens + elapsedSeconds * this.options.ratePerSecond,
    );

    if (refilled >= 1) {
      this.buckets.set(key, { tokens: refilled - 1, lastRefillAt: now });
      return { allowed: true, retryAfterMs: 0 };
    }

    this.buckets.set(key, { tokens: refilled, lastRefillAt: now });
    const deficit = 1 - refilled;
    const retryAfterMs = Math.ceil(
      (deficit / this.options.ratePerSecond) * 1000,
    );
    return { allowed: false, retryAfterMs };
  }

  // Bounds the per-IP map's memory under a real attack from many distinct
  // IPs — called periodically by RateLimitGuard's own interval, not from
  // consume() itself (keeping consume() free of side effects beyond the
  // key it was called for makes it simpler to reason about and test).
  sweep(maxIdleMs: number, now: number = Date.now()): number {
    let removed = 0;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastRefillAt > maxIdleMs) {
        this.buckets.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  get size(): number {
    return this.buckets.size;
  }
}
