# Movoice CRM starter (Node.js)

A tiny CRM that calls your leads with a [Movoice AI](https://movoice.ai) voice agent and writes
the result back on the lead. Next.js (App Router) + TypeScript + the
[`movoice`](https://www.npmjs.com/package/movoice) npm package. About 300 lines you can read in
one sitting, then copy into your own app.

```
git clone github.com/Movoiceai/movoice-crm-starter-node
cd movoice-crm-starter-node
cp .env.example .env   # paste your free mv_test_ key
npm install && npm run dev

Leads
  Rahul Sharma  +1 555 555 0111   [Call with AI]
  → Called · answered · "Wants Sat 11am visit"
```

Open http://localhost:3000. Python instead? See
[movoice-crm-starter-python](https://github.com/Movoiceai/movoice-crm-starter-python).

## How it works

1. You press **Call with AI**. The server calls `movoice.calls.create()` with your agent, the lead's
   number and `contextData: { leadId, name }`, and stores the returned call id on the lead
   (status **Calling**). `{name}` fills the matching placeholder in your agent's prompt.
2. Movoice calls the lead. When the call starts and ends, Movoice posts a signed webhook
   (`call.started`, `call.completed`, `call.failed`) to `/movoice/webhook`, carrying your
   `contextData` back as `context_data`.
3. The webhook route checks the signature, skips repeats, finds the lead by
   `context_data.leadId` (or by the stored call id) and writes the outcome, summary and duration.
   The page refreshes itself while a call is in progress.

## Try it with no key at all

```
cp .env.example .env
npm install
npm run dev                  # terminal 1
npm run simulate-webhook     # terminal 2
```

`simulate-webhook` sends your local server a `call.completed` for Rahul Sharma, signed exactly the
way Movoice signs one, with the placeholder secret from `.env.example`. Reload the page: Rahul
now shows **Called · answered · "Wants Sat 11am visit"**. Other endings:

```
npm run simulate-webhook -- --lead L-102 --event call.failed --status busy
npm run simulate-webhook -- --lead L-103 --event call.failed --status no-answer
npm run simulate-webhook -- --lead L-104 --event call.failed --status failed
npm run reset-leads          # back to the 5 sample leads
```

## Free test key: pretend calls, real webhooks

Make a free test key (`mv_test_...`) in **Movoice › Settings › Developer › API keys**. A test key
places pretend calls: nobody is dialled and nothing is charged, but Movoice still sends your
webhook `call.started` and then `call.completed` or `call.failed`, with your `context_data`.

The five sample leads sit on Movoice's five test numbers, each with a fixed ending:

| Number | Lead | What the pretend call does |
| --- | --- | --- |
| +1 555 555 0111 | Rahul Sharma | answers |
| +1 555 555 0112 | Priya Nair | busy |
| +1 555 555 0113 | Emma Lewis | no answer |
| +1 555 555 0114 | Arjun Mehta | fails |
| +1 555 555 0115 | Sofia Martins | goes to voicemail |

These are in the North American 555-01xx range, which is set aside for fiction. The names are made up.

### Let Movoice reach your laptop

Movoice can only post webhooks to a public HTTPS address. While developing, open a tunnel to your
local server:

```
cloudflared tunnel --url http://localhost:3000    # or: ngrok http 3000
```

Then in **Movoice › Settings › Developer › Webhooks**, add an endpoint:

- URL: `https://<your-tunnel-address>/movoice/webhook`
- Events: `call.started`, `call.completed`, `call.failed`

Copy the endpoint's signing secret (`whsec_...`) into `MOVOICE_WEBHOOK_SECRET` in `.env` and
restart `npm run dev`. Now press **Call with AI** on Rahul: within about a minute he moves from
**Calling** to **Called**.

## Settings (`.env`)

| Name | What it is |
| --- | --- |
| `MOVOICE_API_KEY` | Your secret key, `mv_test_...` or `mv_live_...`. Server only. |
| `MOVOICE_AGENT_ID` | The agent that makes the calls. |
| `MOVOICE_WEBHOOK_SECRET` | Your webhook endpoint's signing secret, `whsec_...`. |
| `MOVOICE_BASE_URL` | Optional. Default `https://app.movoice.ai`. Movoice's testing server is `https://testing.movoice.ai`. |

Your key never reaches the browser: only the route handlers in `app/api` and `app/movoice` read
it, and `.env` is in `.gitignore`. Commit `.env.example` only.

## What each file does

```
app/
  page.tsx                       the lead list (server component, reads data/leads.json)
  CallButton.tsx                 the "Call with AI" button (posts to the call route)
  AutoRefresh.tsx                re-reads the list every 3 s while a call is in progress
  layout.tsx, globals.css        page shell and styles (light and dark)
  api/leads/[id]/call/route.ts   POST: calls.create with contextData { leadId, name }, stores the call id
  movoice/webhook/route.ts       POST: verify signature, skip repeats, write the outcome on the lead
lib/
  leads.ts                       the lead store: data/leads.json, one write at a time
  outcome.ts                     webhook event -> status and outcome shown on the lead
  movoice.ts                     the Movoice client from .env
  format.ts                      phone number display
data/
  leads.sample.json              the 5 sample leads (copied to data/leads.json on first run)
scripts/
  simulate-webhook.mjs           send a correctly signed webhook to your local server
  reset-leads.mjs                put the sample leads back
tests/
  webhook.test.ts                signature, old timestamp, repeats, lead lookup, every ending
  call.test.ts                   what is sent to Movoice, errors, missing settings
.github/workflows/test.yml       runs the tests and a build on every push
```

`data/leads.json` and `data/deliveries.json` are your data and stay out of git. To use your own
CRM or database, replace `lib/leads.ts`: the routes only use `listLeads`, `getLead`,
`updateLead`, `rememberDelivery` and `forgetDelivery`.

## Webhook details

- The signature is checked on the raw body, before parsing:
  `X-Movoice-Signature: sha256=<hex HMAC-SHA256(secret, "<X-Movoice-Timestamp>.<body>")>`.
  `webhooks.verify()` from the `movoice` package does this and refuses a timestamp more than
  5 minutes from now (a replay). Refused deliveries get a 400 and change nothing.
- Movoice retries a delivery until it gets a 2xx, with the same `X-Movoice-Delivery`. The route
  remembers the last 1,000 delivery ids and answers a repeat with 200 without applying it again.
- Deliveries are not ordered: a late `call.started` never overwrites a finished result, and an
  event for an older call of the same lead is ignored.

## Tests

```
npm test
```

19 tests with [Vitest](https://vitest.dev). They run the real route handlers against a temporary
copy of the sample leads and the real `movoice` package, with the network replaced: nothing is
called.

## Going live

1. **Live key.** Swap `mv_test_` for an `mv_live_` key. Live calls dial real people and are charged
   to your Movoice balance.
2. **Real numbers need identity checks (KYC).** Placing live calls needs a verified account and a
   phone number on it. Movoice asks for the documents your country's rules require when you set
   that up.
3. **Consent.** Only call people who gave you their number and asked to hear from you (a form, a
   booking, an existing customer). Keep a record of that consent, honour opt-outs at once, and say
   at the start of the call that it is an AI assistant calling for your business.
4. **India.** Follow TRAI's rules for commercial calls: check the National Customer Preference
   Register (DND) before promotional calls, call only between 9 am and 9 pm, and use the number
   series assigned to your business. Other countries have their own rules (TCPA in the US, PECR in
   the UK); you are responsible for following the ones where your leads are.
5. **Host it** anywhere that runs Next.js with a persistent disk (or swap `lib/leads.ts` for a
   database), set the same four settings there, and point the webhook endpoint at
   `https://<your-domain>/movoice/webhook`.

## Links

- Movoice API docs: https://docs.movoice.ai
- The `movoice` package: https://www.npmjs.com/package/movoice

## Licence

MIT. See [LICENSE](LICENSE).
