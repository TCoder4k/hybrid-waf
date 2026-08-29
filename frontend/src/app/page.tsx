"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Single entry point: /dashboard itself redirects on to /login when there's
// no stored token (see dashboard/page.tsx), so this only needs to pick one
// place to send everyone.
export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return null;
}
