/**
 * Mobile-foundation acceptance for the Android-era work: operations access,
 * retention, and account isolation in the service worker.
 *
 *  1. Operations endpoint requires auth and `deliveries:read`.
 *  2. Operations endpoint refuses bulk reads (sessionRef mandatory).
 *  3. It reports freshness from server timestamps and flags stale data.
 *  4. Retention job deletes expired pings in bounded batches and keeps recent ones.
 *  5. Retention cannot be fooled by a delayed upload: an old capturedAt is expired.
 *  6. Service worker refuses to cache private prefixes (account isolation).
 *  7. The shipped APK exists, is signed, and its recorded checksum matches.
 *
 * Usage: node scripts/mobile-foundation-e2e.cjs
 */
const { chromium } = require("playwright-core");
const { PrismaClient } = require("@prisma/client");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const BASE = process.env.BASE_URL ?? "http://localhost:3015";
const prisma = new PrismaClient();
let passed = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) { passed += 1; console.log(`  PASS ${name}`); }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ""}`); console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};

async function login(browser, email, password) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120000 });
  const status = await page.evaluate(async ({ email, password }) => (await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ email, password }) })).status, { email, password });
  return { context, page, status };
}

const stamp = Date.now();

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const sessionRef = `send:retention-${stamp}`;

  const customer = await login(browser, "customer@naijadeals.local", "CustomerPass123!");
  const admin = await login(browser, "admin@naijadeals.local", "AdminPass123!");
  check("customer signs in", customer.status === 200);
  check("admin signs in", admin.status === 200);

  // Fixture pings: 3 fresh, 3 expired.
  const customerRow = await prisma.user.findUnique({ where: { email: "customer@naijadeals.local" }, select: { id: true } });
  const device = await prisma.deviceRegistration.create({ data: { userId: customerRow.id, platform: "android" } });
  const now = Date.now();
  const inserts = [
    ...[0, 60_000, 120_000].map((age, i) => ({ capturedAt: new Date(now - age), clientId: `fresh-${stamp}-${i}` })),
    ...[40, 45, 50].map((days, i) => ({ capturedAt: new Date(now - days * 86_400_000), clientId: `expired-${stamp}-${i}` }))
  ].map((row) => ({ deviceId: device.id, userId: customerRow.id, sessionRef, latitude: 6.5, longitude: 3.3, capturedAt: row.capturedAt, clientId: row.clientId }));
  await prisma.locationPing.createMany({ data: inserts });

  // ---- 1/2/3. Operations access ---------------------------------------
  const anon = await fetch(`${BASE}/api/admin/location?sessionRef=${sessionRef}`).then((r) => r.status);
  check("operations endpoint refuses unauthenticated reads", anon === 401 || anon === 403, String(anon));

  const customerRead = await customer.page.evaluate(async (ref) => (await fetch(`/api/admin/location?sessionRef=${ref}`, { credentials: "include" })).status, sessionRef);
  check("a customer cannot read operations positions", customerRead === 403, String(customerRead));

  const bulk = await admin.page.evaluate(async () => (await fetch("/api/admin/location", { credentials: "include" })).status);
  check("bulk position feed is refused", bulk === 400, String(bulk));

  const opsRead = await admin.page.evaluate(async (ref) => {
    const r = await fetch(`/api/admin/location?sessionRef=${ref}&limit=10`, { credentials: "include" });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, sessionRef);
  check("operations can read one session", opsRead.status === 200, `${opsRead.status} ${opsRead.body.error ?? ""}`);
  check("response reports freshness from server time", typeof opsRead.body.ageSeconds === "number" && typeof opsRead.body.stale === "boolean");
  check("trail is bounded by the limit", Array.isArray(opsRead.body.trail) && opsRead.body.trail.length <= 10);

  const audit = await prisma.auditLog.findFirst({ where: { action: "location.positions_viewed", entityId: sessionRef }, select: { id: true } });
  check("operations access is audited", Boolean(audit));

  // ---- 4. Retention ----------------------------------------------------
  const dry = execFileSync("node", ["scripts/location-retention.cjs", "--dry-run"], { encoding: "utf8" });
  const dryRun = JSON.parse(dry.trim().split("\n").pop());
  check("retention dry-run reports expired rows", dryRun.dryRun === true && dryRun.expired >= 3, JSON.stringify(dryRun));

  const run = execFileSync("node", ["scripts/location-retention.cjs"], { encoding: "utf8", env: { ...process.env, LOCATION_RETENTION_BATCH: "2" } });
  const summary = JSON.parse(run.trim().split("\n").pop());
  check("retention deleted the expired rows", summary.deleted >= 3, JSON.stringify(summary));
  check("retention used bounded batches", summary.batches >= 2, String(summary.batches));
  const freshLeft = await prisma.locationPing.count({ where: { sessionRef } });
  check("recent records survive retention", freshLeft === 3, String(freshLeft));
  const expiredLeft = await prisma.locationPing.count({ where: { sessionRef, capturedAt: { lt: new Date(now - 30 * 86_400_000) } } });
  check("expired records are gone", expiredLeft === 0, String(expiredLeft));

  // ---- 5. Delayed upload cannot resurrect expired data ----------------
  const late = await prisma.locationPing.create({ data: { deviceId: device.id, userId: customerRow.id, sessionRef, latitude: 6.5, longitude: 3.3, capturedAt: new Date(now - 60 * 86_400_000), clientId: `late-${stamp}` } });
  execFileSync("node", ["scripts/location-retention.cjs"], { encoding: "utf8" });
  const lateStillThere = await prisma.locationPing.findUnique({ where: { id: late.id }, select: { id: true } });
  check("a late-arriving old fix is expired by the next run", lateStillThere === null);

  // ---- 6. Service worker isolation ------------------------------------
  const sw = fs.readFileSync(path.join(process.cwd(), "public", "sw.js"), "utf8");
  for (const prefix of ["/api/", "/wallet", "/checkout", "/pay", "/login", "/account"]) {
    check(`service worker excludes ${prefix}`, sw.includes(`"${prefix}"`));
  }
  check("navigation requests are never served from a page cache", !/cache\.match\(request\)[\s\S]{0,80}navigate/.test(sw));

  // ---- 7. APK ----------------------------------------------------------
  const releaseSource = fs.readFileSync(path.join(process.cwd(), "lib", "platform", "release.ts"), "utf8");
  const apkPath = path.join(process.cwd(), "public", "downloads", "naijadeals-1.0.0.apk");
  const apkExists = fs.existsSync(apkPath);
  check("the release APK is present", apkExists);
  if (apkExists) {
    const checksum = crypto.createHash("sha256").update(fs.readFileSync(apkPath)).digest("hex");
    check("published checksum matches the APK", releaseSource.includes(checksum), checksum.slice(0, 12));
    check("download is marked available", /available:\s*true/.test(releaseSource));
    const sdk = path.join(process.env.LOCALAPPDATA, "Android", "Sdk", "build-tools", "34.0.0", "apksigner.bat");
    if (fs.existsSync(sdk)) {
      const verify = execFileSync(`"${sdk}"`, ["verify", "--print-certs", apkPath], { encoding: "utf8", shell: true });
      check("APK signature verifies", /Signer #1 certificate/.test(verify));
    }
  }

  // ---- Cleanup ---------------------------------------------------------
  await prisma.locationPing.deleteMany({ where: { sessionRef } });
  await prisma.deviceRegistration.delete({ where: { id: device.id } }).catch(() => null);

  await browser.close();
  await prisma.$disconnect();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
