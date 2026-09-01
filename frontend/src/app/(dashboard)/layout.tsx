"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, getMe } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { Footer } from "@/components/Footer";

// Shared chrome (Header + Sidebar + Footer) for every dashboard-area route.
// Owns the "no token at all" auth guard (moved here from the old
// app/dashboard/page.tsx so it isn't duplicated across all 6 nav
// destinations) — a 401 *mid-session* on an authenticated data call is
// still handled by the page making that call (only dashboard/page.tsx
// makes any right now), since the 5 placeholder pages call no API at all.
//
// No "ready"/gating state here: the redirect itself (`router.replace`, not
// a state setter) is enough — rendering the chrome for one frame before an
// unauthenticated visitor is redirected away is the same brief-flash
// tradeoff the old dashboard page already had, and dashboard/page.tsx's own
// data-fetch effect independently self-redirects on a missing token too
// (authenticatedGet throws a 401 ApiError synchronously when there's no
// token), so nothing actually renders with real data either way.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }

    let cancelled = false;

    async function loadMe() {
      try {
        const me = await getMe();
        if (!cancelled) {
          setUsername(me.username);
        }
      } catch (err) {
        if (cancelled) {
          return;
        }
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        // Any other failure (503 DB-down, network error): keep the
        // "admin" fallback rather than block the whole chrome on a
        // non-essential display name.
      }
    }

    void loadMe();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <Header
        username={username}
        onMenuClick={() => setMobileNavOpen((open) => !open)}
      />
      <div className="flex flex-1">
        <Sidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
      <Footer />
    </div>
  );
}
