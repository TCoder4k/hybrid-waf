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
  country: string | null;
  countryCode: string | null;
  // Opaque JSON blobs from the backend (detector/decision reasoning and a
  // redacted request snapshot) — shown as-is in the event detail view,
  // never parsed/relied on for shape by the frontend.
  ruleResult: unknown;
  mlResult: unknown;
  requestMeta: unknown;
}

export interface SecurityEventListResult {
  items: SecurityEvent[];
  total: number;
}

export interface TrendPoint {
  date: string; // YYYY-MM-DD
  totalRequests: number;
  allowedRequests: number;
  blockedRequests: number;
}

export type ComponentStatus = "up" | "down";

export interface SystemStatus {
  wafEngine: "up";
  mlService: ComponentStatus;
  database: ComponentStatus;
  protectedApi: ComponentStatus;
}

export interface SystemInfo {
  version: string;
  environment: string;
  uptimeSeconds: number;
  serverTime: string; // ISO 8601
}

export interface AdminStatsExtra {
  maliciousIpCount: number;
  countryCount: number;
  requestsThisHour: number;
}

export interface Me {
  username: string;
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

// Any authenticated GET below clears the stored token on a 401 — the token is
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

// `days` omitted -> all-time totals (Phase 10's original behavior).
export function getStats(days?: number): Promise<TrafficStats> {
  return authenticatedGet<TrafficStats>(
    `/admin/stats${days !== undefined ? `?days=${days}` : ""}`,
  );
}

export function getStatsTrend(days: number): Promise<TrendPoint[]> {
  return authenticatedGet<TrendPoint[]>(`/admin/stats/trend?days=${days}`);
}

export function getStatsExtra(days?: number): Promise<AdminStatsExtra> {
  return authenticatedGet<AdminStatsExtra>(
    `/admin/stats/extra${days !== undefined ? `?days=${days}` : ""}`,
  );
}

export function getSystemStatus(): Promise<SystemStatus> {
  return authenticatedGet<SystemStatus>("/admin/system-status");
}

export function getSystemInfo(): Promise<SystemInfo> {
  return authenticatedGet<SystemInfo>("/admin/system-info");
}

export function getMe(): Promise<Me> {
  return authenticatedGet<Me>("/admin/me");
}

export interface EventListFilter {
  page?: number;
  pageSize?: number;
  attackType?: string;
  method?: string;
  // Matches endpoint OR sourceIp (case-insensitive "contains") — not
  // user-agent, since requestMeta never stores one (ADR-4 redaction
  // excludes headers entirely).
  search?: string;
  minConfidence?: number;
  days?: number;
}

export function getEvents(
  filter: EventListFilter = {},
): Promise<SecurityEventListResult> {
  const params = new URLSearchParams();
  if (filter.page !== undefined) params.set("page", String(filter.page));
  if (filter.pageSize !== undefined)
    params.set("pageSize", String(filter.pageSize));
  if (filter.attackType) params.set("attackType", filter.attackType);
  if (filter.method) params.set("method", filter.method);
  if (filter.search) params.set("search", filter.search);
  if (filter.minConfidence !== undefined)
    params.set("minConfidence", String(filter.minConfidence));
  if (filter.days !== undefined) params.set("days", String(filter.days));

  const qs = params.toString();
  return authenticatedGet<SecurityEventListResult>(
    `/admin/events${qs ? `?${qs}` : ""}`,
  );
}

export function getRecentEvents(
  pageSize: number,
): Promise<SecurityEventListResult> {
  return getEvents({ page: 1, pageSize });
}
