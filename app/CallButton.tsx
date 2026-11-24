"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CallButton({ leadId, again }: { leadId: string; again: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}/call`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(body.error ?? `The call could not be placed (${res.status}).`);
      router.refresh();
    } catch {
      setError("Could not reach this server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="action">
      <button type="button" onClick={call} disabled={busy}>
        {busy ? "Calling…" : again ? "Call again" : "Call with AI"}
      </button>
      {error ? (
        <span role="alert" className="error">
          {error}
        </span>
      ) : null}
    </span>
  );
}
