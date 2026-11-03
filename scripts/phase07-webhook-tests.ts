import { createHmac } from "node:crypto";
import { processWebhook } from "../lib/payments/service";

const results: Array<{ name: string; status: "PASS" | "FAIL"; detail: string }> = [];
const check = (name: string, ok: boolean, detail: string) => results.push({ name, status: ok ? "PASS" : "FAIL", detail });

function codeOf(error: unknown) {
  return (error as { code?: string })?.code ?? "ok";
}

async function main() {
  // Synthetic test-only secrets; no live provider credentials are involved.
  process.env.PAYSTACK_SECRET_KEY = "phase07-paystack-test-secret";
  process.env.FLUTTERWAVE_WEBHOOK_HASH = "phase07-flutterwave-test-hash";

  const paystackBody = JSON.stringify({
    event: "charge.success",
    data: { id: 900001, reference: "PHASE07-UNKNOWN-REF", amount: 10000, currency: "NGN", status: "success" }
  });
  const goodSignature = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(paystackBody).digest("hex");

  let invalid = "none";
  try {
    await processWebhook("paystack", paystackBody, new Headers({ "x-paystack-signature": "deadbeef" }));
  } catch (error) {
    invalid = codeOf(error);
  }
  check("paystack rejects a bad signature", invalid === "invalid_signature", `code=${invalid}`);

  let valid = "ok";
  try {
    await processWebhook("paystack", paystackBody, new Headers({ "x-paystack-signature": goodSignature }));
  } catch (error) {
    valid = codeOf(error);
  }
  check("paystack accepts a synthetic signed payload", valid !== "invalid_signature", `code=${valid}`);

  const flutterwaveBody = JSON.stringify({
    event: "charge.completed",
    data: { id: 900002, tx_ref: "PHASE07-UNKNOWN-FLW", status: "successful", amount: 100, currency: "NGN" }
  });
  let flwBad = "none";
  try {
    await processWebhook("flutterwave", flutterwaveBody, new Headers({ "verif-hash": "wrong" }));
  } catch (error) {
    flwBad = codeOf(error);
  }
  check("flutterwave rejects a bad hash", flwBad === "invalid_signature", `code=${flwBad}`);

  let flwGood = "ok";
  try {
    await processWebhook("flutterwave", flutterwaveBody, new Headers({ "verif-hash": process.env.FLUTTERWAVE_WEBHOOK_HASH! }));
  } catch (error) {
    flwGood = codeOf(error);
  }
  check("flutterwave accepts a synthetic signed payload", flwGood !== "invalid_signature", `code=${flwGood}`);

  console.log(JSON.stringify(results, null, 2));
  delete process.env.PAYSTACK_SECRET_KEY;
  delete process.env.FLUTTERWAVE_WEBHOOK_HASH;
  process.exit(results.some((r) => r.status === "FAIL") ? 1 : 0);
}

main().catch((error) => { console.error("FATAL", error); process.exit(1); });
