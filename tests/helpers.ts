import { createHmac, randomUUID } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { onTestFinished } from "vitest";
import type { Lead } from "@/lib/leads";

export const SECRET = "whsec_test_secret_for_the_starter";

/** A fresh data folder with the 5 sample leads, used by the store through LEADS_DIR. */
export function freshData(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "movoice-crm-"));
  const sample = path.join(import.meta.dirname, "..", "data", "leads.sample.json");
  copyFileSync(sample, path.join(dir, "leads.sample.json"));
  copyFileSync(sample, path.join(dir, "leads.json"));
  process.env.LEADS_DIR = dir;
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

export function readLeads(dir: string): Lead[] {
  return JSON.parse(readFileSync(path.join(dir, "leads.json"), "utf8")) as Lead[];
}

export function lead(dir: string, id: string): Lead {
  return readLeads(dir).find((l) => l.id === id)!;
}

export function writeLeads(dir: string, leads: Lead[]) {
  writeFileSync(path.join(dir, "leads.json"), JSON.stringify(leads, null, 2));
}

/** A webhook request signed the way Movoice signs one. */
export function signedRequest(
  event: Record<string, unknown>,
  opts: { secret?: string; timestamp?: number; delivery?: string; tamper?: boolean } = {},
): Request {
  const body = JSON.stringify(event);
  const ts = String(opts.timestamp ?? Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", opts.secret ?? SECRET).update(`${ts}.${body}`).digest("hex");
  return new Request("http://localhost/movoice/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-movoice-timestamp": ts,
      "x-movoice-signature": `sha256=${sig}`,
      "x-movoice-delivery": opts.delivery ?? `dlv_${randomUUID()}`,
    },
    body: opts.tamper ? body.replace("Wants", "Hates") : body,
  });
}

export function callEvent(fields: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    event_id: `evt_${randomUUID()}`,
    event: "call.completed",
    id: "test_call_abc",
    context_data: { leadId: "L-101", name: "Rahul Sharma" },
    agent: { id: "agent_1" },
    call_id: "test_call_abc",
    agent_id: "engine_1",
    agent_name: "Your agent",
    caller_phone: "+15555550111",
    direction: "outbound",
    duration_seconds: 74,
    summary: "Wants Sat 11am visit",
    timestamp: new Date().toISOString(),
    livemode: false,
    ...fields,
  };
}
