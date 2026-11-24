#!/usr/bin/env node
/**
 * npm run simulate-webhook -- [--lead L-101] [--event call.completed] [--status busy] [--url http://localhost:3000/movoice/webhook]
 *
 * Sends your local server a call webhook signed exactly the way Movoice signs one, so the whole loop
 * works before you have a real key or a public address:
 *
 *   X-Movoice-Timestamp: <unix seconds>
 *   X-Movoice-Signature: sha256=<hex HMAC-SHA256(MOVOICE_WEBHOOK_SECRET, "<timestamp>.<raw body>")>
 *   X-Movoice-Delivery:  <a new id per delivery>
 *
 * It signs with MOVOICE_WEBHOOK_SECRET from .env, the same secret the server checks with.
 */
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env: use the environment as it is
}

const { values } = parseArgs({
  options: {
    lead: { type: "string", default: "L-101" },
    event: { type: "string", default: "call.completed" },
    status: { type: "string" },
    summary: { type: "string", default: "Wants Sat 11am visit" },
    url: { type: "string", default: `http://localhost:${process.env.PORT ?? 3000}/movoice/webhook` },
  },
});

const secret = process.env.MOVOICE_WEBHOOK_SECRET?.trim();
if (!secret) {
  console.error("MOVOICE_WEBHOOK_SECRET is not set. Run `cp .env.example .env` first.");
  process.exit(1);
}

// Use the call id the "Call with AI" button stored, so the event matches the lead's latest call.
let lead;
try {
  lead = JSON.parse(readFileSync("data/leads.json", "utf8")).find((l) => l.id === values.lead);
} catch {
  lead = JSON.parse(readFileSync("data/leads.sample.json", "utf8")).find((l) => l.id === values.lead);
}
if (!lead) {
  console.error(`No lead ${values.lead} in data/leads.json.`);
  process.exit(1);
}

const callId = lead.callId ?? `test_call_simulated_${randomUUID().slice(0, 8)}`;
const now = new Date();
const event = {
  event_id: `evt_${randomUUID().replace(/-/g, "")}`,
  event: values.event,
  id: callId,
  context_data: { leadId: lead.id, name: lead.name },
  agent: { id: process.env.MOVOICE_AGENT_ID || "agent_simulated" },
  call_id: callId,
  agent_id: "engine_agent_simulated",
  agent_name: "Your agent",
  caller_phone: lead.phone,
  direction: "outbound",
  timestamp: now.toISOString(),
  livemode: false,
  ...(values.event === "call.completed"
    ? { duration_seconds: 74, summary: values.summary, transcript: [] }
    : {}),
  ...(values.event === "call.failed" ? { status: values.status ?? "busy", duration_seconds: 0 } : {}),
};

const body = JSON.stringify(event);
const timestamp = String(Math.floor(now.getTime() / 1000));
const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

let res;
try {
  res = await fetch(values.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-movoice-timestamp": timestamp,
      "x-movoice-signature": `sha256=${signature}`,
      "x-movoice-delivery": `dlv_${randomUUID()}`,
      "user-agent": "movoice-crm-starter/simulate-webhook",
    },
    body,
  });
} catch (err) {
  console.error(`Could not reach ${values.url}. Is \`npm run dev\` running? (${err.cause?.code ?? err.message})`);
  process.exit(1);
}

console.log(`Sent ${values.event} for ${lead.id} (${lead.name}) to ${values.url}`);
console.log(`Server answered ${res.status}: ${await res.text()}`);
process.exit(res.ok ? 0 : 1);
