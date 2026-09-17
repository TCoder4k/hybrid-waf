import { TokenBucketLimiter } from './token-bucket';

describe('TokenBucketLimiter', () => {
  it('allows up to `burst` requests immediately, then rejects', () => {
    const limiter = new TokenBucketLimiter({ ratePerSecond: 1, burst: 3 });
    const now = 0;

    expect(limiter.consume('a', now).allowed).toBe(true);
    expect(limiter.consume('a', now).allowed).toBe(true);
    expect(limiter.consume('a', now).allowed).toBe(true);
    expect(limiter.consume('a', now).allowed).toBe(false);
  });

  it('refills tokens proportionally to elapsed time', () => {
    const limiter = new TokenBucketLimiter({ ratePerSecond: 2, burst: 1 });

    expect(limiter.consume('a', 0).allowed).toBe(true);
    expect(limiter.consume('a', 100).allowed).toBe(false); // only 0.2 tokens refilled
    expect(limiter.consume('a', 500).allowed).toBe(true); // 1s elapsed since bucket creation -> full refill, capped at burst=1
  });

  it('never refills above the configured burst size', () => {
    const limiter = new TokenBucketLimiter({ ratePerSecond: 100, burst: 2 });

    limiter.consume('a', 0);
    limiter.consume('a', 0);
    // A huge time jump should still cap the bucket at `burst`, not let it
    // accumulate unboundedly.
    expect(limiter.consume('a', 1_000_000).allowed).toBe(true);
    expect(limiter.consume('a', 1_000_000).allowed).toBe(true);
    expect(limiter.consume('a', 1_000_000).allowed).toBe(false);
  });

  it('reports a retryAfterMs that would actually produce an allowed request', () => {
    const limiter = new TokenBucketLimiter({ ratePerSecond: 5, burst: 1 });
    limiter.consume('a', 0);

    const rejected = limiter.consume('a', 0);
    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterMs).toBeGreaterThan(0);

    const retryAt = rejected.retryAfterMs;
    expect(limiter.consume('a', retryAt).allowed).toBe(true);
  });

  it('tracks separate buckets per key, independent of each other', () => {
    const limiter = new TokenBucketLimiter({ ratePerSecond: 1, burst: 1 });

    expect(limiter.consume('ip-1', 0).allowed).toBe(true);
    expect(limiter.consume('ip-1', 0).allowed).toBe(false);
    expect(limiter.consume('ip-2', 0).allowed).toBe(true);
  });

  describe('sweep', () => {
    it('removes buckets idle longer than maxIdleMs and reports how many', () => {
      const limiter = new TokenBucketLimiter({ ratePerSecond: 1, burst: 1 });
      limiter.consume('stale', 0);
      limiter.consume('fresh', 9_000);

      const removed = limiter.sweep(5_000, 10_000);

      expect(removed).toBe(1);
      expect(limiter.size).toBe(1);
    });

    it('leaves recently-touched buckets alone', () => {
      const limiter = new TokenBucketLimiter({ ratePerSecond: 1, burst: 1 });
      limiter.consume('recent', 9_500);

      const removed = limiter.sweep(5_000, 10_000);

      expect(removed).toBe(0);
      expect(limiter.size).toBe(1);
    });
  });
});
