import { lookupCountry } from './geo-lookup.util';

describe('lookupCountry', () => {
  it('resolves a known public IP to a country name and code', () => {
    // 8.8.8.8 (Google Public DNS) — a stable, well-known public IP that
    // geoip-lite's bundled database resolves to the United States.
    const result = lookupCountry('8.8.8.8');

    expect(result.countryCode).toBe('US');
    expect(result.country).toBe('United States');
  });

  it('resolves private/reserved IPs to null, not an error', () => {
    expect(lookupCountry('127.0.0.1')).toEqual({
      country: null,
      countryCode: null,
    });
    expect(lookupCountry('10.0.0.1')).toEqual({
      country: null,
      countryCode: null,
    });
    expect(lookupCountry('192.168.1.1')).toEqual({
      country: null,
      countryCode: null,
    });
  });
});
