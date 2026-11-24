import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/movoice/webhook/route";
import { callEvent, freshData, lead, readLeads, SECRET, signedRequest, writeLeads } from "./helpers";

let dir: string;

beforeEach(() => {
  dir = freshData();
  process.env.MOVOICE_WEBHOOK_SECRET = SECRET;
});

/** Put L-101 in the state the call route leaves it in: calling, with the call id stored. */
function calling(callId = "test_call_abc") {
  const leads = readLeads(dir);
  const l = leads.find((x) => x.id === "L-101")!;
  l.status = "calling";
  l.callId = callId;
  writeLeads(dir, leads);
}

describe("POST /movoice/webhook", () => {
  it("accepts a correctly signed call.completed and writes the outcome on the lead", async () => {
    calling();
    const res = await POST(signedRequest(callEvent()));
    expect(res.status).toBe(200);
    const l = lead(dir, "L-101");
    expect(l.status).toBe("called");
    expect(l.lastResult).toMatchObject({
      event: "call.completed",
      outcome: "answered",
      summary: "Wants Sat 11am visit",
      durationSeconds: 74,
    });
  });

  // Every row is a delivery that must be refused with 400 and change nothing.
  const refused: Array<[string, Parameters<typeof signedRequest>[1]]> = [
    ["a signature made with another secret", { secret: "whsec_someone_else" }],
    ["a body changed after signing", { tamper: true }],
    ["a timestamp 10 minutes old (a replay)", { timestamp: Math.floor(Date.now() / 1000) - 600 }],
    ["a timestamp 10 minutes in the future", { timestamp: Math.floor(Date.now() / 1000) + 600 }],
  ];
  it.each(refused)("refuses %s", async (_name, opts) => {
    calling();
    const before = lead(dir, "L-101");
    const res = await POST(signedRequest(callEvent(), opts));
    expect(res.status).toBe(400);
    expect(lead(dir, "L-101")).toEqual(before);
  });

  it("refuses a delivery with no signature headers", async () => {
    calling();
    const res = await POST(
      new Request("http://localhost/movoice/webhook", { method: "POST", body: JSON.stringify(callEvent()) }),
    );
    expect(res.status).toBe(400);
    expect(lead(dir, "L-101").status).toBe("calling");
  });

  it("handles a repeated X-Movoice-Delivery only once", async () => {
    calling();
    const first = await POST(signedRequest(callEvent(), { delivery: "dlv_same" }));
    expect(await first.json()).toMatchObject({ ok: true, status: "called" });
    const afterFirst = lead(dir, "L-101");

    // Same delivery id, different (validly signed) content: it must be skipped, not applied.
    const repeat = await POST(
      signedRequest(callEvent({ event: "call.failed", status: "busy", summary: undefined }), { delivery: "dlv_same" }),
    );
    expect(repeat.status).toBe(200);
    expect(await repeat.json()).toMatchObject({ duplicate: true });
    expect(lead(dir, "L-101")).toEqual(afterFirst);
  });

  it("finds the lead by the stored call id when context_data is missing", async () => {
    calling("test_call_only_id");
    const res = await POST(signedRequest(callEvent({ id: "test_call_only_id", context_data: undefined })));
    expect(res.status).toBe(200);
    expect(lead(dir, "L-101").status).toBe("called");
  });

  // What each call ending shows on the lead.
  const endings: Array<[string, Record<string, unknown>, string, string]> = [
    ["answered", {}, "called", "answered"],
    ["voicemail", { answered_by: "voicemail" }, "called", "voicemail"],
    ["busy", { event: "call.failed", status: "busy" }, "not reached", "busy"],
    ["no answer", { event: "call.failed", status: "no-answer" }, "not reached", "no answer"],
    ["failed", { event: "call.failed", status: "failed" }, "failed", "failed"],
  ];
  it.each(endings)("shows %s", async (_name, fields, status, outcome) => {
    calling();
    await POST(signedRequest(callEvent(fields)));
    expect(lead(dir, "L-101")).toMatchObject({ status, lastResult: { outcome } });
  });

  it("keeps the final result when call.started arrives late", async () => {
    calling();
    await POST(signedRequest(callEvent()));
    await POST(signedRequest(callEvent({ event: "call.started", summary: undefined })));
    expect(lead(dir, "L-101").status).toBe("called");
  });

  it("ignores a late event from an older call of the same lead", async () => {
    calling("test_call_newest");
    await POST(signedRequest(callEvent({ id: "test_call_older", event: "call.failed", status: "busy" })));
    expect(lead(dir, "L-101").status).toBe("calling");
  });
});
