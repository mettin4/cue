# @cue/mcp

For local development only. The real product is the remote MCP server hosted in the app, which a user adds to Claude by pasting one connect URL with nothing to install. See the repo README, Connect to Claude. Use this stdio package when iterating on tools without deploying.

A Model Context Protocol server that lets Claude send and manage money through Cue. It runs on the machine and talks to the deployed Cue API over HTTPS. It does not import the Cue backend.

## Configuration

Set these in the environment, which for Claude Desktop means the `env` block of the config (see the repo README for the full config).

| Variable | Meaning |
| --- | --- |
| `CUE_API_URL` | Base URL of the deployed Cue API, for example `https://cue-navy-psi.vercel.app` |
| `CUE_API_KEY` | Shared secret, the same value as `CUE_API_SECRET` on the server |
| `CUE_USER` | Email the server acts as. Temporary, until sign in ships, then replaced by real authentication |

## Tools

Twelve tools, matching the remote server.

- **send_money** recipient and amount. The recipient can be an email or a saved contact name. Two steps, see confirmation below.
- **cancel_send** calls a send back before it is collected. Takes a send reference, or the recipient email to find the most recent uncollected send. Two steps.
- **request_money** asks someone to pay you, by email or saved contact name. The reverse of a send. They get a link to pay and are not charged unless they choose to. Two steps.
- **split_money** divides a total evenly between several people and sends each their share, by email or saved contact name. The preview lists exactly who gets what, including who absorbs any leftover cent. Two steps.
- **schedule_payment** sets up a recurring monthly payment, by email or saved contact name, on a day of the month from 1 to 28. The preview says when the first payment goes out and that it repeats. Two steps.
- **manage_schedules** lists recurring payments, and pauses, resumes or deletes one. Pause and resume are immediate; delete takes two steps.
- **save_contact** saves a name and email so a person can be named instead of typed as an email next time.
- **list_contacts** lists the saved contacts.
- **get_balance** current balance in dollars, plus totals and how many sends are waiting.
- **get_history** recent activity, with an optional limit, an optional direction, and an optional type of `payments` (default) or `requests`.
- **check_claim_status** whether a specific send has been collected, and how long is left on the call back window.
- **resend_claim_link** sends the collection email again for a pending send.

When a recipient is a name rather than an email, it is looked up in the account's contacts. An exact match is used and named in the preview; no match or more than one comes back as a clear question rather than a guessed address.

Recurring payments run daily on the server through Vercel Cron, not from this package. Each run goes through the same amount limit and balance check as a normal send, and a run that fails emails the owner and leaves the schedule active for next month.

Output is written for a person. Amounts are dollars, times are plain phrases like "about an hour", and email addresses are masked. The words crypto, wallet, blockchain and token never appear.

## Confirmation before money moves

MCP has an `elicitation` feature where a server can ask the client for input mid call, but it is optional, newly introduced with a design the spec says may still change, and it requires the client to declare the capability. Rather than depend on Claude Desktop supporting it, `send_money`, `cancel_send`, `request_money`, `split_money`, `schedule_payment` and deleting through `manage_schedules` use a two call pattern that works everywhere:

1. The first call returns a preview of exactly what will happen, amount and recipient, and a confirmation token. No money moves.
2. Claude shows the preview to the user and waits for approval.
3. A second call with the confirmation token executes.

The pending previews are held in memory for the life of the server process, which is the session. The tool descriptions instruct Claude to always show the preview and wait for approval before the second call.

## Verify without Claude Desktop

The CLI in `test/invoke.ts` builds the same client and context the server uses and calls every tool directly, driving the two step tools through both calls.

```
npm install
npm run build
CUE_API_URL=https://cue-navy-psi.vercel.app \
CUE_API_KEY=your-cue-secret \
CUE_USER=you@example.com \
  npm run test:tools -- recipient@example.com
```

The recipient must be an address the email provider will deliver to. On the shared testing setup that is the Resend account owner address.
