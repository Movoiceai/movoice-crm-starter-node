/**
 * POST /api/leads/:id/call — the "Call with AI" button.
 *
 * Asks Movoice to call the lead with your agent, sending { leadId, name } as contextData. Movoice
 * fills {name} in the agent's prompt and sends the same object back as `context_data` on every
 * webhook for this call, which is how app/movoice/webhook finds the lead again.
 */
import { randomUUID } from "node:crypto";
import { MovoiceError } from "movoice";
import { getLead, updateLead } from "@/lib/leads";
import { MissingSettingError, movoiceClient, requireEnv } from "@/lib/movoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const lead = await getLead(id);
  if (!lead) return Response.json({ error: "No lead with that id." }, { status: 404 });

  let call;
  try {
    const movoice = movoiceClient();
    call = await movoice.calls.create(
      {
        agentId: requireEnv("MOVOICE_AGENT_ID"),
        phoneNumber: lead.phone,
        contextData: { leadId: lead.id, name: lead.name },
      },
      // One key per button press: if the request times out, the SDK retries it with the same key and
      // Movoice answers with the first call instead of dialling twice.
      { idempotencyKey: `call-${lead.id}-${randomUUID()}` },
    );
  } catch (err) {
    if (err instanceof MissingSettingError) return Response.json({ error: err.message }, { status: 500 });
    if (err instanceof MovoiceError) {
      // e.g. INSUFFICIENT_BALANCE, FORBIDDEN, INVALID_REQUEST. Never echo your key; the message has none.
      return Response.json({ error: err.message, code: err.code }, { status: 502 });
    }
    throw err;
  }

  const updated = await updateLead(
    (l) => l.id === lead.id,
    (l) => ({ status: "calling", callId: call.id, callAttempts: l.callAttempts + 1, lastResult: null }),
  );
  return Response.json({ lead: updated, callId: call.id, livemode: call.livemode !== false });
}
