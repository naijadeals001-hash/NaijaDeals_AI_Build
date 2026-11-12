/**
 * Interruption fixture for `escrow-refund-release-acceptance.ts`.
 *
 * This is not production code. It runs the real `refundPayment` service in a
 * separate process with a provider double, so the parent can terminate the
 * process at an exact lifecycle boundary and prove the recovery rules:
 *
 *   hang      the provider request is written to the counter file and then never
 *             answers, leaving an unacknowledged `submitted` lifecycle event.
 *   complete  the provider answers COMPLETED immediately. The parent holds the
 *             vendor wallet row lock, so the process can be killed after the
 *             `confirmed` event but before the local settlement posts.
 *
 * Arguments: <mode> <orderId> <idempotencyKey> <counterPath> <amountKobo>
 * Environment: DATABASE_URL (verified isolated database, set by the parent),
 *              CHILD_ACTOR_ID, PAYSTACK_SECRET_KEY.
 */
import "dotenv/config";
import { appendFileSync } from "node:fs";

const [mode, orderId, idempotencyKey, counterPath, amountArg] = process.argv.slice(2);
if (!orderId || !idempotencyKey || !counterPath) {
  process.stderr.write("usage: <mode> <orderId> <idempotencyKey> <counterPath> <amountKobo>\n");
  process.exit(2);
}
if (mode !== "hang" && mode !== "complete") {
  process.stderr.write(`unknown mode ${mode}\n`);
  process.exit(2);
}
const amountKobo = BigInt(amountArg ?? "0");
if (amountKobo <= BigInt(0)) {
  process.stderr.write("amountKobo must be positive\n");
  process.exit(2);
}
const actorId = process.env.CHILD_ACTOR_ID;
if (!actorId) {
  process.stderr.write("CHILD_ACTOR_ID is required\n");
  process.exit(2);
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const method = init?.method ?? "GET";
  if (!url.startsWith("https://api.paystack.co")) {
    throw new Error(`Blocked non-provider network call: ${method} ${url}`);
  }
  if (url.startsWith("https://api.paystack.co/refund")) {
    appendFileSync(counterPath, `${Date.now()} ${mode}\n`);
    if (mode === "hang") {
      // The request is recorded as submitted; the outcome never arrives.
      await new Promise<void>(() => undefined);
    }
    return json({ status: true, data: { status: "processed", id: `child-refund-${idempotencyKey}` } });
  }
  throw new Error(`Unhandled provider fixture: ${method} ${url}`);
}) as typeof fetch;

(async () => {
  const { refundPayment } = await import("../lib/payments/service");
  try {
    const result = await refundPayment({
      orderId,
      actorId,
      reason: "Interruption recovery fixture.",
      amountKobo,
      idempotencyKey
    });
    process.stdout.write(`${JSON.stringify({ status: "ok", result })}\n`);
    process.exit(0);
  } catch (error) {
    const typed = error as { code?: string; message?: string };
    process.stderr.write(
      `${JSON.stringify({ status: "error", code: typed.code ?? "unknown", message: typed.message ?? String(error) })}\n`
    );
    process.exit(1);
  }
})();
