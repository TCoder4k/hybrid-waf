import { Injectable } from '@nestjs/common';
import { DetectionResult, NormalizedRequest } from '../../../common/types';
import { RuleDetector } from './rule-detector.interface';
import { buildSearchSurface } from './search-surface.util';

const XSS_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /<script[\s>]/i, reason: '<script> tag' },
  { pattern: /javascript:/i, reason: 'javascript: URI scheme' },
  {
    pattern: /on(error|load|click|mouseover|focus|input)\s*=/i,
    reason: 'inline event handler attribute',
  },
  { pattern: /<img[^>]+onerror/i, reason: '<img onerror> payload' },
  { pattern: /<svg[^>]*onload/i, reason: '<svg onload> payload' },
  { pattern: /<iframe[\s>]/i, reason: '<iframe> tag' },
  { pattern: /document\.cookie/i, reason: 'document.cookie access' },
];

// Pattern/signature-based XSS detector (docs/architecture.md §6).
@Injectable()
export class XssRuleDetector implements RuleDetector {
  detect(request: NormalizedRequest): DetectionResult {
    const surface = buildSearchSurface(request);

    for (const { pattern, reason } of XSS_PATTERNS) {
      if (pattern.test(surface)) {
        return {
          classification: 'XSS',
          detected: true,
          confidence: null,
          reason: `XSS pattern matched: ${reason}`,
        };
      }
    }

    return {
      classification: 'NORMAL',
      detected: false,
      confidence: null,
      reason: 'no XSS pattern matched',
    };
  }
}
