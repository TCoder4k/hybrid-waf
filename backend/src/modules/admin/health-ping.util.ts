const HEALTH_CHECK_TIMEOUT_MS = 1500;

export type ComponentStatus = 'up' | 'down';

// Pings `${baseUrl}/health` with a short timeout — reuses the same
// AbortController + setTimeout pattern MLDetectionEngine.detect() already
// uses for ml-service calls, factored out here so the ml-service and
// protected-api checks in GET /admin/system-status share one
// implementation. Never throws: any failure (timeout, connection refused,
// non-2xx) is reported as 'down', which is itself a valid answer for
// system-status, not an error condition.
export async function pingHealth(baseUrl: string): Promise<ComponentStatus> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/health`, {
      signal: controller.signal,
    });
    return response.ok ? 'up' : 'down';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timeout);
  }
}
