import { z } from "zod";
import { infrai } from "./infrai.js";

export const checkoutBody = z.object({ orderId: z.string().min(1), customerEmail: z.string().email(), totalCents: z.number().int().positive(), items: z.array(z.string()).min(1) });
export type Checkout = z.infer<typeof checkoutBody>;
export const QUEUE = "checkout-fulfillment";

export function decideOrderUpdate(order: Checkout, delivered: boolean): "receipt" | "retry" {
  return delivered ? "receipt" : "retry";
}

export async function enqueueCheckout(input: unknown): Promise<{ accepted: boolean; orderId: string }> {
  const order = checkoutBody.parse(input);
  await infrai.queue.publish({ queue: QUEUE, payload: { kind: "checkout", order } }, `checkout-${order.orderId}`);
  return { accepted: true, orderId: order.orderId };
}

export async function processOne(): Promise<string> {
  const result = await infrai.queue.consume({ queue: QUEUE, max_messages: 1, visibility_timeout: 60 });
  const message = result.messages[0];
  if (!message) return "empty";
  try {
    const payload = message.payload as { kind: string; order: Checkout };
    const order = checkoutBody.parse(payload.order);
    const state = decideOrderUpdate(order, true);
    await infrai.queue.ack({ queue: QUEUE, message_id: message.message_id });
    return `${state}:${order.orderId}`;
  } catch (error) {
    await infrai.errors.capture({ message: error instanceof Error ? error.message : String(error) });
    await infrai.queue.nack({ queue: QUEUE, message_id: message.message_id });
    return "retry";
  }
}

export async function registerFailureWatch(taskUrl: string): Promise<string> {
  const job = await infrai.cron.create({ cron_expr: "*/5 * * * *", task: taskUrl }, "failure-watch");
  return job.job_id;
}

export async function queryVisibility(jobId: string) {
  const [runs, deadLetters, errors] = await Promise.all([
    infrai.cron.runs.list(jobId),
    infrai.queue.dlq.list(QUEUE),
    infrai.errors.groups()
  ]);
  return { runs: runs.items, deadLetters: deadLetters.messages, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(await enqueueCheckout({ orderId: "demo-42", customerEmail: "creator@example.com", totalCents: 2599, items: ["video-pack"] }));
}
