import { truncateToHour } from './bucket.util';

describe('truncateToHour', () => {
  it('zeroes minutes, seconds, and milliseconds', () => {
    const input = new Date('2026-08-26T13:47:32.123Z');
    const result = truncateToHour(input);
    expect(result.toISOString()).toBe('2026-08-26T13:00:00.000Z');
  });

  it('is idempotent on an already-truncated hour', () => {
    const input = new Date('2026-08-26T13:00:00.000Z');
    expect(truncateToHour(input).toISOString()).toBe(
      '2026-08-26T13:00:00.000Z',
    );
  });

  it('does not mutate the input date', () => {
    const input = new Date('2026-08-26T13:47:32.123Z');
    const originalIso = input.toISOString();
    truncateToHour(input);
    expect(input.toISOString()).toBe(originalIso);
  });

  it('rolls over correctly across an hour boundary just before the top of the hour', () => {
    const input = new Date('2026-08-26T23:59:59.999Z');
    expect(truncateToHour(input).toISOString()).toBe(
      '2026-08-26T23:00:00.000Z',
    );
  });
});
