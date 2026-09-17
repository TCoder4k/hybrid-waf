// Bounds how many requests the detection pipeline processes at once (Phase
// P3, docs/architecture.md §22). Complements the token buckets: a token
// bucket limits *rate over time*, this limits *how many are in flight right
// now* — the latter matters specifically because ML detection is the
// serialized, expensive resource (see the amplification note in §22), and
// an unbounded queue of "allowed but not yet processed" requests is itself
// a memory-exhaustion vector.
export class ConcurrencyLimiter {
  private inFlight = 0;

  constructor(private readonly maxConcurrent: number) {}

  tryAcquire(): boolean {
    if (this.inFlight >= this.maxConcurrent) {
      return false;
    }
    this.inFlight += 1;
    return true;
  }

  release(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
  }

  get current(): number {
    return this.inFlight;
  }
}
