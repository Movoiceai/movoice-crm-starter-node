<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Movoice CRM starter: notes for AI coding agents

This is a small CRM that places AI phone calls through Movoice and writes each call's result back onto the lead.

- `lib/movoice.ts` makes the Movoice client (`movoice` npm package), used only by server routes.
- `app/api/leads/[id]/call/route.ts` is the server route the **Call with AI** button posts to: it places the call with the lead id in `contextData`. The API key stays on the server.
- `app/movoice/webhook/route.ts` receives Movoice's signed webhook, checks the signature (`MOVOICE_WEBHOOK_SECRET`), skips repeats by the delivery id (`X-Movoice-Delivery`, the same value as `event_id`), finds the lead from `context_data` and writes the result.
- `lib/outcome.ts` turns a webhook into the lead's status.

Work without a key: `npm run dev`, then `npm run simulate-webhook` (signed exactly like Movoice). A free test key (`mv_test_...`, Movoice › Settings › Developer › API keys) makes pretend calls that send real webhooks; nothing is charged. Run `npm test` before you finish.

To add Movoice calling to a different project, follow https://www.movoice.ai/setup.md step by step.
