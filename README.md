<div align="center">
  <img src="public/brand/logo.png" alt="Cue" width="88" />
  <h1>Cue</h1>
  <p>Send money by chatting with Claude. The person receiving it only needs an email address.</p>
  <p>
    <a href="https://cue-navy-psi.vercel.app">Live site</a>
    &nbsp;·&nbsp; Arc testnet (chain 5042002)
    &nbsp;·&nbsp; Circle hackathon submission
  </p>
</div>

## Live demo

**https://cue-navy-psi.vercel.app**

Runs on Arc testnet with test funds. No real money is involved.

![Cue landing page](docs/landing.png)

![Cue dashboard](docs/dashboard.png)

## What it does

The sender types one sentence to Claude, for example "Send Jack 50 dollars, jack@gmail.com". A confirmation appears showing the amount and recipient, and the sender approves it. The money goes out to the recipient, and the sender has one hour to call it back before it can be collected. The recipient gets an email with a link, enters the address the money was sent to, and collects it. They do not install an app or set anything up first.

The words crypto, wallet and USDC never appear anywhere the user can see. To a sender and a recipient it is dollars, sending, and collecting.

## How it works

1. **Send.** A row is written to the `transactions` table with status `pending_claim`, a cryptographically random 32 byte claim token (43 url safe characters), and a `cancel_deadline` set to one hour ahead. No money moves on chain at this point.
2. **Hold.** Because funds stay in the sender account until collection, cancelling is a single conditional status update to `cancelled`. There is never an on chain reversal to unwind, which is what makes the one hour call back window safe.
3. **Claim gate.** Collecting requires both the claim token and a recipient email that matches the one the money was sent to, and it is only allowed once `cancel_deadline` has passed.
4. **Collect.** On a valid claim we find or create the recipient user, create a Circle wallet for them on Arc testnet if they do not have one, move the row to `claimed` with a conditional update so a claim and a cancel cannot both win, and only then transfer USDC from the treasury wallet to the recipient.
5. **Settlement handling.** The transfer is polled to a terminal state. A terminal failure releases the row back to `pending_claim` so it can be tried again, since no money moved. A timeout leaves the row `claimed` and reports that it is still settling, so a transfer is never sent twice.

## Circle and Arc usage

- **Circle Developer Controlled Wallets** for wallet sets, recipient wallet creation, balance reads and USDC transfers. Client setup in [`src/lib/circle/client.ts`](src/lib/circle/client.ts), all wallet and transfer operations in [`src/lib/circle/wallets.ts`](src/lib/circle/wallets.ts).
- **Arc testnet**, chain id `5042002`. USDC is the native gas token on Arc, so a wallet funded with USDC pays for its own transfers and there is no separate gas asset to manage. The chain identifier is taken from the SDK enum (`Blockchain.ArcTestnet`) rather than hardcoded, in [`src/lib/circle/client.ts`](src/lib/circle/client.ts).
- **Transaction status polling** with a timeout that fails loudly rather than silently, in `waitForTransaction` in [`src/lib/circle/wallets.ts`](src/lib/circle/wallets.ts). It throws on timeout instead of returning a half finished transfer, so callers cannot mistake pending for settled.
- **Circle Contracts** is planned next, for an on chain escrow contract that would hold funds during the call back window instead of holding them in the treasury account.

## Architecture

Three parts:

- **Backend business logic.** The send, cancel and collect flows, money handling and email, independent of the web layer, in `src/lib/cue/` and `src/lib/email/`. Exposed over API routes in `src/app/api/`.
- **Website.** Landing, claim, pay and dashboard pages built with the App Router, behind email sign in.
- **Claude tool.** A remote MCP server hosted in this app at `/api/mcp/<token>`, so a user adds it to Claude by pasting one URL, with nothing to install. It uses the Streamable HTTP transport and calls the backend directly. Eighteen actions work today: send, call back, request, split, schedule and manage schedules, save and list contacts, balance, spending summary, set spending limit, track, list, settle and remind on debts, history, collect status and resend. A local stdio version is kept in `packages/mcp` for development.

Stack: Next.js 15, TypeScript, Tailwind v4, Supabase (Postgres), Circle Developer Controlled Wallets, Resend for email, Arc testnet, deployed on Vercel. The MCP server uses the Model Context Protocol Streamable HTTP transport.

