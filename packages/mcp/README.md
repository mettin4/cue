# @cue/mcp

The Cue tool for Claude. A Model Context Protocol server that lets Claude send and manage money through Cue. It runs on the user's machine and talks to the deployed Cue API over HTTPS. It does not import the Cue backend.

## Configuration

Set these in the environment, which for Claude Desktop means the `env` block of the config (see the repo README for the full config).

| Variable | Meaning |
| --- | --- |
| `CUE_API_URL` | Base URL of the deployed Cue API, for example `https://cue-navy-psi.vercel.app` |
| `CUE_API_KEY` | Shared secret, the same value as `CUE_API_SECRET` on the server |
| `CUE_USER` | Email the server acts as. Temporary, until sign in ships, then replaced by real authentication |

## Tools

- **send_money** recipient email and amount. Two steps, see confirmation below.
- **cancel_send** calls a send back before it is collected. Takes a send reference, or the recipient email to find the most recent uncollected send. Two steps.
- **get_balance** current balance in dollars, plus totals and how many sends are waiting.
- **get_history** recent activity, with an optional limit and an optional direction.
- **check_claim_status** whether a specific send has been collected, and how long is left on the call back window.
- **resend_claim_link** sends the collection email again for a pending send.

Output is written for a person. Amounts are dollars, times are plain phrases like "about an hour", and email addresses are masked. The words crypto, wallet, blockchain and token never appear.

## Confirmation before money moves

MCP has an `elicitation` feature where a server can ask the client for input mid call, but it is optional, newly introduced with a design the spec says may still change, and it requires the client to declare the capability. Rather than depend on Claude Desktop supporting it, `send_money` and `cancel_send` use a two call pattern that works everywhere:

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
