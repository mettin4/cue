/**
 * Shared row shapes for the Cue business logic layer.
 */

export type TransactionStatus =
  | "pending_claim"
  | "claimed"
  | "cancelled"
  | "failed";

export type TransactionRow = {
  id: string;
  sender_id: string | null;
  recipient_email: string;
  amount_usdc: string | number;
  status: TransactionStatus;
  circle_tx_id: string | null;
  claim_token: string | null;
  cancel_deadline: string | null;
  created_at: string | null;
  claimed_at: string | null;
};

export type UserRow = {
  id: string;
  email: string;
  circle_wallet_id: string | null;
  circle_wallet_address: string | null;
  created_at: string | null;
};

/**
 * Email categories recorded in email_logs.type.
 */
export type EmailType =
  | "claim_invite"
  | "claim_confirmation"
  | "send_cancelled";
