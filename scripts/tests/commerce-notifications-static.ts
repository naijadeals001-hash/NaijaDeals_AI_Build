import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Static contract check for durable commerce notifications.
 *
 * Read-only: this script never imports Prisma, opens a connection, runs a
 * migration or calls the intent processor. It asserts the source-level shape of
 * the transactional enqueue calls and their delivery handlers so a later edit
 * cannot silently drop a dedupe key or reintroduce the old direct path.
 *
 * Run from the repository root:
 *   npx tsx scripts/tests/commerce-notifications-static.ts
 */

const ROOT = process.cwd();
const failures: string[] = [];

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) return;
  failures.push(detail ? `${name}: ${detail}` : name);
}

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(join(ROOT, directory), { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...walk(path));
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) files.push(path);
  }
  return files;
}

/* ------------------------------------------------------------------ source -- */

const orderService = read("lib/services/core/order.service.ts");
const paymentsService = read("lib/payments/service.ts");
const adminService = read("lib/services/core/admin.service.ts");
const deliveries = read("lib/notifications/commerce-deliveries.ts");
const templates = read("lib/notifications/templates.ts");

check(
  "order status intent uses the OrderStatusEvent id as its dedupe key",
  orderService.includes("dedupeKey: `order.status:${statusEvent.id}`")
);
check(
  "order status intent commits in the caller's transaction",
  orderService.includes("await enqueueIntent(db, {")
);
check(
  "order completed uses order.delivered",
  orderService.includes('eventType: delivered ? "order.delivered" : "order.status_changed"')
);
check(
  "order status payload is versioned",
  orderService.includes("version: 1") && orderService.includes("href: `/orders/${order.id}`")
);
check(
  "old direct notifyOrderStatus path removed from order.service.ts",
  !orderService.includes("notifyOrderStatus(")
);
check(
  "escrow-release notification retained",
  orderService.includes("notifyEscrowReleased(")
);
check(
  "vendor paid-order intent retained",
  orderService.includes("enqueueVendorNotification(")
);

check(
  "refund completed intent uses the refund id as its dedupe key",
  paymentsService.includes("dedupeKey: `refund.completed:${refund.id}`")
);
check(
  "refund completed intent commits in settleRefund's transaction",
  paymentsService.includes("await enqueueIntent(tx, {") &&
    paymentsService.includes("amountKobo: refund.amountKobo.toString()")
);
check(
  "refund payload is versioned",
  paymentsService.includes("version: 1") && paymentsService.includes("href: `/orders/${order.id}`")
);
check(
  "paid-order notification retained",
  paymentsService.includes("notifyOrderPaid({")
);

check(
  "payout completed intent uses the payout id as its dedupe key",
  adminService.includes("dedupeKey: `payout.paid:${payout.id}`")
);
check(
  "payout intent resolves the Vendor owner in the same transaction",
  adminService.includes("tx.vendor.findUniqueOrThrow({") &&
    adminService.includes("recipientUserId: vendor.ownerId")
);
check(
  "payout payload is versioned with the exact reference",
  adminService.includes("version: 1") &&
    adminService.includes("reference: payout.reference") &&
    adminService.includes('href: "/seller"')
);

/* --------------------------------------------------------------- delivery -- */

check(
  "commerce handler imports the shared intent delivery helper",
  deliveries.includes('import { deliverIntentNotification } from "./intent.service"')
);
for (const eventType of [
  "order.status_changed",
  "order.delivered",
  "refund.completed",
  "payout.completed"
]) {
  check(`commerce handler has a case for ${eventType}`, deliveries.includes(`"${eventType}"`));
}
check(
  "commerce handler returns true only after delivering",
  deliveries.split("await deliverIntentNotification(").length - 1 === 4 &&
    deliveries.split("return true;").length - 1 === 4
);
check(
  "commerce handler names the shared payload version",
  deliveries.includes("const PAYLOAD_VERSION = 1")
);

/* -------------------------------------------------------------- templates -- */

for (const key of ["refund.completed", "payout.completed"]) {
  check(`template ${key} exists`, templates.includes(`"${key}": {`));
}
check(
  "refund template requires orderNumber and amount",
  /"refund\.completed": \{[^}]*required: \["orderNumber", "amount"\]/.test(templates)
);
check(
  "payout template requires amount and reference",
  /"payout\.completed": \{[^}]*required: \["amount", "reference"\]/.test(templates)
);

/* ------------------------------------------------- every enqueue call site -- */

type CallSite = { file: string; line: number; hasDedupeKey: boolean; eventType: string | null };

const callSites: CallSite[] = [];
for (const file of [...walk("lib"), ...walk("app")]) {
  const lines = read(file).split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.includes("enqueueIntent(")) continue;
    if (line.includes("function enqueueIntent")) continue;
    if (line.includes("import ")) continue;
    const window = lines.slice(index, index + 20).join("\n");
    const eventMatch = /eventType:\s*("([^"]+)"|[^,\n]+)/.exec(window);
    callSites.push({
      file,
      line: index + 1,
      hasDedupeKey: /dedupeKey:\s*/.test(window),
      eventType: eventMatch ? (eventMatch[2] ?? eventMatch[1].trim()) : null
    });
  }
}

check("at least one enqueueIntent call site exists", callSites.length > 0);
for (const site of callSites) {
  check(
    `${site.file}:${site.line} enqueueIntent has a dedupe key`,
    site.hasDedupeKey
  );
}

/* ----------------------------------------------------------------- report -- */

if (failures.length > 0) {
  console.error(`commerce-notifications-static: ${failures.length} failure(s)`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("commerce-notifications-static: PASS");
console.log(`enqueueIntent call sites checked: ${callSites.length}`);
for (const site of callSites) {
  console.log(`  ${site.file}:${site.line} event=${site.eventType ?? "(dynamic)"} dedupeKey=yes`);
}
