import {
  aggregateDetectionAnalysis,
  classifyDetectionSource,
  extractEventReason,
  formatEndpoint,
  isMlDetected,
  SecurityEventLike,
} from './detection-source.util';

describe('detection-source.util', () => {
  describe('classifyDetectionSource', () => {
    // UT01: Rule=true, ML=attack => BOTH
    it('UT01: returns BOTH when Rule=true and ML=attack', () => {
      const rule = { detected: true };
      const ml = { classification: 'attack' };
      expect(classifyDetectionSource(rule, ml)).toBe('BOTH');
    });

    // UT02: Rule=true, ML=normal => RULE
    it('UT02: returns RULE when Rule=true and ML=normal', () => {
      const rule = { detected: true };
      const ml = { classification: 'normal' };
      expect(classifyDetectionSource(rule, ml)).toBe('RULE');
    });

    // UT03: Rule=false, ML=attack => ML
    it('UT03: returns ML when Rule=false and ML=attack', () => {
      const rule = { detected: false };
      const ml = { classification: 'attack' };
      expect(classifyDetectionSource(rule, ml)).toBe('ML');
    });

    // UT04: Rule=false, ML=normal => null
    it('UT04: returns null when Rule=false and ML=normal', () => {
      const rule = { detected: false };
      const ml = { classification: 'normal' };
      expect(classifyDetectionSource(rule, ml)).toBeNull();
    });

    // UT05: ruleResult=null, ML=attack => ML
    it('UT05: returns ML when ruleResult=null and ML=attack', () => {
      const rule = null;
      const ml = { classification: 'attack' };
      expect(classifyDetectionSource(rule, ml)).toBe('ML');
    });

    // UT06: Rule=true, mlResult=null => RULE
    it('UT06: returns RULE when Rule=true and mlResult=null', () => {
      const rule = { detected: true };
      const ml = null;
      expect(classifyDetectionSource(rule, ml)).toBe('RULE');
    });

    // UT07: cả hai null => null
    it('UT07: returns null when both ruleResult and mlResult are null', () => {
      expect(classifyDetectionSource(null, null)).toBeNull();
    });

    // Real production formats
    it('handles production MLDetectionResult and DetectionResult correctly', () => {
      const prodRule = {
        classification: 'SQL_INJECTION',
        detected: true,
        confidence: null,
        reason: 'SQL injection detected',
      };
      const prodMlAvailableAttack = {
        status: 'AVAILABLE',
        classification: 'SQL_INJECTION',
        confidence: 0.95,
        reason: 'Predicted SQL_INJECTION',
      };
      const prodMlAvailableNormal = {
        status: 'AVAILABLE',
        classification: 'NORMAL',
        confidence: 0.99,
        reason: 'Predicted NORMAL',
      };
      const prodMlUnavailable = {
        status: 'UNAVAILABLE',
        classification: null,
        confidence: null,
        reason: 'timeout',
      };

      expect(classifyDetectionSource(prodRule, prodMlAvailableAttack)).toBe(
        'BOTH',
      );
      expect(classifyDetectionSource(prodRule, prodMlAvailableNormal)).toBe(
        'RULE',
      );
      expect(classifyDetectionSource(prodRule, prodMlUnavailable)).toBe('RULE');
      expect(
        classifyDetectionSource(
          { ...prodRule, detected: false },
          prodMlAvailableAttack,
        ),
      ).toBe('ML');
      expect(
        classifyDetectionSource(
          { ...prodRule, detected: false },
          prodMlAvailableNormal,
        ),
      ).toBeNull();
    });

    it('handles ml status: "malicious" or "attack"', () => {
      expect(
        classifyDetectionSource({ detected: false }, { status: 'malicious' }),
      ).toBe('ML');
      expect(
        classifyDetectionSource({ detected: true }, { status: 'attack' }),
      ).toBe('BOTH');
    });
  });

  describe('isMlDetected', () => {
    it('returns false for non-object or null', () => {
      expect(isMlDetected(null)).toBe(false);
      expect(isMlDetected(undefined)).toBe(false);
      expect(isMlDetected('attack')).toBe(false);
    });

    it('returns false for UNAVAILABLE status without attack classification', () => {
      expect(
        isMlDetected({ status: 'UNAVAILABLE', classification: null }),
      ).toBe(false);
    });

    it('returns false for NORMAL and benign classifications', () => {
      expect(isMlDetected({ classification: 'NORMAL' })).toBe(false);
      expect(isMlDetected({ classification: 'normal' })).toBe(false);
      expect(isMlDetected({ classification: 'benign' })).toBe(false);
      expect(isMlDetected({ classification: '' })).toBe(false);
    });

    it('returns true for attacks like SQL_INJECTION, XSS, attack, malicious', () => {
      expect(isMlDetected({ classification: 'SQL_INJECTION' })).toBe(true);
      expect(isMlDetected({ classification: 'XSS' })).toBe(true);
      expect(isMlDetected({ classification: 'attack' })).toBe(true);
      expect(isMlDetected({ classification: 'malicious' })).toBe(true);
    });
  });

  describe('extractEventReason', () => {
    it('prefers direct event.reason if present', () => {
      const reason = extractEventReason({
        reason: 'Custom reason',
        ruleResult: { detected: true, reason: 'Rule reason' },
      });
      expect(reason).toBe('Custom reason');
    });

    it('uses ruleResult.reason when rule detected', () => {
      const reason = extractEventReason({
        ruleResult: { detected: true, reason: 'Rule match SQLi' },
        mlResult: { classification: 'SQL_INJECTION', reason: 'ML match' },
      });
      expect(reason).toBe('Rule match SQLi');
    });

    it('uses mlResult.reason when rule did not detect', () => {
      const reason = extractEventReason({
        ruleResult: { detected: false },
        mlResult: { classification: 'SQL_INJECTION', reason: 'ML match XSS' },
      });
      expect(reason).toBe('ML match XSS');
    });

    it('returns null when no reason is present', () => {
      expect(extractEventReason({})).toBeNull();
    });
  });

  describe('formatEndpoint', () => {
    it('combines METHOD and endpoint when endpoint is just path', () => {
      expect(formatEndpoint({ method: 'POST', endpoint: '/api/login' })).toBe(
        'POST /api/login',
      );
    });

    it('keeps endpoint as-is if method is already prefixed', () => {
      expect(
        formatEndpoint({ method: 'POST', endpoint: 'POST /api/login' }),
      ).toBe('POST /api/login');
    });

    it('handles endpoint without method', () => {
      expect(formatEndpoint({ endpoint: '/api/users' })).toBe('/api/users');
    });

    it('returns null for missing endpoint', () => {
      expect(formatEndpoint({})).toBeNull();
    });
  });

  describe('aggregateDetectionAnalysis', () => {
    it('computes ruleOnly, mlOnly, both and invariant accurately', () => {
      const events: SecurityEventLike[] = [
        // Event 1 -> RULE
        {
          ruleResult: { detected: true },
          mlResult: { classification: 'NORMAL' },
        },
        // Event 2 -> RULE
        { ruleResult: { detected: true }, mlResult: { status: 'UNAVAILABLE' } },
        // Event 3 -> ML
        {
          ruleResult: { detected: false },
          mlResult: { classification: 'SQL_INJECTION' },
        },
        // Event 4 -> BOTH
        { ruleResult: { detected: true }, mlResult: { classification: 'XSS' } },
        // Event 5 -> BOTH
        { ruleResult: { detected: true }, mlResult: { status: 'attack' } },
      ];

      const result = aggregateDetectionAnalysis(events);

      expect(result.totalBlocked).toBe(5);
      expect(result.ruleOnlyCount).toBe(2);
      expect(result.mlOnlyCount).toBe(1);
      expect(result.bothCount).toBe(2);
      expect(result.unclassifiedCount).toBe(0);

      // Invariant checks
      expect(result.ruleOnlyCount + result.mlOnlyCount + result.bothCount).toBe(
        result.totalBlocked,
      );
      expect(result.ruleContributionCount).toBe(4); // 2 ruleOnly + 2 both
      expect(result.mlContributionCount).toBe(3); // 1 mlOnly + 2 both
    });

    it('handles confidence buckets according to BR-10 and BR-11 exact boundaries, only for ML-detecting sources (ML or BOTH)', () => {
      const events: SecurityEventLike[] = [
        // ML-only, confidence 0.72 -> '0.7-0.8'
        {
          ruleResult: { detected: false },
          mlResult: { classification: 'SQL_INJECTION', confidence: 0.72 },
        },
        // BOTH, confidence 0.8 -> '0.8-0.9'
        {
          ruleResult: { detected: true },
          mlResult: { classification: 'XSS', confidence: 0.8 },
        },
        // ML-only, confidence 0.89 -> '0.8-0.9'
        {
          ruleResult: { detected: false },
          mlResult: { classification: 'XSS', confidence: 0.89 },
        },
        // BOTH, confidence 0.9 -> '0.9-1.0'
        {
          ruleResult: { detected: true },
          mlResult: { classification: 'SQL_INJECTION', confidence: 0.9 },
        },
        // ML-only, confidence 1.0 -> '0.9-1.0'
        {
          ruleResult: { detected: false },
          mlResult: { classification: 'SQL_INJECTION', confidence: 1.0 },
        },
        // ML-only, confidence 0.69 -> < 0.7 -> ignored
        {
          ruleResult: { detected: false },
          mlResult: { classification: 'XSS', confidence: 0.69 },
        },
        // ML-only, confidence 1.05 -> > 1.0 -> ignored
        {
          ruleResult: { detected: false },
          mlResult: { classification: 'XSS', confidence: 1.05 },
        },
        // ML-only, confidence null -> ignored
        {
          ruleResult: { detected: false },
          mlResult: { classification: 'XSS', confidence: null },
        },
        // ML-only, confidence NaN -> ignored
        {
          ruleResult: { detected: false },
          mlResult: { classification: 'XSS', confidence: NaN },
        },
      ];

      const result = aggregateDetectionAnalysis(events);

      expect(result.confidenceBuckets['0.7-0.8']).toBe(1);
      expect(result.confidenceBuckets['0.8-0.9']).toBe(2);
      expect(result.confidenceBuckets['0.9-1.0']).toBe(2);
    });

    it('excludes RULE-only detections from confidence buckets even when ML carries a high confidence for a NORMAL classification', () => {
      const events: SecurityEventLike[] = [
        // RULE-only: Rule detected the attack, but ML classified it NORMAL
        // (disagreeing / not detecting) while still carrying a high numeric
        // confidence for that NORMAL call. This must NOT be bucketed, since
        // ML was not a detecting source for this event.
        {
          ruleResult: { detected: true },
          mlResult: { classification: 'NORMAL', confidence: 0.95 },
          confidence: 0.95,
        },
      ];

      const result = aggregateDetectionAnalysis(events);

      expect(result.ruleOnlyCount).toBe(1);
      expect(result.confidenceBuckets['0.7-0.8']).toBe(0);
      expect(result.confidenceBuckets['0.8-0.9']).toBe(0);
      expect(result.confidenceBuckets['0.9-1.0']).toBe(0);
    });

    it('aggregates topReasons: exact string grouping, sorted DESC, max 10', () => {
      const events: SecurityEventLike[] = [
        { reason: 'SQL Injection pattern detected' },
        { reason: 'XSS payload detected' },
        { reason: 'SQL Injection pattern detected' },
        { reason: 'SQL Injection pattern detected' },
        { reason: 'XSS payload detected' },
        { reason: 'Directory traversal' },
      ];

      const result = aggregateDetectionAnalysis(events);

      expect(result.topReasons).toEqual([
        { reason: 'SQL Injection pattern detected', count: 3 },
        { reason: 'XSS payload detected', count: 2 },
        { reason: 'Directory traversal', count: 1 },
      ]);
    });

    it('limits topReasons and topEndpoints to top 10', () => {
      const events: SecurityEventLike[] = [];
      for (let i = 1; i <= 15; i++) {
        for (let j = 0; j < i; j++) {
          events.push({
            reason: `Reason ${i}`,
            method: 'GET',
            endpoint: `/api/route-${i}`,
          });
        }
      }

      const result = aggregateDetectionAnalysis(events);
      expect(result.topReasons.length).toBe(10);
      expect(result.topEndpoints.length).toBe(10);
      expect(result.topReasons[0]).toEqual({ reason: 'Reason 15', count: 15 });
      expect(result.topEndpoints[0]).toEqual({
        endpoint: 'GET /api/route-15',
        count: 15,
      });
    });

    it('handles empty events array gracefully', () => {
      const result = aggregateDetectionAnalysis([]);
      expect(result.totalBlocked).toBe(0);
      expect(result.ruleOnlyCount).toBe(0);
      expect(result.mlOnlyCount).toBe(0);
      expect(result.bothCount).toBe(0);
      expect(result.unclassifiedCount).toBe(0);
      expect(result.ruleContributionCount).toBe(0);
      expect(result.mlContributionCount).toBe(0);
      expect(result.confidenceBuckets).toEqual({
        '0.7-0.8': 0,
        '0.8-0.9': 0,
        '0.9-1.0': 0,
      });
      expect(result.topReasons).toEqual([]);
      expect(result.topEndpoints).toEqual([]);
    });
  });
});
