"use client";

import { type FormEvent, useEffect, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { ApiError, changePassword, getMe, getSystemInfo } from "@/lib/api";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";

export default function SettingsPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [mlThreshold, setMlThreshold] = useState<number>();
  const [username, setUsername] = useState("—");

  useEffect(() => {
    void getMe().then((me) => setUsername(me.username));
    void getSystemInfo().then((info) => setMlThreshold(info.mlConfidenceThreshold));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(undefined);
    setError(undefined);
    if (newPassword.length < 8) {
      setError("Mật khẩu mới phải có ít nhất 8 ký tự.");
      return;
    }
    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Đổi mật khẩu thành công.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không thể đổi mật khẩu.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Cài đặt" subtitle="Thông tin tài khoản và cấu hình WAF hiện tại" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center gap-3"><KeyRound size={19} className="text-zinc-500" /><h2 className="font-semibold text-zinc-900">Tài khoản</h2></div>
          <p className="mt-4 text-sm text-zinc-600">Username: <strong className="text-zinc-900">{username}</strong></p>
          <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-700">Mật khẩu hiện tại<input required type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="rounded-lg border border-black/[.12] px-3 py-2 font-normal outline-none focus:border-zinc-500" /></label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-700">Mật khẩu mới<input required minLength={8} type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="rounded-lg border border-black/[.12] px-3 py-2 font-normal outline-none focus:border-zinc-500" /></label>
            {error && <p className="text-sm text-red-700">{error}</p>}
            {message && <p className="text-sm text-emerald-700">{message}</p>}
            <button type="submit" disabled={saving} className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Đang cập nhật..." : "Đổi mật khẩu"}</button>
          </form>
        </Card>
        <Card>
          <div className="flex items-center gap-3"><ShieldCheck size={19} className="text-zinc-500" /><h2 className="font-semibold text-zinc-900">Cấu hình phát hiện</h2></div>
          <div className="mt-4 divide-y divide-black/[.06]">
            <div className="flex items-center justify-between py-3 text-sm"><span className="text-zinc-600">Ngưỡng ML hiện tại</span><strong className="text-zinc-900">{mlThreshold === undefined ? "—" : mlThreshold.toFixed(2)}</strong></div>
            <div className="flex items-center justify-between py-3 text-sm"><span className="text-zinc-600">SQL Injection Protection</span><strong className="text-emerald-700">Luôn bật</strong></div>
            <div className="flex items-center justify-between py-3 text-sm"><span className="text-zinc-600">XSS Protection</span><strong className="text-emerald-700">Luôn bật</strong></div>
          </div>
          <p className="mt-4 text-xs text-zinc-500">Thông tin mô hình: đang cập nhật</p>
        </Card>
      </div>
    </div>
  );
}
