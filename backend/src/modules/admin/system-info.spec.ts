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
});
