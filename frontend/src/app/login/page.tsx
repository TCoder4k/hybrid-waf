"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  Lock,
  LogIn,
  Shield,
  ShieldCheck,
  User,
} from "lucide-react";
import { ApiError, login } from "@/lib/api";
import { setToken } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { accessToken } = await login(username, password);
      setToken(accessToken, remember);
      router.push("/dashboard");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not reach the server. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full flex-1 overflow-x-hidden bg-white">
      {/* Left branding panel — a single pre-designed marketing graphic,
          hidden below lg since it's not functional content. */}
      <div className="relative hidden w-1/2 bg-gradient-to-b from-[#053683] to-[#001943] lg:block">
        <Image
          src="/login-hero.png"
          alt="Hybrid WAF — Protect Your Web Applications"
          fill
          priority
          className="object-contain"
          sizes="50vw"
        />
      </div>

      {/* Right panel — login form */}
      <div className="relative flex min-w-0 flex-1 flex-col items-center justify-center overflow-hidden bg-zinc-50 px-4 py-12">
        {/* Soft blurred blobs so the card reads as floating rather than
            sitting on a flat white page — decorative only, kept subtle to
            respect the light-theme/white-surfaces design direction. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-blue-200/40 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-blue-100/60 blur-3xl"
        />

        <span className="absolute right-6 top-6 text-xs text-zinc-400">
          v1.0.0
        </span>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="relative flex w-full min-w-0 max-w-md flex-col gap-5 rounded-2xl border border-zinc-200 bg-white p-8 shadow-lg shadow-blue-900/5 sm:p-10"
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600">
              <Shield className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-900">Hybrid WAF</h1>
              <p className="text-sm font-medium text-blue-600">
                Admin Dashboard
              </p>
            </div>
            <p className="text-sm text-zinc-500">
              Đăng nhập để quản trị hệ thống
            </p>
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-zinc-700">Username</span>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                className="w-full rounded-lg border border-zinc-300 bg-white py-2.5 pl-10 pr-3 text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                placeholder="Nhập tên đăng nhập"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-zinc-700">Password</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type={showPassword ? "text" : "password"}
                className="w-full rounded-lg border border-zinc-300 bg-white py-2.5 pl-10 pr-10 text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                placeholder="Nhập mật khẩu"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </label>

          <label className="flex items-center gap-2 text-sm text-zinc-600">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500/30"
            />
            Ghi nhớ đăng nhập
          </label>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            <LogIn className="h-4 w-4" />
            {submitting ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>

          <div className="flex items-center gap-3 text-xs text-zinc-400">
            <div className="h-px flex-1 bg-zinc-200" />
            hoặc
            <div className="h-px flex-1 bg-zinc-200" />
          </div>

          <div className="flex items-start gap-2.5 rounded-lg bg-blue-50 px-4 py-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <div className="text-xs">
              <p className="font-semibold text-blue-700">
                Chỉ dành cho quản trị viên được ủy quyền
              </p>
              <p className="mt-0.5 text-blue-600/70">
                Mọi hoạt động đăng nhập đều được ghi lại
              </p>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
