/**
 * Turn a Movoice call webhook into what the CRM shows on the lead.
 *
 *   call.started                          -> "in call"
 *   call.completed                        -> "called" · answered (or · voicemail)
 *   call.failed with status busy/no-answer -> "not reached" · busy / no answer
 *   call.failed otherwise                 -> "failed"
 *   call.missed                           -> "not reached" · missed
 */
import type { CallWebhookEvent } from "movoice";
import type { CallResult, Lead, LeadStatus } from "./leads";

/** The webhook fields this starter reads that the SDK's event type does not name. */
type Event = CallWebhookEvent & { status?: string; answered_by?: string };

export function outcomeOf(event: Event): { status: LeadStatus; outcome: string } | null {
  switch (event.event) {
    case "call.started":
      return { status: "in call", outcome: "in call" };
    case "call.completed":
      return { status: "called", outcome: event.answered_by === "voicemail" ? "voicemail" : "answered" };
    case "call.failed":
      if (event.status === "busy") return { status: "not reached", outcome: "busy" };
      if (event.status === "no-answer") return { status: "not reached", outcome: "no answer" };
      return { status: "failed", outcome: "failed" };
    case "call.missed":
      return { status: "not reached", outcome: "missed" };
    default:
      return null; // an event this starter does not use
  }
}

/** The fields to write on the lead for this event, or null to leave the lead as it is. */
export function changeFor(lead: Lead, event: Event): Partial<Lead> | null {
  const result = outcomeOf(event);
  if (!result) return null;

  // A late event for an older call must not overwrite the newest call's result.
  if (event.id && lead.callId && event.id !== lead.callId) return null;

  // call.started can arrive after call.completed (deliveries are not ordered): keep the final result.
  if (event.event === "call.started" && lead.status !== "calling") return null;

  const lastResult: CallResult = {
    event: event.event,
    outcome: result.outcome,
    summary: event.summary ?? null,
    durationSeconds: typeof event.duration_seconds === "number" ? event.duration_seconds : null,
    at: new Date().toISOString(),
  };
  return {
    status: result.status,
    lastResult,
    ...(event.id && !lead.callId ? { callId: event.id } : {}),
  };
}
