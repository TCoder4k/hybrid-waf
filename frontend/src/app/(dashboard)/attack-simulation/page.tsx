"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Info, Send, ShieldAlert, Target } from "lucide-react";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { sendWafTestRequest, type WafTestResult } from "@/lib/api";
import {
  ATTACK_SCENARIOS,
  type AttackScenario,
} from "@/lib/attack-scenarios";

type RunState = "idle" | "running" | "ready" | "error";

function resultLabel(result: WafTestResult): string {
  if (result.status === 429) return "RATE LIMITED";
  if (result.status === 403) return "BLOCKED";
  if (result.status >= 200 && result.status < 300) return "ALLOWED";
  if (result.status === 502 || result.status === 504) return "UPSTREAM ERROR";
  return "RESPONSE";
}

export default function AttackSimulationPage() {
  const [scenario, setScenario] = useState<AttackScenario>(ATTACK_SCENARIOS[1]);
  const [method, setMethod] = useState<"GET" | "POST">(scenario.method);
  const [endpoint, setEndpoint] = useState(scenario.endpoint);
  const [payload, setPayload] = useState(scenario.payload);
  const [state, setState] = useState<RunState>("idle");
  const [result, setResult] = useState<WafTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [burstCount, setBurstCount] = useState(20);
  const [burstRunning, setBurstRunning] = useState(false);
  const [burstSummary, setBurstSummary] = useState<{
    total: number;
    successful: number;
    rateLimited: number;
    other: number;
    retryAfter: string | null;
  } | null>(null);
  const ResultIcon =
    result && (result.status === 403 || result.status === 429)
      ? ShieldAlert
      : CheckCircle2;

  function selectScenario(next: AttackScenario) {
    setScenario(next);
    setMethod(next.method);
    setEndpoint(next.endpoint);
    setPayload(next.payload);
    setResult(null);
    setError(null);
    setState("idle");
  }

  async function runTest() {
    setState("running");
    setResult(null);
    setError(null);
    try {
      setResult(await sendWafTestRequest({ method, endpoint, payload }));
      setState("ready");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Không thể kết nối tới WAF.",
      );
      setState("error");
    }
  }

  async function runBurst() {
    setBurstRunning(true);
    setBurstSummary(null);
    const total = Math.min(100, Math.max(1, burstCount));
    const responses = await Promise.all(
      Array.from({ length: total }, (_, index) =>
        sendWafTestRequest({
          method: "GET",
          endpoint,
          payload: `sandbox-burst-${index}`,
        }).catch(() => null),
      ),
    );
    const valid = responses.filter((response): response is WafTestResult => response !== null);
    const rateLimitedResponse = valid.find((response) => response.status === 429);
    setBurstSummary({
      total,
      successful: valid.filter((response) => response.status >= 200 && response.status < 300).length,
      rateLimited: valid.filter((response) => response.status === 429).length,
      other: total - valid.filter((response) => response.status >= 200 && response.status < 300).length - valid.filter((response) => response.status === 429).length,
      retryAfter: rateLimitedResponse?.retryAfter ?? null,
    });
    setBurstRunning(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <PageHeader
          title="Giả lập tấn công"
          subtitle="Kiểm thử khả năng phát hiện và chặn request của Hybrid WAF."
        />
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
          <Target size={14} /> Khuyên dùng
        </span>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <Info className="mt-0.5 shrink-0" size={18} />
        Request kiểm thử đi qua WAF thật và được xử lý như traffic thật, có thể xuất hiện trong Sự kiện bảo mật và Thống kê.
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">1. Chọn kịch bản</h2>
          <p className="mt-1 text-sm text-zinc-500">Chọn request mẫu để kiểm tra pipeline WAF.</p>
          <div className="mt-5 flex flex-col gap-2">
            {ATTACK_SCENARIOS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectScenario(item)}
                className={`rounded-lg border p-3 text-left transition ${
                  item.id === scenario.id
                    ? "border-blue-400 bg-blue-50 text-blue-900"
                    : "border-black/[.08] hover:bg-zinc-50"
                }`}
              >
                <div className="text-sm font-semibold">{item.name}</div>
                <div className="mt-1 text-xs text-zinc-500">{item.description}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">2. Request</h2>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-[110px_1fr]">
            <label className="text-xs font-semibold text-zinc-500">
              Method
              <select value={method} onChange={(event) => setMethod(event.target.value as "GET" | "POST")} className="mt-1.5 w-full rounded-lg border border-black/[.12] bg-white px-3 py-2 text-sm text-zinc-800">
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-zinc-500">
              Endpoint
              <input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} className="mt-1.5 w-full rounded-lg border border-black/[.12] px-3 py-2 text-sm text-zinc-800" placeholder="/api/hello" />
            </label>
          </div>
          <label className="mt-5 block text-xs font-semibold text-zinc-500">
            Payload
            <textarea value={payload} onChange={(event) => setPayload(event.target.value)} rows={7} className="mt-1.5 w-full rounded-lg border border-black/[.12] p-3 font-mono text-sm text-zinc-800 outline-none focus:border-blue-500" />
          </label>
          <button type="button" onClick={() => void runTest()} disabled={state === "running" || endpoint.trim() === ""} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
            <Send size={16} />
            {state === "running" ? "Đang gửi request..." : "Gửi request"}
          </button>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">3. Kết quả kiểm thử</h2>
          {result && <span className="text-xs text-zinc-500">{result.latencyMs} ms</span>}
        </div>
        {state === "idle" && <p className="mt-8 text-center text-sm text-zinc-500">Chưa có request nào được gửi.</p>}
        {state === "running" && <p className="mt-8 text-center text-sm text-blue-600">Đang gửi request qua WAF...</p>}
        {state === "error" && <div className="mt-5 flex items-center gap-3 rounded-lg bg-red-50 p-4 text-sm text-red-700"><AlertCircle size={18} />{error}</div>}
        {result && (
          <div className="mt-5 rounded-xl border border-black/[.08] overflow-hidden">
            <div className={`flex items-center justify-between gap-3 p-4 ${result.status === 403 || result.status === 429 ? "bg-red-50" : result.status >= 200 && result.status < 300 ? "bg-emerald-50" : "bg-amber-50"}`}>
              <div className="flex items-center gap-2 font-semibold"><ResultIcon size={20} />{resultLabel(result)}</div>
              <strong>HTTP {result.status}</strong>
            </div>
            <div className="grid gap-4 p-4 text-sm sm:grid-cols-3">
              <div><span className="text-zinc-500">Status</span><div className="font-semibold">{result.status} {result.statusText}</div></div>
              <div><span className="text-zinc-500">Latency</span><div className="font-semibold">{result.latencyMs} ms</div></div>
              <div><span className="text-zinc-500">Retry-After</span><div className="font-semibold">{result.retryAfter ? `${result.retryAfter}s` : "—"}</div></div>
            </div>
            <pre className="mx-4 mb-4 max-h-60 overflow-auto rounded-lg bg-zinc-950 p-4 text-xs text-zinc-100">{typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2)}</pre>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Kiểm thử Rate Limit</h2>
            <p className="mt-1 text-sm text-zinc-500">Burst nhỏ qua đúng endpoint WAF đang được bảo vệ.</p>
          </div>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">Tối đa 100 request</span>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="text-xs font-semibold text-zinc-500">
            Số request
            <input type="number" min={1} max={100} value={burstCount} onChange={(event) => setBurstCount(Number(event.target.value))} className="mt-1.5 block w-full rounded-lg border border-black/[.12] px-3 py-2 text-sm text-zinc-800 sm:w-32" />
          </label>
          <button type="button" onClick={() => void runBurst()} disabled={burstRunning || endpoint.trim() === ""} className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50">
            {burstRunning ? "Đang chạy burst..." : "Chạy Burst Test"}
          </button>
        </div>
        {burstSummary && (
          <div className="mt-5 grid gap-3 text-sm sm:grid-cols-4">
            <div className="rounded-lg bg-zinc-50 p-3"><span className="text-zinc-500">Tổng</span><strong className="mt-1 block">{burstSummary.total}</strong></div>
            <div className="rounded-lg bg-emerald-50 p-3"><span className="text-emerald-700">2xx OK</span><strong className="mt-1 block text-emerald-800">{burstSummary.successful}</strong></div>
            <div className="rounded-lg bg-red-50 p-3"><span className="text-red-700">429 Rate Limited</span><strong className="mt-1 block text-red-800">{burstSummary.rateLimited}</strong></div>
            <div className="rounded-lg bg-amber-50 p-3"><span className="text-amber-700">Retry-After</span><strong className="mt-1 block text-amber-800">{burstSummary.retryAfter ? `${burstSummary.retryAfter}s` : "—"}</strong></div>
          </div>
        )}
      </Card>
    </div>
  );
}