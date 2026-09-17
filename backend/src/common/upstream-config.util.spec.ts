import {
  InvalidUpstreamUrlError,
  resolveUpstreamUrl,
} from './upstream-config.util';

// Node coerces `process.env.X = undefined` to the literal string
// "undefined" rather than deleting it — restoring an originally-unset var
// this way would leak a bogus value into every test file that runs after
// this one in the same Jest worker process. Delete instead when there was
// nothing there to begin with.
function restoreEnv(key: string, original: string | undefined) {
  if (original === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = original;
  }
}

describe('resolveUpstreamUrl', () => {
  const originalUpstreamUrl = process.env.UPSTREAM_URL;
  const originalProtectedApiUrl = process.env.PROTECTED_API_URL;

  afterEach(() => {
    restoreEnv('UPSTREAM_URL', originalUpstreamUrl);
    restoreEnv('PROTECTED_API_URL', originalProtectedApiUrl);
  });

  it('uses UPSTREAM_URL when set', () => {
    process.env.UPSTREAM_URL = 'http://real-app:8080';
    delete process.env.PROTECTED_API_URL;

    expect(resolveUpstreamUrl()).toBe('http://real-app:8080');
  });

  it('falls back to PROTECTED_API_URL when UPSTREAM_URL is unset (backward compatibility)', () => {
    delete process.env.UPSTREAM_URL;
    process.env.PROTECTED_API_URL = 'http://protected-api:3001';

    expect(resolveUpstreamUrl()).toBe('http://protected-api:3001');
  });

  it('UPSTREAM_URL takes precedence over PROTECTED_API_URL when both are set', () => {
    process.env.UPSTREAM_URL = 'http://real-app:8080';
    process.env.PROTECTED_API_URL = 'http://protected-api:3001';

    expect(resolveUpstreamUrl()).toBe('http://real-app:8080');
  });

  it('falls back to the safe default when neither is set', () => {
    delete process.env.UPSTREAM_URL;
    delete process.env.PROTECTED_API_URL;

    expect(resolveUpstreamUrl()).toBe('http://localhost:3001');
  });

  it('throws InvalidUpstreamUrlError for a malformed UPSTREAM_URL', () => {
    process.env.UPSTREAM_URL = 'not-a-valid-url';
    delete process.env.PROTECTED_API_URL;

    expect(() => resolveUpstreamUrl()).toThrow(InvalidUpstreamUrlError);
  });

  it('throws InvalidUpstreamUrlError for a malformed PROTECTED_API_URL fallback', () => {
    delete process.env.UPSTREAM_URL;
    process.env.PROTECTED_API_URL = 'not-a-valid-url';

    expect(() => resolveUpstreamUrl()).toThrow(InvalidUpstreamUrlError);
  });
});
