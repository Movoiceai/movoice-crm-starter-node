import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/leads/[id]/call/route";
import { freshData, lead } from "./helpers";

let dir: string;
let fetchMock: ReturnType<typeof vi.fn>;

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const press = (id: string) => POST(new Request(`http://localhost/api/leads/${id}/call`, { method: "POST" }), ctx(id));

beforeEach(() => {
  dir = freshData();
  process.env.MOVOICE_API_KEY = "mv_test_unit_tests_only";
  process.env.MOVOICE_AGENT_ID = "agent_123";
  process.env.MOVOICE_BASE_URL = "https://testing.movoice.ai";
  // The real movoice SDK runs; only the network is replaced.
  fetchMock = vi.fn(async () =>
    Response.json({
      success: true,
      data: {
        id: "test_call_xyz",
        agentId: "agent_123",
        phoneNumber: "+15555550111",
        status: "initiated",
        startedAt: Date.now(),
        contextData: { leadId: "L-101", name: "Rahul Sharma" },
        livemode: false,
      },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("POST /api/leads/:id/call", () => {
  it("asks Movoice to call the lead with contextData.leadId and stores the call id", async () => {
    const res = await press("L-101");
    expect(res.status).toBe(200);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://testing.movoice.ai/api/v1/calls");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer mv_test_unit_tests_only");
    expect(new Headers(init.headers).get("idempotency-key")).toMatch(/^call-L-101-/);
    expect(JSON.parse(String(init.body))).toEqual({
      agentId: "agent_123",
      phoneNumber: "+15555550111",
      contextData: { leadId: "L-101", name: "Rahul Sharma" },
    });

    expect(lead(dir, "L-101")).toMatchObject({ status: "calling", callId: "test_call_xyz", callAttempts: 1 });
  });

  it("answers 404 for an unknown lead and calls nobody", async () => {
    const res = await press("L-999");
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes Movoice's refusal back and leaves the lead as it was", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json(
        { success: false, error: { code: "INSUFFICIENT_BALANCE", message: "Your balance is empty." } },
        { status: 402 },
      ),
    );
    const res = await press("L-101");
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: "INSUFFICIENT_BALANCE" });
    expect(lead(dir, "L-101")).toMatchObject({ status: "new", callId: null });
  });

  it("says which setting is missing instead of calling", async () => {
    delete process.env.MOVOICE_API_KEY;
    const res = await press("L-101");
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/MOVOICE_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
