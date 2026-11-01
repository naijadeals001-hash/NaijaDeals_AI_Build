/**
 * Proves the background assignment-expiry sweeper works without any client polling.
 *
 * It creates a real cash ride, has a driver accept it, then moves the deadline into
 * the past directly in the database. After that it deliberately makes NO HTTP request
 * to any drive endpoint; it only watches the database row. If the row flips back to
 * "requested" with no driver, the server's periodic sweeper did the work on its own.
 *
 * Usage: TEST_BASE_URL=http://localhost:3100 npx tsx scripts/drive-idle-sweep.ts
 * Env:   TEST_BASE_URL, IDLE_SWEEP_TIMEOUT_MS (default 50000)
 */
import { PrismaClient } from "@prisma/client";

const BASE = (process.env.TEST_BASE_URL || "http://localhost:3100").replace(/\/$/, "");
const TIMEOUT_MS = Number(process.env.IDLE_SWEEP_TIMEOUT_MS ?? 50_000);
const db = new PrismaClient();

type Json = Record<string, any>;

class Client {
  private cookies = new Map<string, string>();

  async request(path: string, options: { method?: string; body?: unknown } = {}) {
    const headers: Record<string, string> = { Origin: BASE };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    const cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
    if (cookie) headers.Cookie = cookie;

    const response = await fetch(`${BASE}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    for (const entry of response.headers.getSetCookie?.() ?? []) {
      const pair = entry.split(";")[0];
      const index = pair.indexOf("=");
      if (index > 0) this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: response.status, body };
  }

  post(path: string, body?: unknown) {
    return this.request(path, { method: "POST", body });
  }

  async login(email: string, password: string) {
    const result = await this.post("/api/auth/login", { email, password });
    if (result.status !== 200) throw new Error(`login ${email} failed: ${result.status}`);
  }
}

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} -- ${detail}`);
}

const customer = new Client();
const driver = new Client();
let rideId = "";

try {
  await customer.login("customer@naijadeals.local", "CustomerPass123!");
  await driver.login("driver@naijadeals.local", "DriverPass123!");

  const request = await customer.post("/api/drive/rides", {
    pickupId: "maryland",
    dropoffId: "apapa",
    vehicleClass: "economy",
    paymentMethod: "cash"
  });
  if (request.status !== 201) throw new Error(`ride request failed: ${request.status}`);
  rideId = (request.body as Json).id;

  const accept = await driver.post(`/api/drive/driver/rides/${rideId}/accept`);
  record("A driver accepts the ride", accept.status === 200, `HTTP ${accept.status}`);

  await db.ride.update({
    where: { id: rideId },
    data: { assignmentExpiresAt: new Date(Date.now() - 60_000) }
  });

  // From here on, only the database is read. No drive endpoint is called, so the
  // read-time sweep cannot be what releases this ride.
  const started = Date.now();
  let released: { status: string; driverId: string | null } | null = null;
  while (Date.now() - started < TIMEOUT_MS) {
    const row = await db.ride.findUnique({
      where: { id: rideId },
      select: { status: true, driverId: true }
    });
    if (row?.status === "requested" && row.driverId === null) {
      released = row;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  const elapsed = Date.now() - started;
  record(
    "The idle sweeper returns the ride to the queue with no client polling",
    released !== null,
    released ? `released after ${Math.round(elapsed / 1000)}s` : `still assigned after ${TIMEOUT_MS}ms`
  );

  const events = await db.rideEvent.count({
    where: { rideId, label: "Driver did not respond in time" }
  });
  record("The release is recorded once in the ride history", events === 1, `${events} event(s)`);
} catch (error) {
  record("Idle sweep check completed", false, error instanceof Error ? error.message : String(error));
} finally {
  if (rideId) {
    await customer.post(`/api/drive/rides/${rideId}/cancel`, { reason: "Idle sweep cleanup" });
  }
  await db.$disconnect();
}

const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) process.exitCode = 1;
