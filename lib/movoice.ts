/**
 * The Movoice client, built from your .env. Server only: it holds your secret key, so it is only
 * imported by the route handlers in app/api and app/movoice, never by a page component.
 */
import { Movoice } from "movoice";

export class MissingSettingError extends Error {}

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new MissingSettingError(`${name} is not set. Copy .env.example to .env and fill it in.`);
  return value;
}

export function movoiceClient(): Movoice {
  return new Movoice({
    apiKey: requireEnv("MOVOICE_API_KEY"),
    baseUrl: process.env.MOVOICE_BASE_URL?.trim() || "https://app.movoice.ai",
  });
}
