// Typed client for the WAF's Admin API (docs/architecture.md §11). This is
// the ONLY backend the frontend talks to — never protected-api, ml-service,
// or the database directly (§15).
import { clearToken, getToken } from "./auth";

const BASE_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface LoginResponse {
  accessToken: string;
}

export interface TrafficStats {
  totalRequests: number;
  allowedRequests: number;
  blockedRequests: number;
  sqlInjectionBlocks: number;
  xssBlocks: number;
}

export interface SecurityEvent {
  id: string;
  timestamp: string;
  sourceIp: string;
  method: string;
  endpoint: string;
  attackType: string;
  confidence: number | null;
  decision: string;
}

export interface SecurityEventListResult {
  items: SecurityEvent[];
  total: number;
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string };
    return body.message ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function login(
  username: string,
  password: string,
): Promise<LoginResponse> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new ApiError(res.status, await parseErrorMessage(res));
  }
  return (await res.json()) as LoginResponse;
}

// Any authenticated GET below clears the stored token on 401 — the token is
// missing, malformed, or expired either way, and holding on to it would just
// produce the same 401 again. Callers still decide what to do next (usually
// redirect to /login); this only stops a dead token from being reused.
async function authenticatedGet<T>(path: string): Promise<T> {
  const token = getToken();
  if (!token) {
    throw new ApiError(401, "Not logged in");
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    clearToken();
  }
  if (!res.ok) {
    throw new ApiError(res.status, await parseErrorMessage(res));
  }
  return (await res.json()) as T;
}

export function getStats(): Promise<TrafficStats> {
  return authenticatedGet<TrafficStats>("/admin/stats");
}

export function getRecentEvents(
  pageSize: number,
): Promise<SecurityEventListResult> {
  return authenticatedGet<SecurityEventListResult>(
    `/admin/events?page=1&pageSize=${pageSize}`,
  );
}
