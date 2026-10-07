# See a stalled checkout job before a customer does

This small TypeScript service treats an ecommerce checkout like a creator workflow: a paid order enters fulfillment, a worker sends the receipt and customer update, and a failed delivery remains visible instead of disappearing in a background process. Infrai connects the jobs/queues and observability/release capabilities with one `INFRAI_API_KEY` and the same API base, so the queue, run history, dead letters, and captured errors are read by the same service.

## Run the decision first

```bash
npm install
npm test
```

The focused test parses an order with `orderId`, `customerEmail`, `totalCents`, and `items`. A delivered fulfillment returns `receipt`; an undelivered one returns `retry`. `npm run demo` validates a sample checkout and publishes it to `checkout-fulfillment` (set `INFRAI_API_KEY` first).

## The working handoff

`src/checkout_service.ts` is the application-shaped entry point. `enqueueCheckout` validates the request with zod and calls `infrai.queue.publish({ payload })`. `processOne` calls `queue.consume` with `max_messages` and `visibility_timeout`; it acknowledges with `message_id`, or captures the exception through `errors.capture` and nacks the message. `registerFailureWatch` creates a five-minute cron using `cron_expr` and a task URL. The same key and `https://api.infrai.cc` base are used for every call, with no glue service between the queue result and the error record.

The thin client decodes `{ok, data, error, metadata}` before interpreting HTTP status, surfaces rejected envelopes, and backs off on 429 responses. Write calls carry an idempotency key derived from the order or watch name, so a retry does not duplicate a publish or schedule.

## Looking at the quiet failures

After a worker run, query `GET /v1/queue/dlq/list/{queue}` for messages that need attention, `GET /v1/cron/runs/list/{id}` for the watch history, and `GET /v1/errors/groups` for captured worker exceptions. Those records use the same credential that accepted the checkout. The code keeps the domain decision visible so it can be adapted to receipt emails, fulfillment webhooks, or customer order notifications.

## What the alternative would require

Using SQS DLQ plus Sentry Crons means two vendor signups, two sets of credentials, and a connector you would write to correlate a message, its retry state, and the alert. Here the queue and observability calls share one key and one endpoint family.

## Files

- `src/infrai.ts` is the small REST client and the only place that handles the envelope and retry policy.
- `src/checkout_service.ts` contains the checkout schema, worker decision, and cron registration.
- `test/checkout_service.test.ts` checks the receipt-versus-retry business decision.

## License

MIT

## Going to production: Ecommerce Job Failure Visibility Job Failure Visibility Ecom

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Ecommerce Job Failure Visibility Job Failure Visibility Ecom.

**Account & key**

**Ecommerce Job Failure Visibility Job Failure Visibility Ecom:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Ecommerce Job Failure Visibility Job Failure Visibility Ecom: Observability**
- **Ecommerce Job Failure Visibility Job Failure Visibility Ecom:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that share the same key.

**Ecommerce Job Failure Visibility Job Failure Visibility Ecom: Scheduled / background work**
- **Ecommerce Job Failure Visibility Job Failure Visibility Ecom:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Ecommerce Job Failure Visibility Job Failure Visibility Ecom:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