```
src/
  app/
    page.tsx              Landing
    dashboard/            Balance, activity, schedules, debts, contacts, connect link
    claim/[token]/        Recipient collect page, mints a scoped session
    pay/[token]/          Pay a money request
    auth/                 confirm a magic link, request a link, sign out
    api/
      send/               POST create a send
      cancel/             POST call a send back
      claim/              POST collect, GET claim info
      request/            POST create a request, GET request info, POST cancel
      pay/                POST pay a request
      contacts/           GET list, POST save a contact
      schedules/          GET list, POST create, POST manage a recurring payment
      cron/               the daily scheduled payments runner, Vercel only
      summary/            GET a spending summary
      limits/             GET limits and usage, POST set limits
      debts/              GET list, POST track, POST settle, POST remind
      account/            GET balance and totals
      activity/           GET recent activity and requests
      transaction/[id]/   GET one send status
      resend/             POST resend the collection email
      mcp/[token]/        the remote MCP endpoint, one per connect token
  middleware.ts           keeps the signed in session fresh on every request
  lib/
    auth/                 current user, scoped sessions, the one magic link sender
    circle/               Circle client, wallets, transfers, polling
    cue/                  send, cancel, claim, requests, contacts, schedules, limits, debts, summary
    email/                Resend client and templates
    mcp/                  tokens, signed confirmations, tools, JSON-RPC
    api/                  acting account by token, shared secret, rate limit, errors
    supabase/             service role client, plus the cookie bound auth clients
supabase/migrations/      001_initial_schema ... 005_limits_debts
scripts/                  connection and end to end test scripts
packages/mcp/             local stdio MCP server, for development only
```

## Connect to Claude

This is the product. There is no config file to edit and nothing to install.

