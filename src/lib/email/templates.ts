/**
 * Email templates.
 *
 * Product rule: recipients may know nothing about crypto, so this copy never
 * mentions currencies, wallets, chains or tokens. Money is described in plain
 * dollars, and no sentence uses an em dash.
 */

/**
 * A readable deep mint for the amount when it is a positive highlight. The
 * bright brand mint fails contrast on white, so amounts use this darker shade
 * of the same green, which stays legible.
 */
function mintAmount(text: string): string {
  return `<strong style="color: #0b7a43;">${text}</strong>`;
}

/**
 * Turns an unlock moment into a plain phrase like "in about an hour", computed
 * relative to now (send time). Avoids showing a raw machine timestamp.
 */
function humanizeUnlock(unlocksAt: Date): string {
  const minutes = Math.round((unlocksAt.getTime() - Date.now()) / 60000);

  if (minutes <= 1) return "in about a minute";
  if (minutes < 55) return `in about ${minutes} minutes`;
  if (minutes < 90) return "in about an hour";

  const hours = Math.round(minutes / 60);
  return `in about ${hours} hours`;
}

type Layout = {
  heading: string;
  bodyHtml: string;
  action?: { label: string; url: string };
  footnote?: string;
  /** Absolute URL to the brand mark PNG. Inline SVG is stripped by clients. */
  markUrl?: string;
};

