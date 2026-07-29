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

export type RequestItem = {
  id: string;
  amount: string;
  status: "pending" | "paid" | "cancelled" | "expired";
  direction: "in" | "out";
  counterparty: string;
  createdAt: string | null;
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

  async listRequests(options: { limit?: number; direction?: "in" | "out" } = {}) {
    const query = new URLSearchParams({ type: "requests" });
    if (options.limit) query.set("limit", String(options.limit));
    if (options.direction) query.set("direction", options.direction);
    const data = await this.request<{ items: RequestItem[] }>(
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

  createRequest(input: { targetEmail: string; amount: string }) {
    return this.request<{
      requestId: string;
      amount: string;
      payUrl: string;
      emailSent: boolean;
    }>("/api/request", { method: "POST", body: JSON.stringify(input) });
  }

  async listContacts() {
    const data = await this.request<{
      items: { id: string; name: string; email: string }[];
    }>("/api/contacts");
    return data.items;
  }

  saveContact(input: { name: string; email: string }) {
    return this.request<{ id: string; name: string; email: string }>("/api/contacts", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async listSchedules() {
    const data = await this.request<{
      items: {
        id: string;
        amount: string;
        recipientMasked: string;
        dayOfMonth: number;
        active: boolean;
        nextRun: string | null;
      }[];
    }>("/api/schedules");
    return data.items;
  }

  createSchedule(input: { recipientEmail: string; amount: string; dayOfMonth: number }) {
    return this.request<{
      id: string;
      amount: string;
      dayOfMonth: number;
      firstRun: string;
    }>("/api/schedules", { method: "POST", body: JSON.stringify(input) });
  }

  manageSchedule(input: { scheduleId: string; action: "pause" | "resume" | "delete" }) {
    return this.request<{
      status: string;
      amount?: string;
      recipient?: string;
      dayOfMonth?: number;
    }>("/api/schedules/manage", { method: "POST", body: JSON.stringify(input) });
  }

  getSummary(options: { period?: string; from?: string; to?: string } = {}) {
    const query = new URLSearchParams();
    if (options.period) query.set("period", options.period);
    if (options.from) query.set("from", options.from);
    if (options.to) query.set("to", options.to);
    return this.request<{
      periodLabel: string;
      totalSent: string;
      totalReceived: string;
      transfers: number;
      top: { label: string; amount: string; share: number }[];
    }>(`/api/summary?${query.toString()}`);
  }

  getLimits() {
    return this.request<{
      limits: { daily: string | null; monthly: string | null };
      usage: {
        daily: { limit: string; remaining: string } | null;
        monthly: { limit: string; remaining: string } | null;
      };
    }>("/api/limits");
  }

  setSpendingLimit(input: { daily?: number | null; monthly?: number | null }) {
    return this.request<{ limits: { daily: string | null; monthly: string | null } }>("/api/limits", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  listDebts() {
    return this.request<{
      people: {
        label: string;
        email: string | null;
        theyOwe: string;
        iOwe: string;
        net: number;
        items: { id: string; amount: string; direction: "they_owe" | "i_owe"; note: string | null }[];
      }[];
    }>("/api/debts");
  }

  trackDebt(input: {
    counterparty: string;
    amount: number;
    direction: "they_owe" | "i_owe";
    note?: string;
  }) {
    return this.request<{ debtId: string; label: string; amount: string; direction: string }>("/api/debts", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  settleDebt(input: { debtId: string; pay?: boolean }) {
    return this.request<{ status: string; amount?: string; label?: string }>("/api/debts/settle", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  remindDebt(input: { debtId: string }) {
    return this.request<{ status: string; label: string; amount: string }>("/api/debts/remind", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
}
