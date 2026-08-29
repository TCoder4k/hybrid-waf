import { NormalizedRequest } from '../../../common/types';
import { MLDetectionEngine } from './ml-detection.engine';

function makeRequest(
  overrides: Partial<NormalizedRequest> = {},
): NormalizedRequest {
  return {
    method: 'GET',
    url: '/api/hello',
    endpoint: '/api/hello',
    queryParams: {},
    pathParams: {},
    body: undefined,
    sourceIp: '203.0.113.9',
    headers: {},
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('MLDetectionEngine', () => {
  const engine = new MLDetectionEngine();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns AVAILABLE with the classification and confidence on a well-formed response', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ classification: 'SQL_INJECTION', confidence: 0.92 }),
          { status: 200 },
        ),
      );

    const result = await engine.detect(makeRequest());

    expect(result.status).toBe('AVAILABLE');
    if (result.status === 'AVAILABLE') {
      expect(result.classification).toBe('SQL_INJECTION');
      expect(result.confidence).toBe(0.92);
    }
  });

  it('returns UNAVAILABLE on a non-2xx response', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('error', { status: 500 }));

    const result = await engine.detect(makeRequest());

    expect(result.status).toBe('UNAVAILABLE');
    expect(result.classification).toBeNull();
    expect(result.confidence).toBeNull();
    expect(result.reason).toContain('status 500');
  });

  it('returns UNAVAILABLE on a connection error, never NORMAL', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await engine.detect(makeRequest());

    expect(result.status).toBe('UNAVAILABLE');
    expect(result.classification).toBeNull();
    expect(result.confidence).toBeNull();
  });

  it('returns UNAVAILABLE on a malformed response body', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ unexpected: 'shape' }), { status: 200 }),
      );

    const result = await engine.detect(makeRequest());

    expect(result.status).toBe('UNAVAILABLE');
  });

  it('returns UNAVAILABLE with a timeout reason on abort', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    jest.spyOn(global, 'fetch').mockRejectedValue(abortError);

    const result = await engine.detect(makeRequest());

    expect(result.status).toBe('UNAVAILABLE');
    expect(result.reason).toContain('timeout');
  });

  it('returns UNAVAILABLE on an invalid classification value', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          classification: 'NOT_A_REAL_CLASS',
          confidence: 0.5,
        }),
        { status: 200 },
      ),
    );

    const result = await engine.detect(makeRequest());

    expect(result.status).toBe('UNAVAILABLE');
  });
});
