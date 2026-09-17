import { ConcurrencyLimiter } from './concurrency-limiter';

describe('ConcurrencyLimiter', () => {
  it('allows up to maxConcurrent acquisitions, then rejects', () => {
    const limiter = new ConcurrencyLimiter(2);

    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
    expect(limiter.current).toBe(2);
  });

  it('frees a slot on release, allowing a new acquisition', () => {
    const limiter = new ConcurrencyLimiter(1);

    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);

    limiter.release();

    expect(limiter.current).toBe(0);
    expect(limiter.tryAcquire()).toBe(true);
  });

  it('never goes negative on an extra release', () => {
    const limiter = new ConcurrencyLimiter(1);

    limiter.release();
    limiter.release();

    expect(limiter.current).toBe(0);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
  });
});
