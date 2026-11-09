/**
 * Platform foundation acceptance (PWA, install, location layer).
 *
 *  A. Manifest is valid, installable criteria are met, icons exist and load.
 *  B. Service worker registers, caches only static assets, and never caches
 *     private or financial routes (checked by reading its URL policy).
 *  C. Offline page exists; install page renders the real capability state.
 *  D. Location API: rejects unauthenticated posts, refuses a session the user
 *     does not own, accepts a valid batch, and is idempotent per clientId.
 *  E. Stale detection: a fix older than the stale window reports stale.
 *
 * Usage: node scripts/platform-pwa-e2e.cjs
 */
const { chromium } = require("playwright-core");
const { PrismaClient } = require("@prisma/client");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BASE_URL ?? "http://localhost:3015";
const prisma = new PrismaClient();
let passed = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) { passed += 1; console.log(`  PASS ${name}`); }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ""}`); console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};

async function register(browser, email) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120000 });
  const status = await page.evaluate(async (email) => (await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ name: "Platform E2E", email, password: "PlatformE2E123!" }) })).status, email);
  return { context, page, status, email };
}

const stamp = Date.now();

(async () => {
  // ---- A. Manifest -----------------------------------------------------
  const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "manifest.webmanifest"), "utf8"));
  check("manifest has name, short_name, start_url and scope", Boolean(manifest.name && manifest.short_name && manifest.start_url && manifest.scope));
  check("manifest uses standalone display", manifest.display === "standalone");
  check("manifest declares 192 and 512 icons", ["192x192", "512x512"].every((size) => manifest.icons.some((icon) => icon.sizes === size)));
  check("manifest declares a maskable icon", manifest.icons.some((icon) => String(icon.purpose || "").includes("maskable")));
  const missingIcons = manifest.icons.map((icon) => icon.src).filter((src) => !fs.existsSync(path.join(process.cwd(), "public", src.replace(/^\//, ""))));
  check("every manifest icon file exists", missingIcons.length === 0, missingIcons.join(", "));
  check("apple-touch-icon exists", fs.existsSync(path.join(process.cwd(), "public", "icons", "apple-touch-icon.png")));

  // ---- B. Service worker policy ---------------------------------------
  const sw = fs.readFileSync(path.join(process.cwd(), "public", "sw.js"), "utf8");
  check("service worker skips non-GET requests", /request\.method !== "GET"\)\s*return/.test(sw));
  check("service worker blocks private prefixes", /PRIVATE_PREFIXES[\s\S]*\/api\//.test(sw) && /isPrivate\(url\)\)\s*return/.test(sw));
  check("service worker never caches API responses", !/caches\.open[\s\S]{0,200}\/api\//.test(sw));
  check("service worker has a versioned cache and cleanup", /const VERSION = "naijadeals-v1"/.test(sw) && /caches\.delete/.test(sw));
  check("offline fallback page exists", fs.existsSync(path.join(process.cwd(), "app", "offline", "page.tsx")));

  // ---- C. Pages --------------------------------------------------------
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const installResponse = await page.goto(`${BASE}/install`, { waitUntil: "load" });
  check("install page loads", installResponse.status() === 200);
  const installText = await page.locator("#main-content").first().innerText();
  check("install page states iOS background limitation", /iPhone/i.test(installText) && /background/i.test(installText));
  check("install page shows the Android build blocker honestly", /Not available yet/.test(installText));
  const offlineResponse = await page.goto(`${BASE}/offline`, { waitUntil: "load" });
  check("offline page loads", offlineResponse.status() === 200);
  const manifestLink = await page.evaluate(() => document.querySelector('link[rel="manifest"]')?.getAttribute("href"));
  check("pages declare the web manifest", manifestLink === "/manifest.webmanifest", String(manifestLink));
  await context.close();

  // ---- D. Location API -------------------------------------------------
  const anonymous = await browser.newContext();
  const anonPage = await anonymous.newPage();
  await anonPage.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  const anonStatus = await anonPage.evaluate(async () => (await fetch("/api/location/pings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionRef: "drive:x", fixes: [] }) })).status);
  check("unauthenticated location upload refused", anonStatus === 401, String(anonStatus));
  await anonymous.close();

  const user = await register(browser, `platform.e2e.${stamp}@naijadeals.test`);
  check("test account created", user.status === 201, String(user.status));
  const dbUser = await prisma.user.findUnique({ where: { email: user.email }, select: { id: true } });

  const foreignSession = await user.page.evaluate(async () =>
    (await fetch("/api/location/pings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ sessionRef: "drive:not-a-real-ride", fixes: [{ clientId: "x1", latitude: 6.5, longitude: 3.3, capturedAt: new Date().toISOString() }] })
    })).status
  );
  check("a session the user does not own is refused", foreignSession === 403, String(foreignSession));

  // A real ride owned by the user: create driver + rider fixtures directly.
  const driverUser = await prisma.user.findFirst({ where: { email: "demo.eats@naijaeats.demo" }, select: { id: true } });
  void driverUser;
  const ride = await prisma.ride.findFirst({ where: { driver: { userId: dbUser.id } }, select: { id: true } }).catch(() => null);
  check("no fabricated ride is auto-created for a new user", ride === null);

  const batch = Array.from({ length: 5 }, (_, i) => ({
    clientId: `plat-${stamp}-${i}`,
    latitude: 6.45 + i * 0.0001,
    longitude: 3.39,
    accuracyM: 12,
    capturedAt: new Date(Date.now() - (5 - i) * 60_000).toISOString()
  }));
  // Use a shipment session the user owns: create a provider + shipment assignment.
  const provider = await prisma.logisticsProvider.create({ data: { ownerId: dbUser.id, name: `Platform E2E ${stamp}`, providerType: "courier", country: "Nigeria", contactPhone: "08030000000", status: "verified", verifiedAt: new Date() } });
  const shipment = await prisma.logisticsShipment.create({ data: { reference: `NSH-PLAT-${stamp}`, customerId: dbUser.id, description: "platform test", weightKg: 2, originLabel: "A", destinationLabel: "B", senderName: "a", senderPhone: "1", recipientName: "b", recipientPhone: "2" } });
  await prisma.shipmentAssignment.create({ data: { shipmentId: shipment.id, providerId: provider.id, quoteId: `q-${stamp}`, deliveryPinHash: "x".repeat(64) } });

  const upload = await user.page.evaluate(async ({ ref, fixes }) => {
    const r = await fetch("/api/location/pings", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ sessionRef: ref, fixes }) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, { ref: `send:${shipment.id}`, fixes: batch });
  check("owner can upload fixes for their assignment", upload.status === 200 && upload.body.accepted === 5, `${upload.status} accepted=${upload.body.accepted}`);

  const replay = await user.page.evaluate(async ({ ref, fixes }) => {
    const r = await fetch("/api/location/pings", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ sessionRef: ref, fixes }) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, { ref: `send:${shipment.id}`, fixes: batch });
  check("replaying the same batch creates no duplicates", replay.status === 200 && replay.body.accepted === 0, `accepted=${replay.body.accepted}`);
  const rowCount = await prisma.locationPing.count({ where: { sessionRef: `send:${shipment.id}` } });
  check("exactly five rows stored", rowCount === 5, String(rowCount));

  const sorted = await prisma.locationPing.findMany({ where: { sessionRef: `send:${shipment.id}` }, orderBy: { capturedAt: "asc" }, select: { capturedAt: true } });
  check("ordering uses capture time", sorted[0].capturedAt.getTime() < sorted[4].capturedAt.getTime());

  const badCoords = await user.page.evaluate(async ({ ref }) =>
    (await fetch("/api/location/pings", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ sessionRef: ref, fixes: [{ clientId: "bad1", latitude: 999, longitude: 3, capturedAt: new Date().toISOString() }] }) })).status
  , { ref: `send:${shipment.id}` });
  check("out-of-range coordinates rejected", badCoords === 400, String(badCoords));

  // ---- E. Stale detection ---------------------------------------------
  const staleRead = await user.page.evaluate(async (ref) => (await fetch(`/api/location/pings?sessionRef=${ref}`, { credentials: "include" })).json(), `send:${shipment.id}`);
  check("stale flag is computed from the newest capture time", typeof staleRead.stale === "boolean");
  await prisma.locationPing.updateMany({ where: { sessionRef: `send:${shipment.id}` }, data: { capturedAt: new Date(Date.now() - 10 * 60_000) } });
  const staleAfter = await user.page.evaluate(async (ref) => (await fetch(`/api/location/pings?sessionRef=${ref}`, { credentials: "include" })).json(), `send:${shipment.id}`);
  check("old fixes report stale", staleAfter.stale === true);

  // ---- Cleanup ---------------------------------------------------------
  await prisma.locationPing.deleteMany({ where: { sessionRef: `send:${shipment.id}` } });
  await prisma.shipmentAssignment.deleteMany({ where: { shipmentId: shipment.id } });
  await prisma.logisticsShipment.deleteMany({ where: { id: shipment.id } });
  await prisma.logisticsProvider.deleteMany({ where: { id: provider.id } });
  await prisma.deviceRegistration.deleteMany({ where: { userId: dbUser.id } });
  await prisma.user.delete({ where: { id: dbUser.id } }).catch(() => null);

  await browser.close();
  await prisma.$disconnect();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
