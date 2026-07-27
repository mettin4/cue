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
