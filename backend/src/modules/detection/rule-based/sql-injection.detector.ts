import { Injectable } from '@nestjs/common';
import { DetectionResult, NormalizedRequest } from '../../../common/types';
import { RuleDetector } from './rule-detector.interface';
import { buildSearchSurface } from './search-surface.util';

const SQLI_PATTERNS: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /(\bor\b|\band\b)\s+['"]?\d+['"]?\s*=\s*['"]?\d+/i,
    reason: 'boolean-based tautology (e.g. OR 1=1)',
  },
  {
    pattern: /'\s*or\s*'?\d*'?\s*=\s*'?\d*/i,
    reason: "quote-based tautology (e.g. ' OR '1'='1)",
  },
  { pattern: /union\s+(all\s+)?select\b/i, reason: 'UNION SELECT' },
  { pattern: /;\s*(drop|delete|insert|update)\s+/i, reason: 'stacked query' },
  { pattern: /(--|#|\/\*)/, reason: 'SQL comment sequence' },
  {
    pattern: /\bsleep\s*\(|\bbenchmark\s*\(|waitfor\s+delay\b/i,
    reason: 'time-based blind SQLi function',
  },
  { pattern: /\bxp_cmdshell\b/i, reason: 'xp_cmdshell' },
];

// Pattern/signature-based SQL Injection detector (docs/architecture.md §6).
@Injectable()
export class SqlInjectionRuleDetector implements RuleDetector {
  detect(request: NormalizedRequest): DetectionResult {
    const surface = buildSearchSurface(request);

    for (const { pattern, reason } of SQLI_PATTERNS) {
      if (pattern.test(surface)) {
        return {
          classification: 'SQL_INJECTION',
          detected: true,
          confidence: null,
          reason: `SQL Injection pattern matched: ${reason}`,
        };
      }
    }

    return {
      classification: 'NORMAL',
      detected: false,
      confidence: null,
      reason: 'no SQL injection pattern matched',
    };
  }
}
