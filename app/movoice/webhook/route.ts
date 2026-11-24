/**
 * POST /movoice/webhook — Movoice tells you how a call went.
 *
 * 1. Verify the signature on the RAW body (X-Movoice-Signature + X-Movoice-Timestamp). Anything that
 *    fails is refused with 400 and changes nothing.
 * 2. Skip a repeat: Movoice retries a delivery until it gets a 2xx, with the same X-Movoice-Delivery.
 * 3. Find the lead by context_data.leadId (what the call route sent), or else by the stored call id.
 * 4. Write the outcome (event, summary, duration) on the lead.
 *
 * Register this address in Movoice › Settings › Developer › Webhooks; see the README.
 */
import { webhooks, WebhookVerificationError, type CallWebhookEvent } from "movoice";
import { forgetDelivery, listLeads, rememberDelivery, updateLead } from "@/lib/leads";
import { changeFor } from "@/lib/outcome";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.MOVOICE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return Response.json({ error: "MOVOICE_WEBHOOK_SECRET is not set." }, { status: 500 });
  }

  const rawBody = await request.text(); // the exact bytes: parse only after verifying
  let event: CallWebhookEvent;
  try {
    event = await webhooks.verify(rawBody, request.headers, secret);
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  const deliveryId = request.headers.get("x-movoice-delivery") ?? event.event_id;
  if (deliveryId && !(await rememberDelivery(deliveryId))) {
    return Response.json({ ok: true, duplicate: true });
  }

  try {
    const leadId = typeof event.context_data?.leadId === "string" ? event.context_data.leadId : undefined;
    const leads = await listLeads();
    const target =
      leads.find((l) => leadId !== undefined && l.id === leadId) ??
      leads.find((l) => !!event.id && l.callId === event.id);
    const lead = target ? await updateLead((l) => l.id === target.id, (l) => changeFor(l, event)) : undefined;
    // No matching lead (a call placed from somewhere else): answer 200 so Movoice does not retry it.
    return Response.json({ ok: true, leadId: lead?.id ?? null, status: lead?.status ?? null });
  } catch (err) {
    if (deliveryId) await forgetDelivery(deliveryId); // let Movoice's retry try again
    throw err;
  }
}
