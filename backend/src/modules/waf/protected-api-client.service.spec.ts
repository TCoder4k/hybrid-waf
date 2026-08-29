import type { Request } from 'express';
import { ProtectedApiClientService } from './protected-api-client.service';

function makeRequest(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    originalUrl: '/api/hello',
    headers: { 'x-test': 'value', host: 'localhost:3000' },
    body: undefined,
    ...overrides,
  } as Request;
}

describe('ProtectedApiClientService', () => {
  const originalEnv = process.env.PROTECTED_API_URL;
  let service: ProtectedApiClientService;

  beforeEach(() => {
    service = new ProtectedApiClientService();
    process.env.PROTECTED_API_URL = 'http://protected-api.test';
  });

  afterEach(() => {
    process.env.PROTECTED_API_URL = originalEnv;
    jest.restoreAllMocks();
  });

  it('forwards the request to PROTECTED_API_URL + originalUrl and relays the response', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await service.forward(makeRequest());

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://protected-api.test/api/hello',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result.status).toBe(200);
    expect(result.body).toBe(JSON.stringify({ message: 'ok' }));
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

  it('forwards a JSON body for requests that have one', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    await service.forward(
      makeRequest({ method: 'POST', body: { foo: 'bar' } }),
    );

    expect(fetchSpy.mock.calls[0][1]?.body).toBe(
      JSON.stringify({ foo: 'bar' }),
    );
  });

  it('returns 502 Bad Gateway when the Protected API is unreachable', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await service.forward(makeRequest());

    expect(result.status).toBe(502);
    expect(JSON.parse(result.body)).toMatchObject({
      statusCode: 502,
      error: 'Bad Gateway',
    });
  });
});
