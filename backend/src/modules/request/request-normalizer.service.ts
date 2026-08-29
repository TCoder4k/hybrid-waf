import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { NormalizedRequest } from '../../common/types';

// Allow-list, not a blocklist — deliberately excludes Authorization/Cookie
// and anything else not needed downstream, per docs/architecture.md §5/§17.
const ALLOWED_HEADERS = ['content-type', 'user-agent', 'accept'];

// Extract + Normalize stage only (docs/architecture.md §5). Produces the
// canonical NormalizedRequest that Rule/ML detection will both consume from
// Phase 5 onward — nothing here decides ALLOW/BLOCK.
@Injectable()
export class RequestNormalizerService {
  normalize(req: Request): NormalizedRequest {
    const [endpoint] = req.originalUrl.split('?');

    const headers: Record<string, string> = {};
    for (const name of ALLOWED_HEADERS) {
      const value = req.headers[name];
      if (typeof value === 'string') {
        headers[name] = value;
      }
    }

    return {
      method: req.method,
      url: req.originalUrl,
      endpoint,
      queryParams: stringValuesOnly(req.query),
      pathParams: stringValuesOnly(req.params),
      body: req.body,
      sourceIp: req.ip ?? '',
      headers,
      timestamp: new Date().toISOString(),
    };
  }
}

// Express/Nest can produce non-string values here (e.g. arrays for
// repeated query keys, or the WAF's own `@All('*')` wildcard match under
// req.params — see docs/memory.md Phase 4). NormalizedRequest's contract
// is Record<string, string>, and downstream consumers (ML service request
// validation in particular) reject anything else, so non-string entries
// are dropped rather than silently violating the type.
function stringValuesOnly(
  source: Record<string, unknown>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') {
      result[key] = value;
    }
  }
  return result;
}
