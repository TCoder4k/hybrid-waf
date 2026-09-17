import { buildSystemInfo } from './system-info';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version } = require('../../../package.json') as { version: string };

describe('buildSystemInfo', () => {
  it('reports the backend package.json version', () => {
    expect(buildSystemInfo().version).toBe(version);
  });

  it('reports environment, falling back to "development" when NODE_ENV is unset', () => {
    const original = process.env.NODE_ENV;
    delete process.env.NODE_ENV;

    expect(buildSystemInfo().environment).toBe('development');

    process.env.NODE_ENV = original;
  });

  it('reports a non-negative integer uptime and a valid ISO serverTime', () => {
    const info = buildSystemInfo();

    expect(Number.isInteger(info.uptimeSeconds)).toBe(true);
    expect(info.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(new Date(info.serverTime).getTime())).toBe(false);
  });

  it('reports the configured ML confidence threshold', () => {
    const original = process.env.ML_CONFIDENCE_THRESHOLD;
    process.env.ML_CONFIDENCE_THRESHOLD = '0.85';

    expect(buildSystemInfo().mlConfidenceThreshold).toBe(0.85);

    process.env.ML_CONFIDENCE_THRESHOLD = original;
  });

  it('reports the configured WAF_MODE, defaulting to HYBRID_BLOCK', () => {
    const original = process.env.WAF_MODE;
    delete process.env.WAF_MODE;

    expect(buildSystemInfo().wafMode).toBe('HYBRID_BLOCK');

    process.env.WAF_MODE = 'MONITOR';
    expect(buildSystemInfo().wafMode).toBe('MONITOR');

    if (original === undefined) delete process.env.WAF_MODE;
    else process.env.WAF_MODE = original;
  });

  it('reports the resolved rate-limit configuration', () => {
    const keys = [
      'RATE_LIMIT_PER_IP_RPS',
      'RATE_LIMIT_PER_IP_BURST',
      'RATE_LIMIT_GLOBAL_RPS',
      'RATE_LIMIT_GLOBAL_BURST',
      'RATE_LIMIT_MAX_CONCURRENCY',
    ];
    const originals = keys.map((k) => process.env[k]);
    process.env.RATE_LIMIT_PER_IP_RPS = '15';
    process.env.RATE_LIMIT_PER_IP_BURST = '30';
    process.env.RATE_LIMIT_GLOBAL_RPS = '150';
    process.env.RATE_LIMIT_GLOBAL_BURST = '300';
    process.env.RATE_LIMIT_MAX_CONCURRENCY = '50';

    expect(buildSystemInfo().rateLimit).toEqual({
      perIpRatePerSecond: 15,
      perIpBurst: 30,
      globalRatePerSecond: 150,
      globalBurst: 300,
      maxConcurrency: 50,
    });

    keys.forEach((k, i) => {
      if (originals[i] === undefined) delete process.env[k];
      else process.env[k] = originals[i];
    });
  });
});
