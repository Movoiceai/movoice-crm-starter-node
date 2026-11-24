/**
 * The lead store: one JSON file, data/leads.json.
 *
 * It is created from data/leads.sample.json the first time it is read, so your own changes never
 * show up in git. Swap this file for your real CRM or database: the routes only use the functions
 * exported here.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

export type LeadStatus = "new" | "calling" | "in call" | "called" | "not reached" | "failed";

export interface CallResult {
  /** The Movoice webhook event, e.g. "call.completed". */
  event: string;
  /** A short word for what happened: answered, voicemail, busy, no answer, failed. */
  outcome: string;
  summary: string | null;
  durationSeconds: number | null;
  /** ISO time the result was written. */
  at: string;
}

export interface Lead {
  id: string;
  name: string;
  /** E.164, e.g. +15555550111. */
  phone: string;
  note?: string;
  status: LeadStatus;
  /** The Movoice call id that `calls.create` returned for the latest call. */
  callId: string | null;
  callAttempts: number;
  lastResult: CallResult | null;
  updatedAt: string | null;
}

/** Where the files live. Tests point this at a temporary folder. */
export function dataDir(): string {
  return process.env.LEADS_DIR ?? path.join(process.cwd(), "data");
}

const leadsFile = () => path.join(dataDir(), "leads.json");
const sampleFile = () => path.join(dataDir(), "leads.sample.json");
const deliveriesFile = () => path.join(dataDir(), "deliveries.json");

/** How many webhook delivery ids to remember for de-duplication. */
const MAX_REMEMBERED_DELIVERIES = 1000;

// One write at a time: every read-modify-write below runs inside this queue.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
}

/** Write to a temporary file first, then rename, so a crash never leaves half a file. */
async function writeJson(file: string, value: unknown): Promise<void> {
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await fs.rename(tmp, file);
}

async function loadLeads(): Promise<Lead[]> {
  const leads = await readJson<Lead[] | null>(leadsFile(), null);
  if (leads) return leads;
  const sample = await readJson<Lead[]>(sampleFile(), []);
  await writeJson(leadsFile(), sample);
  return sample;
}

export function listLeads(): Promise<Lead[]> {
  return serial(loadLeads);
}

export async function getLead(id: string): Promise<Lead | undefined> {
  return (await listLeads()).find((l) => l.id === id);
}

/**
 * Change one lead. `find` picks it; `change` returns the new fields, or null to leave it as it is.
 * Returns the lead after the change, or undefined when no lead matched.
 */
export function updateLead(
  find: (lead: Lead) => boolean,
  change: (lead: Lead) => Partial<Lead> | null,
): Promise<Lead | undefined> {
  return serial(async () => {
    const leads = await loadLeads();
    const index = leads.findIndex(find);
    if (index === -1) return undefined;
    const fields = change(leads[index]!);
    if (!fields) return leads[index];
    leads[index] = { ...leads[index]!, ...fields, updatedAt: new Date().toISOString() };
    await writeJson(leadsFile(), leads);
    return leads[index];
  });
}

/**
 * Remember a webhook delivery id. Returns false when it was already seen, so the caller can skip a
 * repeat: Movoice retries a delivery until it gets a 2xx, and a retry carries the same id.
 */
export function rememberDelivery(deliveryId: string): Promise<boolean> {
  return serial(async () => {
    const seen = await readJson<string[]>(deliveriesFile(), []);
    if (seen.includes(deliveryId)) return false;
    seen.push(deliveryId);
    await writeJson(deliveriesFile(), seen.slice(-MAX_REMEMBERED_DELIVERIES));
    return true;
  });
}

/** Forget a delivery id again, when handling it failed and Movoice should be able to retry it. */
export function forgetDelivery(deliveryId: string): Promise<void> {
  return serial(async () => {
    const seen = await readJson<string[]>(deliveriesFile(), []);
    await writeJson(
      deliveriesFile(),
      seen.filter((id) => id !== deliveryId),
    );
  });
}
