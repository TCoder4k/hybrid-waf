import { pingHealth } from './health-ping.util';

describe('pingHealth', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns "up" when the health endpoint responds 2xx', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    await expect(pingHealth('http://service.test')).resolves.toBe('up');
  });

  it('returns "down" when the health endpoint responds non-2xx', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false });

    await expect(pingHealth('http://service.test')).resolves.toBe('down');
  });

  it('returns "down" — never throws — when fetch rejects', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(pingHealth('http://service.test')).resolves.toBe('down');
  });
});
