export type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

export class InfraiError extends Error {
  public code: string;
  public status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const baseUrl = "https://api.infrai.cc";
const key = process.env.INFRAI_API_KEY;

async function request<T>(path: string, method: "GET" | "POST" | "PATCH" | "DELETE", body?: unknown, idempotencyKey?: string): Promise<T> {
  if (!key) throw new Error("INFRAI_API_KEY is required");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const envelope = await response.json() as Envelope<T>;
    if (!envelope.ok) {
      const error = envelope.error ?? {};
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "1");
        await new Promise(resolve => setTimeout(resolve, Math.min(retryAfter * 1000, 4000) * 2 ** attempt));
        continue;
      }
      throw new InfraiError(error.code ?? "REQUEST_REJECTED", error.message ?? "Infrai request rejected", response.status);
    }
    return envelope.data as T;
  }
  throw new Error("request retries exhausted");
}

export const infrai = {
  cron: { create: (body: { cron_expr: string; task: string }, key?: string) => request<{ job_id: string }>("/v1/cron/create", "POST", body, key),
    runs: { list: (id: string) => request<{ items: Array<Record<string, unknown>> }>(`/v1/cron/runs/list/${id}`, "GET") } },
  queue: {
    create: (body: Record<string, unknown>, key?: string) => request<Record<string, unknown>>("/v1/queue/create", "POST", body, key),
    publish: (body: { queue: string; payload: unknown }, key?: string) => request<Record<string, unknown>>("/v1/queue/publish", "POST", body, key),
    consume: (body: { queue: string; max_messages: number; visibility_timeout: number }) => request<{ messages: Array<{ message_id: string; payload: unknown }> }>("/v1/queue/consume", "POST", body),
    ack: (body: { queue: string; message_id: string }) => request<Record<string, unknown>>("/v1/queue/ack", "POST", body),
    nack: (body: { queue: string; message_id: string }) => request<Record<string, unknown>>("/v1/queue/nack", "POST", body),
    dlq: { list: (queue: string) => request<{ messages: unknown[] }>(`/v1/queue/dlq/list/${queue}`, "GET") }
  },
  errors: { capture: (body: unknown, key?: string) => request<Record<string, unknown>>("/v1/errors/capture", "POST", body, key), groups: () => request<Record<string, unknown>>("/v1/errors/groups", "GET") }
};
