import type { Request } from 'express';
import { RequestNormalizerService } from './request-normalizer.service';

function makeRequest(overrides: Partial<Request> = {}): Request {
  return {
    method: 'POST',
    originalUrl: '/api/users/42?verbose=true',
    query: { verbose: 'true' },
    params: { id: '42' },
    body: { username: 'alice' },
    ip: '203.0.113.9',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'curl/8.0',
      accept: 'application/json',
      authorization: 'Bearer secret-token',
      cookie: 'session=abc123',
    },
    ...overrides,
  } as unknown as Request;
}

describe('RequestNormalizerService', () => {
  const service = new RequestNormalizerService();

  it('extracts method, url, and endpoint (without the query string)', () => {
    const result = service.normalize(makeRequest());

    expect(result.method).toBe('POST');
    expect(result.url).toBe('/api/users/42?verbose=true');
    expect(result.endpoint).toBe('/api/users/42');
  });

  it('carries query params, path params, and body through unchanged', () => {
    const result = service.normalize(makeRequest());

    expect(result.queryParams).toEqual({ verbose: 'true' });
    expect(result.pathParams).toEqual({ id: '42' });
    expect(result.body).toEqual({ username: 'alice' });
  });

  it('captures sourceIp', () => {
    const result = service.normalize(makeRequest());
    expect(result.sourceIp).toBe('203.0.113.9');
  });

  it('only keeps allow-listed headers — Authorization/Cookie are dropped', () => {
    const result = service.normalize(makeRequest());

    expect(result.headers).toEqual({
      'content-type': 'application/json',
      'user-agent': 'curl/8.0',
      accept: 'application/json',
    });
    expect(result.headers.authorization).toBeUndefined();
    expect(result.headers.cookie).toBeUndefined();
  });

  it('stamps a valid ISO 8601 timestamp', () => {
    const result = service.normalize(makeRequest());
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });

  it('handles a request with no query string cleanly', () => {
    const result = service.normalize(
      makeRequest({ originalUrl: '/api/hello', query: {} }),
    );
    expect(result.endpoint).toBe('/api/hello');
    expect(result.queryParams).toEqual({});
  });
});
