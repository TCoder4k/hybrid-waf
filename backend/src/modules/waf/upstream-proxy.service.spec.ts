import type { Request } from 'express';
import type { RequestWithRawBody } from '../../common/raw-body-capture.middleware';
import { resolveUpstreamUrl } from '../../common/upstream-config.util';
import { UpstreamProxyService } from './upstream-proxy.service';

function makeRequest(
  overrides: Partial<RequestWithRawBody> = {},
): RequestWithRawBody {
  return {
    method: 'GET',
    originalUrl: '/api/hello',
    headers: { 'x-test': 'value', host: 'localhost:3000' },
    body: undefined,
    ip: '203.0.113.9',
    protocol: 'http',
    ...overrides,
  } as RequestWithRawBody;
}

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

describe('UpstreamProxyService', () => {
  const originalUpstreamUrl = process.env.UPSTREAM_URL;
  const originalProtectedApiUrl = process.env.PROTECTED_API_URL;
  const originalTimeout = process.env.UPSTREAM_TIMEOUT_MS;
  let service: UpstreamProxyService;

  beforeEach(() => {
    delete process.env.UPSTREAM_URL;
    process.env.PROTECTED_API_URL = 'http://protected-api.test';
    delete process.env.UPSTREAM_TIMEOUT_MS;
    service = new UpstreamProxyService({
      getActiveUrl: jest.fn(() => resolveUpstreamUrl()),
    } as never);
  });

  afterEach(() => {
    restoreEnv('UPSTREAM_URL', originalUpstreamUrl);
    restoreEnv('PROTECTED_API_URL', originalProtectedApiUrl);
    restoreEnv('UPSTREAM_TIMEOUT_MS', originalTimeout);
    jest.restoreAllMocks();
  });

  it('forwards the request to the resolved upstream + originalUrl and relays the response body/status verbatim (binary-safe)', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await service.forward(makeRequest());

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://protected-api.test/api/hello',
      expect.objectContaining({ method: 'GET', redirect: 'manual' }),
    );
    expect(result.status).toBe(200);
    expect(Buffer.isBuffer(result.body)).toBe(true);
    expect((result.body as Buffer).toString()).toBe(
      JSON.stringify({ message: 'ok' }),
    );
  });

  it('relays a real binary (non-UTF8) response body byte-for-byte', async () => {
    const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x10]);
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(new Uint8Array(binary), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
    );

    const result = await service.forward(makeRequest());

    expect(Buffer.compare(result.body as Buffer, binary)).toBe(0);
  });

  it('relays the upstream 3xx status + Location header instead of following it', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'https://elsewhere.example/target' },
      }),
    );

    const result = await service.forward(makeRequest());

    expect(result.status).toBe(302);
    expect(result.headers.location).toBe('https://elsewhere.example/target');
  });

  it('returns 504 Gateway Timeout when the upstream does not respond in time, without hanging', async () => {
    process.env.UPSTREAM_TIMEOUT_MS = '20';
    jest.spyOn(global, 'fetch').mockImplementation(
      (_url, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );

    const result = await service.forward(makeRequest());

    expect(result.status).toBe(504);
    expect(JSON.parse((result.body as Buffer).toString())).toMatchObject({
      statusCode: 504,
      error: 'Gateway Timeout',
    });
  });

  it('adds X-Forwarded-For/Proto/Host so the upstream can see the real client', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    await service.forward(
      makeRequest({ ip: '198.51.100.7', protocol: 'https' }),
    );

    const sentHeaders = fetchSpy.mock.calls[0][1]?.headers as Record<
      string,
      string
    >;
    expect(sentHeaders['x-forwarded-for']).toBe('198.51.100.7');
    expect(sentHeaders['x-forwarded-proto']).toBe('https');
    expect(sentHeaders['x-forwarded-host']).toBe('localhost:3000');
  });

  it('appends to an existing X-Forwarded-For chain rather than overwriting it', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    await service.forward(
      makeRequest({
        ip: '198.51.100.7',
        headers: { host: 'localhost:3000', 'x-forwarded-for': '203.0.113.1' },
      }),
    );

    const sentHeaders = fetchSpy.mock.calls[0][1]?.headers as Record<
      string,
      string
    >;
    expect(sentHeaders['x-forwarded-for']).toBe('203.0.113.1, 198.51.100.7');
  });

  it('prefers UPSTREAM_URL over PROTECTED_API_URL when both are set (Phase P1, ADR-8)', async () => {
    process.env.UPSTREAM_URL = 'http://real-app.test';
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    await service.forward(makeRequest());

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://real-app.test/api/hello',
      expect.anything(),
    );
  });

  it('falls back to PROTECTED_API_URL when UPSTREAM_URL is unset (backward compatibility)', async () => {
    // beforeEach already leaves UPSTREAM_URL unset and PROTECTED_API_URL set.
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    await service.forward(makeRequest());

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://protected-api.test/api/hello',
      expect.anything(),
    );
  });

  it('strips hop-by-hop headers before forwarding', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    await service.forward(
      makeRequest({
        headers: {
          host: 'localhost:3000',
          'content-length': '12',
          'x-keep': 'yes',
        },
      }),
    );

    const sentHeaders = fetchSpy.mock.calls[0][1]?.headers as Record<
      string,
      string
    >;
    expect(sentHeaders.host).toBeUndefined();
    expect(sentHeaders['content-length']).toBeUndefined();
    expect(sentHeaders['x-keep']).toBe('yes');
  });

  describe('content-type-aware body forwarding (Phase P2)', () => {
    it('re-serializes an already-parsed JSON body', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response('{}', { status: 200 }));

      await service.forward(
        makeRequest({
          method: 'POST',
          headers: {
            host: 'localhost:3000',
            'content-type': 'application/json',
          },
          body: { foo: 'bar' },
        }),
      );

      expect(fetchSpy.mock.calls[0][1]?.body).toBe(
        JSON.stringify({ foo: 'bar' }),
      );
    });

    it('re-encodes an already-parsed urlencoded body back to form encoding (not JSON)', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response('{}', { status: 200 }));

      await service.forward(
        makeRequest({
          method: 'POST',
          headers: {
            host: 'localhost:3000',
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: { name: 'a b', role: 'admin' },
        }),
      );

      expect(fetchSpy.mock.calls[0][1]?.body).toBe('name=a+b&role=admin');
    });

    it('forwards a captured raw body byte-for-byte for multipart/form-data', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response('{}', { status: 200 }));
      const rawBody = Buffer.from(
        '--X\r\nContent-Disposition: form-data; name="f"\r\n\r\nvalue\r\n--X--',
      );

      await service.forward(
        makeRequest({
          method: 'POST',
          headers: {
            host: 'localhost:3000',
            'content-type': 'multipart/form-data; boundary=X',
          },
          rawBody,
        }),
      );

      const sentBody = fetchSpy.mock.calls[0][1]?.body as Uint8Array;
      expect(Buffer.compare(Buffer.from(sentBody), rawBody)).toBe(0);
    });

    it('sends no body when there is nothing to forward', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response('{}', { status: 200 }));

      await service.forward(makeRequest());

      expect(fetchSpy.mock.calls[0][1]?.body).toBeUndefined();
    });
  });

  it('returns 502 Bad Gateway when the upstream is unreachable', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await service.forward(makeRequest());

    expect(result.status).toBe(502);
    expect(JSON.parse((result.body as Buffer).toString())).toMatchObject({
      statusCode: 502,
      error: 'Bad Gateway',
    });
  });

  it('returns 502 without calling fetch when the upstream configuration is malformed', async () => {
    process.env.UPSTREAM_URL = 'not-a-valid-url';
    const fetchSpy = jest.spyOn(global, 'fetch');

    const result = await service.forward(makeRequest());

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.status).toBe(502);
    expect(JSON.parse(result.body as string)).toMatchObject({
      statusCode: 502,
    });
  });

  // SSRF/open-proxy invariant (docs/architecture.md §21, ADR-8): the
  // upstream target must come exclusively from server-side env
  // configuration — never from any request-supplied data. Proven directly
  // here rather than only "by construction" (the implementation never reads
  // req.headers/req.body/req.query when building targetUrl), so a future
  // change that accidentally introduces such a read would fail this test.
  describe('SSRF invariant: client-controlled input cannot select or change the upstream target', () => {
    it('ignores a spoofed Host header', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response('{}', { status: 200 }));

      await service.forward(
        makeRequest({ headers: { host: 'attacker-controlled.example' } }),
      );

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://protected-api.test/api/hello',
        expect.anything(),
      );
    });

    it('ignores a spoofed X-Forwarded-Host header', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response('{}', { status: 200 }));

      await service.forward(
        makeRequest({
          headers: { 'x-forwarded-host': 'attacker-controlled.example' },
        }),
      );

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://protected-api.test/api/hello',
        expect.anything(),
      );
    });

    it('ignores an attempted upstream override in the request body', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response('{}', { status: 200 }));

      await service.forward(
        makeRequest({
          method: 'POST',
          headers: {
            host: 'localhost:3000',
            'content-type': 'application/json',
          },
          body: { upstreamUrl: 'http://attacker-controlled.example' },
        }),
      );

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://protected-api.test/api/hello',
        expect.anything(),
      );
    });

    it('ignores an attempted upstream override in the query string (originalUrl is opaque to target resolution)', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response('{}', { status: 200 }));

      await service.forward(
        makeRequest({
          originalUrl: '/api/hello?upstream=http://attacker-controlled.example',
        }),
      );

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://protected-api.test/api/hello?upstream=http://attacker-controlled.example',
        expect.anything(),
      );
    });
  });
});
