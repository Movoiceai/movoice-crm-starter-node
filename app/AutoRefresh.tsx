"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** While a call is in progress, re-read the list every 3 seconds so the webhook's result shows up. */
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [active, router]);
  return null;
}
