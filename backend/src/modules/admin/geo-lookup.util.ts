import geoip from 'geoip-lite';

export interface CountryInfo {
  country: string | null;
  countryCode: string | null;
}

// ISO 3166-1 alpha-2 -> display name ("VN" -> "Vietnam"), via the standard
// Intl.DisplayNames API rather than a hardcoded country-name table.
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

// Offline lookup — geoip-lite bundles its own database, so this makes no
// network call and reaches no external service (no cost, no third-party IP
// disclosure). Private/reserved/local addresses (127.0.0.1, 10.x,
// 192.168.x, ::1 — common in dev/seed data) resolve to `null` here, which
// is a normal, expected outcome, not an error.
export function lookupCountry(ip: string): CountryInfo {
  const result = geoip.lookup(ip);
  if (!result?.country) {
    return { country: null, countryCode: null };
  }

  let country: string;
  try {
    country = regionNames.of(result.country) ?? result.country;
  } catch {
    country = result.country;
  }

  return { country, countryCode: result.country };
}
