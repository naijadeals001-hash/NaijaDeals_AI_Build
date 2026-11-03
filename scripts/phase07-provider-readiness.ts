import "dotenv/config";
const required = [
  ["PAYSTACK_SECRET_KEY", "Paystack sandbox secret"],
  ["FLUTTERWAVE_SECRET_KEY", "Flutterwave sandbox secret"],
  ["FLUTTERWAVE_WEBHOOK_HASH", "Flutterwave webhook verification hash"]
] as const;
const rows = required.map(([name, label]) => {
  const value = process.env[name];
  const present = Boolean(value && value.trim() && !value.includes("REPLACE"));
  return { name, label, present };
});
const testPayments = process.env.ENABLE_TEST_PAYMENTS === "true";
const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? null;
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  networkCallsMade: false,
  credentials: rows,
  testPaymentsEnabled: testPayments,
  appUrlConfigured: Boolean(appUrl),
  blockers: [
    ...rows.filter((r) => !r.present).map((r) => "missing " + r.name),
    ...(testPayments ? [] : ["ENABLE_TEST_PAYMENTS is not true"]),
    ...(appUrl ? [] : ["APP_URL/NEXT_PUBLIC_APP_URL not configured"])
  ]
}, null, 2));
if (rows.some((r) => !r.present)) process.exit(2);
