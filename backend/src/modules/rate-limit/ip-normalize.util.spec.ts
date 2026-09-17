import { normalizeIp } from './ip-normalize.util';

describe('normalizeIp', () => {
  it('strips the ::ffff: IPv4-mapped prefix', () => {
    expect(normalizeIp('::ffff:172.19.0.1')).toBe('172.19.0.1');
  });

  it('is case-insensitive on the prefix', () => {
    expect(normalizeIp('::FFFF:172.19.0.1')).toBe('172.19.0.1');
  });

  it('leaves a plain IPv4 address unchanged', () => {
    expect(normalizeIp('203.0.113.9')).toBe('203.0.113.9');
  });

  it('leaves a real (non-mapped) IPv6 address unchanged', () => {
    expect(normalizeIp('2001:db8::1')).toBe('2001:db8::1');
  });

  it('leaves an empty string unchanged', () => {
    expect(normalizeIp('')).toBe('');
  });
});
