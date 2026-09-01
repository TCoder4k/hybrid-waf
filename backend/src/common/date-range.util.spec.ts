import { daysToRange } from './date-range.util';

describe('daysToRange', () => {
  it('starts at midnight UTC (days-1) days before now, ends at now', () => {
    const now = new Date('2026-08-31T16:08:32.000Z');
    const range = daysToRange(7, now);

    expect(range.to).toEqual(now);
    expect(range.from).toEqual(new Date('2026-08-25T00:00:00.000Z'));
  });

  it('keeps from/to on the same calendar day when days=1', () => {
    const now = new Date('2026-08-31T16:08:32.000Z');
    const range = daysToRange(1, now);

    expect(range.from).toEqual(new Date('2026-08-31T00:00:00.000Z'));
    expect(range.to).toEqual(now);
  });

  it('defaults `now` to the current time when omitted', () => {
    const before = Date.now();
    const range = daysToRange(7);
    const after = Date.now();

    expect(range.to.getTime()).toBeGreaterThanOrEqual(before);
    expect(range.to.getTime()).toBeLessThanOrEqual(after);
  });
});