function layout({ heading, bodyHtml, action, footnote, markUrl }: Layout): string {
  // alt is empty because the wordmark text beside it already reads "Cue".
  const brand = markUrl
    ? `<img src="${markUrl}" width="26" height="25" alt=""
             style="display: inline-block; vertical-align: middle; border: 0;" />
         <span style="vertical-align: middle; margin-left: 7px;">Cue</span>`
    : "Cue";
  const button = action
    ? `
        <tr>
          <td style="padding: 8px 0 4px;">
            <a href="${action.url}"
               style="display: inline-block; background: #38D389; color: #04120a;
                      text-decoration: none; font-size: 15px; font-weight: 600;
                      padding: 12px 22px; border-radius: 8px;">${action.label}</a>
          </td>
        </tr>`
    : "";

  const note = footnote
    ? `
        <tr>
          <td style="padding: 12px 0 0; font-size: 13px; line-height: 20px; color: #8a8a8a;">
            ${footnote}
          </td>
        </tr>`
    : "";

  return `<!doctype html>
<html>
  <body style="margin: 0; padding: 0; background: #fafafa;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background: #fafafa; padding: 40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="max-width: 460px; background: #ffffff; border: 1px solid #ededed;
                        border-radius: 12px; padding: 32px;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
                        color: #111111;">
            <tr>
              <td style="font-size: 17px; font-weight: 600; letter-spacing: -0.2px; padding-bottom: 4px;">
                ${brand}
              </td>
            </tr>
            <tr>
              <td style="font-size: 22px; font-weight: 600; letter-spacing: -0.4px; padding: 12px 0 8px;">
                ${heading}
              </td>
            </tr>
            <tr>
              <td style="font-size: 15px; line-height: 23px; color: #444444; padding-bottom: 16px;">
                ${bodyHtml}
              </td>
            </tr>
            ${button}
            ${note}
            <tr>
              <td style="padding-top: 26px; border-top: 1px solid #f0f0f0; margin-top: 20px;
                         font-size: 12px; color: #a0a0a0;">
                Cue. Write to Claude, money moves.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function claimInviteEmail(params: {
  amount: string;
  senderLabel: string;
  claimUrl: string;
  unlocksAt: Date;
  markUrl?: string;
}): { subject: string; html: string } {
  const unlocked = params.unlocksAt.getTime() <= Date.now();

  const footnote = unlocked
    ? "If you were not expecting this, you can ignore this email."
    : `This becomes available ${humanizeUnlock(params.unlocksAt)}. The sender can call it back until then.`;

  return {
    subject: `You received ${params.amount} dollars`,
    html: layout({
      markUrl: params.markUrl,
      heading: `You received ${params.amount} dollars`,
      bodyHtml: `${params.senderLabel} sent you ${mintAmount(`${params.amount} dollars`)}. Use the button below to collect it.`,
      action: { label: "Collect your money", url: params.claimUrl },
      footnote,
    }),
  };
}

export function claimConfirmationEmail(params: {
  amount: string;
  markUrl?: string;
}): { subject: string; html: string } {
  return {
    subject: `You collected ${params.amount} dollars`,
    html: layout({
      markUrl: params.markUrl,
      heading: "All done",
      bodyHtml: `Your ${mintAmount(`${params.amount} dollars`)} have been added to your Cue account.`,
      footnote: "Nothing else is needed from you.",
    }),
  };
}

export function requestMoneyEmail(params: {
  amount: string;
  requesterLabel: string;
  payUrl: string;
  markUrl?: string;
}): { subject: string; html: string } {
  return {
    subject: `${params.requesterLabel} is asking you for ${params.amount} dollars`,
    html: layout({
      markUrl: params.markUrl,
      heading: `A request for ${params.amount} dollars`,
      bodyHtml: `${params.requesterLabel} is asking you for ${mintAmount(`${params.amount} dollars`)}. Use the button below to pay them.`,
      action: { label: `Pay ${params.amount} dollars`, url: params.payUrl },
      footnote:
        "If you were not expecting this, you can ignore this email. Nothing is charged unless you choose to pay.",
    }),
  };
}

export function scheduleFailedEmail(params: {
  amount: string;
  recipientLabel: string;
  dayLabel: string;
  reason: string;
  markUrl?: string;
}): { subject: string; html: string } {
  return {
    subject: `A scheduled payment of ${params.amount} dollars could not go out`,
    html: layout({
      markUrl: params.markUrl,
      heading: "A scheduled payment did not go out",
      bodyHtml:
        `Your recurring payment of <strong>${params.amount} dollars</strong> to ${params.recipientLabel}, ` +
        `set for the ${params.dayLabel} of each month, could not go out this time. ` +
        `Reason: ${params.reason} Add money to your account and it will try again next month. ` +
        `Nothing was sent and nothing was charged.`,
      footnote: "The schedule is still active, so there is nothing you need to switch back on.",
    }),
  };
}

/**
 * Branded sign in email, in the same design language as the rest of Cue.
 *
 * Not wired to send yet: Supabase Auth delivers sign in emails from its own
 * sender for now. This is ready to drop in the moment our sending domain is
 * verified, at which point sendMagicLink will render this and send through
 * Resend. The link is passed in so the sender is the only thing that changes.
 */
export function magicLinkEmail(params: {
  signInUrl: string;
  markUrl?: string;
}): { subject: string; html: string } {
  return {
    subject: "Your sign in link for Cue",
    html: layout({
      markUrl: params.markUrl,
      heading: "Sign in to Cue",
      bodyHtml:
        "Use the button below to sign in. It works once and expires shortly, so open it on the device you want to use.",
      action: { label: "Sign in", url: params.signInUrl },
      footnote: "If you did not ask to sign in, you can ignore this email.",
    }),
  };
}

/**
 * Operator alert when the demo pool is running low. Internal, so it is plainer
 * than the recipient facing mail, but stays in the same visual language.
 */
export function treasuryLowEmail(params: {
  available: string;
  markUrl?: string;
}): { subject: string; html: string } {
  return {
    subject: `Cue demo pool is low: ${params.available} dollars left`,
    html: layout({
      markUrl: params.markUrl,
      heading: "The demo pool is running low",
      bodyHtml:
        `About <strong>${params.available} dollars</strong> are left to cover sends. ` +
        `Top up the pool from the faucet so the demo keeps working. Sends are already ` +
        `held above the reserve floor, so nothing will overdraw in the meantime.`,
      footnote: "You are getting this because you are set as the alert address.",
    }),
  };
}

export function debtReminderEmail(params: {
  amount: string;
  fromLabel: string;
  note?: string | null;
  markUrl?: string;
}): { subject: string; html: string } {
  const about = params.note ? ` for ${params.note}` : "";
  return {
    subject: `A friendly reminder about ${params.amount} dollars`,
    html: layout({
      markUrl: params.markUrl,
      heading: "Just a friendly reminder",
      bodyHtml:
        `This is a friendly note that there is ${mintAmount(`${params.amount} dollars`)}${about} ` +
        `outstanding between you and ${params.fromLabel}. No rush at all, whenever works for you.`,
      footnote: "You are getting this because they tracked it in Cue. You can settle up any way you like.",
    }),
  };
}

export function sendCancelledEmail(params: {
  amount: string;
  senderLabel: string;
  markUrl?: string;
}): { subject: string; html: string } {
  return {
    subject: `The ${params.amount} dollars sent to you were called back`,
    html: layout({
      markUrl: params.markUrl,
      heading: "That transfer was called back",
      bodyHtml: `${params.senderLabel} called back the <strong>${params.amount} dollars</strong> before you collected them. The earlier link no longer works.`,
      footnote: "No action is needed from you.",
    }),
  };
}
