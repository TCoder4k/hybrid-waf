// Read via require(), not `import ... assert { type: 'json' }` — avoids
// adding `resolveJsonModule` to tsconfig.json for a single-field read.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version } = require('../../../package.json') as { version: string };

export interface SystemInfo {
  version: string;
  environment: string;
  uptimeSeconds: number;
  serverTime: string; // ISO 8601
}

// A plain function, not an injectable service — nothing here needs DI
// (matches the bucket.util.ts pure-utility precedent). Computed fresh on
// every call (not cached at module load) so `uptimeSeconds`/`serverTime`
// are always current.
export function buildSystemInfo(): SystemInfo {
  return {
    version,
    environment: process.env.NODE_ENV ?? 'development',
    uptimeSeconds: Math.floor(process.uptime()),
    serverTime: new Date().toISOString(),
  };
}
