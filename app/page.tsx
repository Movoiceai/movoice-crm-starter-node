/**
 * The lead list. A server component: it reads data/leads.json directly, so no key or secret ever
 * reaches the browser. The button posts to /api/leads/:id/call; results arrive by webhook.
 */
import { listLeads, type Lead } from "@/lib/leads";
import { capitalise, formatPhone } from "@/lib/format";
import { CallButton } from "./CallButton";
import { AutoRefresh } from "./AutoRefresh";

export const dynamic = "force-dynamic";

function resultLine(lead: Lead): string | null {
  if (lead.status === "calling") return "Calling…";
  const r = lead.lastResult;
  if (!r) return null;
  const parts = [capitalise(lead.status), r.outcome];
  if (r.summary) parts.push(`“${r.summary}”`);
  return parts.join(" · ");
}

export default async function LeadsPage() {
  const leads = await listLeads();
  const waiting = leads.some((l) => l.status === "calling" || l.status === "in call");

  return (
    <main>
      <header>
        <h1>Leads</h1>
        <p className="muted">
          Press <strong>Call with AI</strong> and your Movoice agent calls the lead. The result appears here when Movoice
          posts it to <code>/movoice/webhook</code>.
        </p>
      </header>

      <ul className="leads">
        {leads.map((lead) => {
          const line = resultLine(lead);
          return (
            <li key={lead.id}>
              <div className="row">
                <div className="who">
                  <span className="name">{lead.name}</span>
                  <span className="phone">{formatPhone(lead.phone)}</span>
                  {lead.note ? <span className="muted small">{lead.note}</span> : null}
                </div>
                <span className={`status status-${lead.status.replace(" ", "-")}`}>{capitalise(lead.status)}</span>
                <CallButton leadId={lead.id} again={lead.status !== "new"} />
              </div>
              {line ? (
                <p className="result">
                  → {line}
                  {lead.lastResult?.durationSeconds ? (
                    <span className="muted"> ({lead.lastResult.durationSeconds} s)</span>
                  ) : null}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <AutoRefresh active={waiting} />
    </main>
  );
}