1. Open the [dashboard](https://cue-navy-psi.vercel.app/dashboard), sign in with your email, then create your connect link. It looks like `https://cue-navy-psi.vercel.app/api/mcp/<token>`.
2. In Claude, open Settings, then Connectors, then Add custom connector.
3. Paste the link and save.

Then say something like "Send Jack 50 dollars, jack@gmail.com". Claude shows a preview of the amount and recipient and waits for your approval before the money moves.

The link is a credential. Anyone who has it can send from your account, so keep it private and use Revoke or Regenerate on the dashboard if it leaks.

### Identity and the security boundary

The website uses email magic link sign in through Supabase Auth. There are no passwords: you get a link, and opening it proves the address and creates the account on first sign in. The verified email is mapped to the account row in our own `users` table, so existing accounts, created earlier by email, link up rather than duplicating. Sessions are httpOnly, secure cookies, refreshed by [`src/middleware.ts`](src/middleware.ts).

Collecting money is the one flow that stays effortless. A claim link is a long random secret delivered to an inbox, so possession already proves inbox access. Collecting therefore mints a **scoped** session on the spot with no extra email: it can view the dashboard, balance and activity, but it cannot send money, see or create a connect link, change limits, or manage schedules or debts. Those need a full sign in, which is where a collector becomes a real account holder. So a forwarded claim link at worst collects money already destined for that address, it never gains the power to move the rest. A full session always outranks a scoped one, in [`src/lib/auth/current-user.ts`](src/lib/auth/current-user.ts).

For Claude, the account is resolved from the connect token in the URL on every request, in [`src/lib/mcp/tokens.ts`](src/lib/mcp/tokens.ts), and never from anything the client sends. A connect link can only be created by a fully signed in owner, so holding one implies a real account. The local development package now identifies itself the same way, by connect token in the `x-cue-token` header, with the shared API secret layered under it as a coarse service gate. The two step confirmations use tokens signed with the server secret, so they work on a stateless serverless endpoint and cannot be forged.

Sign in emails currently come from Supabase's own sender while our sending domain is being verified. Sending is behind one function, [`sendMagicLink`](src/lib/auth/magic-link.ts), and the branded template is already written, so moving delivery to our domain is a single change. One manual step is needed in the Supabase dashboard for real email links to land on production: add the site URL to Authentication, URL Configuration, and point the magic link template at `/auth/confirm`.

The `packages/mcp` stdio server is kept for local development only. See [`packages/mcp/README.md`](packages/mcp/README.md) for the tools, the confirmation design and how to verify without Claude Desktop. The remote URL above is the real path.

## Status

Honest state of the project.

**What works**

- The full send, cancel and collect flow with an email at every step, verified end to end with twelve checks in [`scripts/test-send-claim.ts`](scripts/test-send-claim.ts).
- Real USDC transfers settling on Arc testnet, triggered from production.
- Four pages deployed and live: landing, claim, pay and dashboard. The dashboard shows the balance, activity, any spending limits and their use, scheduled payments, debts and contacts.
- The MCP server with eighteen actions: send money, call a send back, request money, split a total, schedule a recurring payment, manage schedules, save a contact, list contacts, get balance, a spending summary, set a spending limit, track a debt, list debts, settle a debt, remind about a debt, get history (payments or requests), check collect status and resend the collection link. Send, cancel, request, split, scheduling, deleting a schedule, loosening a limit and settling by sending require an explicit confirmation before anything happens. Contact names resolve to emails, and never to a guessed address. Verified against the deployed endpoint.
- Recurring payments run daily on Vercel Cron. The runner is idempotent for the day so a schedule cannot pay twice, a failed run emails the owner and stays active for next month, and the endpoint only answers Vercel.
- Spending limits are a safety control on an agent that can move money. A daily and a monthly limit live on the account and are enforced in the one send path, so the API, split and scheduled payments are all covered. A send that would breach a limit is refused with how much is left and when it resets, and loosening a limit takes the same confirmation as sending.
- Debts are tracked without moving money. They resolve names through contacts, show the net position per person, and can be settled by marking them or, when you owe, by sending through the normal preview and confirm. Reminders are friendly, limited to one per debt per day, and never sent automatically.
- Email sign in through Supabase Auth. No passwords, sessions in httpOnly cookies, sign out, a rate limited link request, existing accounts linked by email, and a signed out dashboard that invites you in rather than locking the door. Collecting money mints a scoped session that can view but not act, so the effortless part stays effortless. Verified end to end on the deployed site: sign up, sign in, an existing account keeping its data, and a brand new recipient collecting into a scoped session.

**In progress**

- Moving sign in email onto our own domain, which is one function change once the domain verifies.
- The escrow contract on Arc using Circle Contracts.

There is no authentication yet, and the dashboard is a demo view that anyone can open. This is why the project stays on testnet with test funds only.

## Running it locally

**Prerequisites**

- Node.js 20 or newer and npm.
- A Circle developer account with Developer Controlled Wallets enabled, and a registered entity secret.
- A Supabase project.
- A Resend account.

**Environment variables**

Copy `.env.example` to `.env.local` and fill in each value.

| Variable | What it is | Where to get it |
| --- | --- | --- |
| `CIRCLE_API_KEY` | Circle API key | Circle developer console |
| `CIRCLE_ENTITY_SECRET` | 32 byte entity secret that secures your wallets | Generated and registered once via the Circle console |
| `CIRCLE_WALLET_SET_ID` | Wallet set every Cue wallet is created inside | Printed by `scripts/test-circle.ts` on first run |
| `TREASURY_WALLET_ID` | Wallet collections are paid out from | Printed by `scripts/test-circle.ts` |
| `TREASURY_WALLET_ADDRESS` | Address of the treasury wallet, funded from the Arc faucet | Printed by `scripts/test-circle.ts` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase project settings, API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable key | Supabase project settings, API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret key, server only, bypasses row level security | Supabase project settings, API |
| `SUPABASE_DB_URL` | Session pooler connection string on port 5432, used only by the migration script | Supabase project settings, Database, connection string |
| `RESEND_API_KEY` | Resend API key for transactional email | Resend dashboard |
| `NEXT_PUBLIC_APP_URL` | Public base URL, used for claim links and the email logo | `http://localhost:3000` for local |
| `CUE_API_SECRET` | Shared service secret for the token authed API routes, also signs the scoped session cookie | Any strong random string you choose |
| `CRON_SECRET` | Bearer token Vercel Cron sends to the scheduled payments runner | Set the same value in Vercel and it attaches it automatically |
| `CUE_MAX_SEND_USDC` | Largest amount a single send may move, in dollars | Set to `5` for testnet |
| `CUE_ALLOW_SHORT_WINDOW` | Allows cancel windows shorter than one hour, for tests | Set to `true` locally, leave unset in production |

**Set up the database**

Apply the schema. It creates the `users`, `transactions`, `scheduled_payments` and `email_logs` tables with row level security on and grants for the service role. It is safe to run more than once.

```
npx tsx scripts/apply-migration.ts
```

**Create the Circle wallets**

This creates the wallet set, a treasury wallet and a test recipient wallet, and prints the ids and addresses to put in `.env.local`. Fund the treasury address from the Circle Arc testnet faucet.

```
npx tsx --conditions=react-server scripts/test-circle.ts
```

**Run the test scripts**

```
npx tsx --conditions=react-server scripts/test-supabase.ts     # database connection
npx tsx --conditions=react-server scripts/test-transfer.ts     # one USDC transfer on Arc, polled to settlement
npx tsx --conditions=react-server scripts/test-send-claim.ts you@example.com   # full send, collect and cancel loop
```

The `--conditions=react-server` flag is required because the library modules are marked server only and throw under any other resolution condition. In test mode Resend can only deliver to the account owner address, so use your own Resend email for `test-send-claim.ts`.

**Start the dev server**

```
npm install
npm run dev
```

Open `http://localhost:3000`.

## Security notes

- Testnet only, with test funds. No real money is involved.
- Email magic link sign in through Supabase Auth. Sessions are httpOnly, secure cookies. Collecting money grants only a scoped session that can view but not move money; acting needs a full sign in.
- The website acts as the signed in user, taken from the session and never from a client supplied id. The token authed API routes, which only the local development package calls, identify the account by a connect token in `x-cue-token`, with the shared secret in `x-cue-secret` layered under it.
- There is a per send amount cap, per account daily and monthly spending limits, and an in memory per IP rate limit on the send, claim and sign in endpoints.
- All keys currently in use are testnet keys and will be rotated before any mainnet use.

## Team

Team MTH:

- [@0xmeto_](https://x.com/0xmeto_)
- [@isaac_inya](https://x.com/isaac_inya)
- [@itztotoriboy](https://x.com/itztotoriboy)
- [@artology04](https://x.com/artology04)
