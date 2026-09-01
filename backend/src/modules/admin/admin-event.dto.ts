import { SecurityEvent } from '@prisma/client';

// GET /admin/events / GET /admin/events/:id response shape — the raw
// Prisma row plus a country enriched at read time from `sourceIp` (see
// geo-lookup.util.ts). `sourceIp` itself is not subject to ADR-4's
// redaction (that applies only to `requestMeta`), so enriching/displaying
// it further is not a redaction violation.
export interface AdminSecurityEvent extends SecurityEvent {
  country: string | null;
  countryCode: string | null;
}

export interface AdminSecurityEventListResult {
  items: AdminSecurityEvent[];
  total: number;
}
