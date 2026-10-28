/**
 * Persistence check.
 *
 * Captures a snapshot of live database-backed state through the running app so
 * the same snapshot can be compared before and after a server restart.
 *
 * Usage:
 *   node scripts/verify-persistence.mjs --out qa-artifacts/persistence-before.json
 *   # restart the app
 *   node scripts/verify-persistence.mjs --out qa-artifacts/persistence-after.json
 *   node scripts/verify-persistence.mjs --compare qa-artifacts/persistence-before.json qa-artifacts/persistence-after.json
 *
 * The session cookie is forwarded explicitly because production builds mark it
 * Secure, and plain HTTP clients will not send it over http://localhost.
 */
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = (process.env.PERSIST_BASE_URL ?? "http://localhost:3100").replace(/\/$/, "");
const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
};

async function login(email, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ email, password })
  });
  if (!response.ok) throw new Error(`Login failed for ${email}: ${response.status}`);
  const raw = response.headers.get("set-cookie") ?? "";
  const cookie = raw.split(";")[0];
  if (!cookie) throw new Error("Login succeeded but no session cookie was returned.");
  return cookie;
}

async function getJson(cookie, route) {
  const response = await fetch(`${baseUrl}${route}`, { headers: { Cookie: cookie } });
  if (!response.ok) throw new Error(`GET ${route} failed: ${response.status}`);
  return response.json();
}

async function snapshot() {
  const cookie = await login(
    process.env.PERSIST_ADMIN_EMAIL ?? "admin@naijadeals.local",
    process.env.PERSIST_ADMIN_PASSWORD ?? "AdminPass123!"
  );
  const overview = await getJson(cookie, "/api/admin/overview");
  const orders = await getJson(cookie, "/api/admin/orders");
  const orderList = Array.isArray(orders) ? orders : orders.orders ?? [];

  return {
    capturedAt: new Date().toISOString(),
    baseUrl,
    counts: overview.counts ?? overview,
    orderIds: orderList.slice(0, 10).map((order) => order.id),
    orderNumbers: orderList.slice(0, 10).map((order) => order.orderNumber)
  };
}

const compareFlag = flag("--compare");
if (compareFlag) {
  const other = args[args.indexOf("--compare") + 2];
  const before = JSON.parse(await fs.readFile(compareFlag, "utf8"));
  const after = JSON.parse(await fs.readFile(other, "utf8"));
  const countKeys = Object.keys(before.counts ?? {});
  const changed = countKeys.filter(
    (key) => JSON.stringify(before.counts[key]) !== JSON.stringify(after.counts[key])
  );
  const missingOrders = before.orderIds.filter((id) => !after.orderIds.includes(id));

  console.log(
    JSON.stringify(
      {
        before: { capturedAt: before.capturedAt, orders: before.orderIds.length },
        after: { capturedAt: after.capturedAt, orders: after.orderIds.length },
        changedCounts: changed,
        missingOrders,
        persisted: changed.length === 0 && missingOrders.length === 0
      },
      null,
      2
    )
  );
  if (changed.length > 0 || missingOrders.length > 0) process.exit(1);
} else {
  const out = flag("--out");
  const data = await snapshot();
  if (out) {
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, JSON.stringify(data, null, 2));
  }
  console.log(JSON.stringify(data, null, 2));
}
