/**
 * Thin HTTPS client for the deployed Cue API. Runs on the user's machine, so it
 * never imports the Cue backend directly. Identity and the shared secret come
 * from the environment the user sets in their Claude Desktop config.
 */

export class CueError extends Error {}

export type ActivityItem = {
  transactionId: string;
  amount: string;
  status: "pending_claim" | "claimed" | "cancelled" | "failed";
  direction: "in" | "out";
  counterparty: string;
  secondsUntilUnlock: number;
  createdAt: string | null;
};

export type SendSummary = {
  transactionId: string;
  amount: string;
  recipient: string;
  status: ActivityItem["status"];
  secondsUntilUnlock: number;
  collected: boolean;
};

export class CueClient {
  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
    private readonly user: string,
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          "content-type": "application/json",
          "x-cue-secret": this.secret,
          "x-cue-user": this.user,
          ...(init?.headers ?? {}),
        },
      });
    } catch {
      throw new CueError("We could not reach Cue. Check your connection and try again.");
    }

    let payload: { ok?: boolean; data?: T; error?: string } | null = null;
    try {
      payload = (await response.json()) as { ok?: boolean; data?: T; error?: string };
    } catch {
      payload = null;
    }

    if (!response.ok || !payload?.ok) {
      // The API returns human readable messages. Fall back to a plain one so a
      // raw status code or stack never reaches the user.
      throw new CueError(
        payload?.error ?? "Cue could not complete that request right now.",
      );
    }

    return payload.data as T;
  }

  getBalance() {
    return this.request<{
      balance: string;
      totalSent: string;
      totalReceived: string;
      pendingCount: number;
    }>("/api/account");
  }

  async listActivity(options: { limit?: number; direction?: "in" | "out" } = {}) {
    const query = new URLSearchParams();
    if (options.limit) query.set("limit", String(options.limit));
    if (options.direction) query.set("direction", options.direction);
    const data = await this.request<{ items: ActivityItem[] }>(
      `/api/activity?${query.toString()}`,
    );
    return data.items;
  }

  async findPendingToRecipient(recipient: string) {
    const query = new URLSearchParams({ recipient });
    const data = await this.request<{ items: SendSummary[] }>(
      `/api/activity?${query.toString()}`,
    );
    return data.items[0] ?? null;
  }

  getStatus(transactionId: string) {
    return this.request<SendSummary>(
      `/api/transaction/${encodeURIComponent(transactionId)}`,
    );
  }

  send(input: { recipientEmail: string; amountUsdc: string }) {
    return this.request<{
      transactionId: string;
      amount: string;
      cancelDeadline: string;
      emailSent: boolean;
    }>("/api/send", { method: "POST", body: JSON.stringify(input) });
  }

  cancel(input: { transactionId: string }) {
    return this.request<{
      transactionId: string;
      amount: string;
      status: string;
      recipientNotified: boolean;
    }>("/api/cancel", { method: "POST", body: JSON.stringify(input) });
  }

  resend(input: { transactionId: string }) {
    return this.request<{
      transactionId: string;
      recipient: string;
      emailSent: boolean;
    }>("/api/resend", { method: "POST", body: JSON.stringify(input) });
  }
}
