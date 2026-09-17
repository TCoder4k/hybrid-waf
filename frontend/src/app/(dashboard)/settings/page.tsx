"use client";

import { type FormEvent, useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Check,
  ExternalLink,
  Gauge,
  Globe2,
  KeyRound,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  ApiError,
  changePassword,
  getMe,
  getSystemInfo,
  getUpstream,
  updateUpstream,
  type RateLimitSummary,
  type UpstreamConfiguration,
  type WafMode,
} from "@/lib/api";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";

const WAF_MODE_LABELS: Record<WafMode, string> = {
  HYBRID_BLOCK: "Hybrid Block (chặn đầy đủ)",
  RULE_BLOCK_ML_MONITOR: "Rule Block + ML Monitor",
  MONITOR: "Monitor (chỉ ghi nhận)",
};

function formatCheckedAt(value: string | null | undefined): string {
  if (!value) return "Chưa kiểm tra";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

function statusLabel(status: number | null | undefined): string {
  return status === null || status === undefined
    ? "—"
    : `${status} ${status < 400 ? "OK" : "Error"}`;
}

export default function SettingsPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [savingPassword, setSavingPassword] = useState(false);
  const [upstreamUrl, setUpstreamUrl] = useState("");
  const [upstream, setUpstream] = useState<UpstreamConfiguration>();
  const [upstreamError, setUpstreamError] = useState<string>();
  const [savingUpstream, setSavingUpstream] = useState(false);
  const [mlThreshold, setMlThreshold] = useState<number>();
  const [wafMode, setWafMode] = useState<WafMode>();
  const [rateLimit, setRateLimit] = useState<RateLimitSummary>();
  const [username, setUsername] = useState("—");

  useEffect(() => {
    void getMe().then((me) => setUsername(me.username));
    void getUpstream().then((configuration) => {
      setUpstream(configuration);
      setUpstreamUrl(configuration.url);
    });
    void getSystemInfo().then((info) => {
      setMlThreshold(info.mlConfidenceThreshold);
      setWafMode(info.wafMode);
      setRateLimit(info.rateLimit);
    });
  }, []);

  async function saveUpstream(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUpstreamError(undefined);
    setSavingUpstream(true);
    try {
      const configuration = await updateUpstream(upstreamUrl.trim());
      setUpstream(configuration);
      setUpstreamUrl(configuration.url);
    } catch (error) {
      setUpstreamError(
        error instanceof ApiError
          ? error.message
          : "Không thể kết nối tới ứng dụng đích. Cấu hình hiện tại vẫn được giữ nguyên.",
      );
    } finally {
      setSavingUpstream(false);
    }
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage(undefined);
    setPasswordError(undefined);
    if (newPassword.length < 8) {
      setPasswordError("Mật khẩu mới phải có ít nhất 8 ký tự.");
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setPasswordMessage("Đổi mật khẩu thành công.");
    } catch (error) {
      setPasswordError(
        error instanceof ApiError ? error.message : "Không thể đổi mật khẩu.",
      );
    } finally {
      setSavingPassword(false);
    }
  }

  const connection = upstream?.connection;
  const isConnected = connection?.ok === true;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Cài đặt"
        subtitle="Cấu hình hệ thống WAF và các tùy chọn bảo mật"
      />

      <Card className="p-6">
        <div className="mb-6 flex items-start gap-3">
          <Globe2 className="mt-0.5 text-blue-600" size={24} />
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Ứng dụng đích cần bảo vệ
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Cấu hình website hoặc API mà bạn muốn bảo vệ thông qua Hybrid WAF
            </p>
          </div>
        </div>
        <div className="grid gap-8 lg:grid-cols-[1.35fr_1fr] lg:items-center">
          <form onSubmit={saveUpstream}>
            <label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              URL ứng dụng đích (UPSTREAM_URL)
              <span className="relative mt-2 block">
                <Globe2
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-500"
                  size={18}
                />
                <input
                  value={upstreamUrl}
                  onChange={(event) => setUpstreamUrl(event.target.value)}
                  placeholder="https://your-website.com"
                  className="w-full rounded-lg border border-blue-400 bg-white px-10 py-3 text-sm font-normal text-zinc-800 outline-none ring-2 ring-blue-500/10 focus:ring-blue-500/25 dark:bg-zinc-950 dark:text-zinc-100"
                />
                {upstreamUrl && (
                  <button
                    type="button"
                    aria-label="Xóa URL"
                    onClick={() => setUpstreamUrl("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
                  >
                    <X size={17} />
                  </button>
                )}
              </span>
            </label>
            <p className="mt-2 text-xs text-zinc-500">
              Nhập địa chỉ đầy đủ (http:// hoặc https://). Ví dụ:
              https://example.com hoặc http://internal-app:8080
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={savingUpstream || upstreamUrl.trim() === ""}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check size={17} />
                {savingUpstream ? "Đang kiểm tra..." : "Kiểm tra & Lưu"}
              </button>
              {upstream?.url && (
                <a
                  href={upstream.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-5 py-3 text-sm font-semibold text-blue-600 hover:bg-blue-100"
                >
                  <ExternalLink size={17} />
                  Mở website
                </a>
              )}
            </div>
            {upstreamError && (
              <p className="mt-3 text-sm text-red-700">{upstreamError}</p>
            )}
          </form>

          <div
            className={`rounded-xl border p-5 ${
              isConnected
                ? "border-emerald-200 bg-emerald-50/70"
                : "border-zinc-200 bg-zinc-50"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div
                className={`flex items-center gap-2 font-semibold ${
                  isConnected ? "text-emerald-700" : "text-zinc-600"
                }`}
              >
                {isConnected ? <Check size={21} /> : <Activity size={21} />}
                {isConnected
                  ? "Kết nối thành công"
                  : "Chưa kiểm tra kết nối"}
              </div>
              {connection?.latencyMs !== null &&
                connection?.latencyMs !== undefined && (
                  <span className="text-sm font-semibold text-emerald-700">
                    {connection.latencyMs} ms
                  </span>
                )}
            </div>
            <div className="mt-4 divide-y divide-black/[.08] text-sm">
              <div className="flex justify-between gap-4 py-3">
                <span className="text-zinc-500">URL</span>
                <strong className="max-w-[65%] truncate text-right text-blue-600">
                  {upstream?.url ?? "—"}
                </strong>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <span className="text-zinc-500">HTTP Status</span>
                <strong className="text-zinc-700 dark:text-zinc-200">
                  {statusLabel(connection?.status)}
                </strong>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <span className="text-zinc-500">Nguồn cấu hình</span>
                <strong className="text-zinc-700 dark:text-zinc-200">
                  {upstream?.source === "RUNTIME" ? "Runtime" : "Environment"}
                </strong>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <span className="text-zinc-500">Kiểm tra lần cuối</span>
                <strong className="text-right text-zinc-700 dark:text-zinc-200">
                  {formatCheckedAt(connection?.checkedAt)}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <div className="flex items-center gap-3">
            <ShieldCheck className="text-zinc-500" size={21} />
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
              Chế độ bảo vệ
            </h2>
          </div>
          <div className="mt-5 flex items-center justify-between gap-3 text-sm">
            <span className="text-zinc-500">WAF_MODE</span>
            <strong className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">
              {wafMode ? WAF_MODE_LABELS[wafMode] : "—"}
            </strong>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-sm">
            <span className="text-zinc-500">Ngưỡng ML</span>
            <strong className="text-zinc-800 dark:text-zinc-200">
              {mlThreshold === undefined ? "—" : mlThreshold.toFixed(2)}
            </strong>
          </div>
          <p className="mt-5 text-sm leading-6 text-zinc-500">
            Kết hợp Rule-based và ML để chặn các tấn công đã biết với độ tin cậy cao.
          </p>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <Gauge className="text-zinc-500" size={21} />
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
              Giới hạn tần suất
            </h2>
          </div>
          <div className="mt-4 divide-y divide-black/[.06] text-sm">
            <div className="flex justify-between py-3">
              <span className="text-zinc-500">Mỗi IP (req/s, burst)</span>
              <strong>
                {rateLimit
                  ? `${rateLimit.perIpRatePerSecond} / ${rateLimit.perIpBurst}`
                  : "—"}
              </strong>
            </div>
            <div className="flex justify-between py-3">
              <span className="text-zinc-500">Toàn hệ thống</span>
              <strong>
                {rateLimit
                  ? `${rateLimit.globalRatePerSecond} / ${rateLimit.globalBurst}`
                  : "—"}
              </strong>
            </div>
            <div className="flex justify-between py-3">
              <span className="text-zinc-500">Xử lý đồng thời tối đa</span>
              <strong>{rateLimit?.maxConcurrency ?? "—"}</strong>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <BookOpen className="text-zinc-500" size={21} />
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
              Hướng dẫn nhanh
            </h2>
          </div>
          <p className="mt-5 text-sm leading-6 text-zinc-500">
            Nhập URL mới và nhấn “Kiểm tra & Lưu”. WAF sẽ kiểm tra kết nối trước khi chuyển sang ứng dụng mới.
          </p>
          <a
            href="/system"
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            Xem hướng dẫn chi tiết <ArrowUpRight size={16} />
          </a>
        </Card>
      </div>

      <Card>
        <div className="flex items-center gap-3">
          <KeyRound className="text-zinc-500" size={21} />
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
            Tài khoản quản trị
          </h2>
        </div>
        <p className="mt-4 text-sm text-zinc-600">
          Username: <strong className="text-zinc-900 dark:text-zinc-100">{username}</strong>
        </p>
        <form onSubmit={submitPassword} className="mt-5 grid gap-4 md:grid-cols-3 md:items-end">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Mật khẩu hiện tại
            <input required type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="rounded-lg border border-black/[.12] px-3 py-2 font-normal outline-none focus:border-blue-500 dark:bg-zinc-950" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Mật khẩu mới
            <input required minLength={8} type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="rounded-lg border border-black/[.12] px-3 py-2 font-normal outline-none focus:border-blue-500 dark:bg-zinc-950" />
          </label>
          <button type="submit" disabled={savingPassword} className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {savingPassword ? "Đang cập nhật..." : "Đổi mật khẩu"}
          </button>
        </form>
        {passwordError && <p className="mt-3 text-sm text-red-700">{passwordError}</p>}
        {passwordMessage && <p className="mt-3 text-sm text-emerald-700">{passwordMessage}</p>}
      </Card>
    </div>
  );
}
