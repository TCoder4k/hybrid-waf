// Typed client for the WAF's Admin API (docs/architecture.md §11). This is
// the ONLY backend the frontend talks to — never protected-api, ml-service,
// or the database directly (§15).
import { clearToken, getToken } from "./auth";

const BASE_URL =
  process.env.NEXT_PUBLIC_ADMIN_API_URL ?? "http://localhost:3000";

function wafRequestUrl(endpoint: string): string {
  const normalized = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const adminApiSuffix = "/api";
  const base = BASE_URL.endsWith(adminApiSuffix)
    ? BASE_URL.slice(0, -adminApiSuffix.length)
    : BASE_URL;
  return `${base}${normalized}`;
}

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

export interface WafTestRequest {
  method: "GET" | "POST";
  endpoint: string;
  payload: string;
}

export interface WafTestResult {
  status: number;
  statusText: string;
  latencyMs: number;
  body: unknown;
  retryAfter: string | null;
}

export async function sendWafTestRequest(
  request: WafTestRequest,
): Promise<WafTestResult> {
  const startedAt = performance.now();
  const response = await fetch(
    request.method === "GET"
      ? `${wafRequestUrl(request.endpoint)}?q=${encodeURIComponent(request.payload)}`
      : wafRequestUrl(request.endpoint),
    {
      method: request.method,
      cache: "no-store",
      headers:
        request.method === "POST"
          ? { "content-type": "application/json" }
          : undefined,
      body:
        request.method === "POST"
          ? JSON.stringify({ input: request.payload })
          : undefined,
    },
  );
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  return {
    status: response.status,
    statusText: response.statusText,
    latencyMs: Math.round(performance.now() - startedAt),
    body,
    retryAfter: response.headers.get("retry-after"),
  };
}

export interface TrafficStats {
  totalRequests: number;
  allowedRequests: number;
  blockedRequests: number;
  sqlInjectionBlocks: number;
  xssBlocks: number;
  // Phase P3 (docs/architecture.md §22) — requests rejected by the rate
  // limiter, counted separately from sqlInjectionBlocks/xssBlocks.
  rateLimitBlocks: number;
}

export interface SecurityEvent {
  id: string;
  timestamp: string;
  sourceIp: string;
  method: string;
  endpoint: string;
  attackType: SecurityEventAttackType;
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

export type SecurityEventAttackType = "SQL_INJECTION" | "XSS" | "RATE_LIMIT";

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

export interface SystemComponentStatus {
  status: ComponentStatus;
  latencyMs: number | null;
}

export interface SystemStatus {
  wafEngine: SystemComponentStatus;
  mlService: SystemComponentStatus;
  database: SystemComponentStatus;
  // Renamed from `protectedApi` (Phase P1, ADR-8) — reflects whatever
  // upstream the WAF is currently configured to forward to, not
  // specifically the bundled protected-api demo service.
  upstream: SystemComponentStatus;
  checkedAt: string;
}

export interface RateLimitSummary {
  perIpRatePerSecond: number;
  perIpBurst: number;
  globalRatePerSecond: number;
  globalBurst: number;
  maxConcurrency: number;
}

export type WafMode = "MONITOR" | "RULE_BLOCK_ML_MONITOR" | "HYBRID_BLOCK";

export interface SystemInfo {
  version: string;
  environment: string;
  uptimeSeconds: number;
  serverTime: string; // ISO 8601
  mlConfidenceThreshold: number;
  // Phase P5/P6 (docs/architecture.md §22/§23) — read-only, env-sourced.
  wafMode: WafMode;
  rateLimit: RateLimitSummary;
}

export interface UpstreamConnection {
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  checkedAt: string;
}

export interface UpstreamConfiguration {
  url: string;
  source: "RUNTIME" | "ENVIRONMENT";
  updatedAt: string | null;
  connection: UpstreamConnection | null;
}

export interface AdminStatsExtra {
  maliciousIpCount: number;
  countryCount: number;
  requestsThisHour: number;
}

export interface Me {
  username: string;
}

export interface ConfidenceBuckets {
  "0.7-0.8": number;
  "0.8-0.9": number;
  "0.9-1.0": number;
}

export interface TopReasonItem {
  reason: string;
  count: number;
}

export interface TopEndpointItem {
  endpoint: string;
  count: number;
}

export interface DetectionAnalysisResult {
  totalBlocked: number;
  ruleOnlyCount: number;
  mlOnlyCount: number;
  bothCount: number;
  unclassifiedCount: number;
  ruleContributionCount: number;
  mlContributionCount: number;
  confidenceBuckets: ConfidenceBuckets;
  topReasons: TopReasonItem[];
  topEndpoints: TopEndpointItem[];
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

async function authenticatedPatch<T>(
  path: string,
  body: unknown,
  options: { clearTokenOn401?: boolean } = {},
): Promise<T> {
  const { clearTokenOn401 = true } = options;
  const token = getToken();
  if (!token) {
    throw new ApiError(401, "Not logged in");
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401 && clearTokenOn401) {
    clearToken();
  }
  if (!res.ok) {
    throw new ApiError(res.status, await parseErrorMessage(res));
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

async function authenticatedPut<T>(path: string, body: unknown): Promise<T> {
  const token = getToken();
  if (!token) {
    throw new ApiError(401, "Not logged in");
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
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

export function getUpstream(): Promise<UpstreamConfiguration> {
  return authenticatedGet<UpstreamConfiguration>("/admin/upstream");
}

export function updateUpstream(url: string): Promise<UpstreamConfiguration> {
  return authenticatedPut<UpstreamConfiguration>("/admin/upstream", { url });
}

export function getMe(): Promise<Me> {
  return authenticatedGet<Me>("/admin/me");
}

export function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  return authenticatedPatch<void>(
    "/admin/password",
    { currentPassword, newPassword },
    { clearTokenOn401: false },
  );
}

export interface EventListFilter {
  page?: number;
  pageSize?: number;
  attackType?: SecurityEventAttackType;
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

export function getDetectionAnalysis(
  days?: number,
): Promise<DetectionAnalysisResult> {
  return authenticatedGet<DetectionAnalysisResult>(
    `/admin/detection-analysis${days !== undefined ? `?days=${days}` : ""}`,
  );
}
