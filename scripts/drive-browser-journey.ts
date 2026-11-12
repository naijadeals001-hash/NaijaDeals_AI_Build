/**
 * NaijaDrive browser journey: rider code, driver verification/start/complete,
 * receipt, ratings for both roles, history/support, authorization, cache
 * exclusions, ledger balances and the Control Center pickup-code support UI.
 *
 * Runs only against an explicitly isolated database whose name contains "test".
 * It uses the seeded E2E accounts plus the seeded Control Center admin; all rides
 * it creates are closed in the finally block. Browser geolocation is simulated and
 * labelled as such.
 *
 * Usage:
 *   DATABASE_URL=<isolated test db> TEST_BASE_URL=http://localhost:3025 \
 *     npx tsx scripts/drive-browser-journey.ts
 */
import { PrismaClient } from "@prisma/client";
import { chromium, request as playwrightRequest, type BrowserContext, type Page } from "playwright";
import fs from "node:fs/promises";
import { hashPassword } from "../lib/auth/password";
import {
  E2E_CUSTOMER_EMAIL,
  E2E_DRIVER2_EMAIL,
  E2E_DRIVER_EMAIL,
  E2E_PASSWORD,
  ensureNairadriveFixtures
} from "./nairadrive-fixtures";

const BASE = (process.env.TEST_BASE_URL || "http://localhost:3017").replace(/\/$/, "");
const OUT = "qa-artifacts/drive-browser-journey";
const ADMIN_EMAIL = "admin@naijadeals.local";
const ADMIN_PASSWORD = "AdminPass123!";
const SIMULATED_GPS = { latitude: 6.5244, longitude: 3.3792, accuracy: 12 };
const SUPPORT_EMAIL = `drive-support-${Date.now()}@naijadeals.local`;
const SUPPORT_PASSWORD = "SupportRolePass123!";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const dbName = new URL(process.env.DATABASE_URL).pathname.replace(/^\//, "");
if (!/test/i.test(dbName)) {
  throw new Error(`Refusing to run: database "${dbName}" does not look isolated (name must contain "test").`);
}

const prisma = new PrismaClient();
const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function record(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function step(name: string, fn: () => Promise<string | void>) {
  console.log(`RUN   ${name}`);
  try {
    const detail = (await fn()) ?? "";
    record(name, true, detail);
  } catch (error) {
    record(name, false, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

async function noOverflow(page: Page, label: string) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth
  }));
  assert(metrics.scrollWidth <= metrics.innerWidth + 1, `${label} has horizontal overflow: ${JSON.stringify(metrics)}`);
  return JSON.stringify(metrics);
}

async function login(page: Page, email: string, password: string, nextPath: string, expect: RegExp) {
  await page.goto(`${BASE}/login?next=${encodeURIComponent(nextPath)}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000
  });
  await page.waitForTimeout(1200);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(expect, { timeout: 30_000 });
  await page.waitForLoadState("load");
}

async function apiLogin(context: Awaited<ReturnType<typeof playwrightRequest.newContext>>, email: string, password: string) {
  const response = await context.post("/api/auth/login", { data: { email, password } });
  assert(response.status() === 200, `API login ${email} returned ${response.status()}`);
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const fixtures = await ensureNairadriveFixtures();
  await prisma.driverProfile.updateMany({
    where: { id: { in: [fixtures.driver.id, fixtures.driver2.id] } },
    data: { online: false }
  });
  const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL }, select: { id: true } });
  assert(admin, `Seeded Control Center admin ${ADMIN_EMAIL} is missing from this database.`);

  // A previous aborted run may have left the fixture rider with an active ride.
  const preClean = await playwrightRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: BASE } });
  await apiLogin(preClean, E2E_CUSTOMER_EMAIL, E2E_PASSWORD);
  const existing = (await (await preClean.get("/api/drive/rides")).json()) as Array<{ id: string; status: string }>;
  for (const ride of existing) {
    if (["requested", "driver_assigned", "driver_arriving"].includes(ride.status)) {
      await preClean.post(`/api/drive/rides/${ride.id}/cancel`, { data: { reason: "Journey pre-clean" } });
    }
  }
  await preClean.dispose();

  const browser = await chromium.launch({ headless: true });
  let customerContext: BrowserContext | null = null;
  let driverContext: BrowserContext | null = null;
  let adminContext: BrowserContext | null = null;
  let supportContext: BrowserContext | null = null;
  let customerPage: Page | null = null;
  let driverPage: Page | null = null;
  let rideId = "";
  let rideNumber = "";
  let verificationCode = "";
  let adminRideId = "";
  let adminRideNumber = "";
  let supportUserId = "";

  try {
    /* ------------------------------------------------------------ rider --- */
    customerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-NG" });
    customerPage = await customerContext.newPage();
    customerPage.setDefaultTimeout(30_000);

    await step("Rider signs in and requests a wallet ride with a held fare", async () => {
      assert(customerPage, "customer page missing");
      await login(
        customerPage,
        E2E_CUSTOMER_EMAIL,
        E2E_PASSWORD,
        "/naijadrive?pickup=computer-village&dropoff=maryland&class=comfort",
        /\/naijadrive\?/
      );
      await customerPage.getByText("NaijaPay wallet", { exact: true }).click();
      await customerPage.getByRole("button", { name: "Request ride" }).click();
      await customerPage.getByText(/Ride NDR-.* requested/).waitFor({ timeout: 20_000 });
      const match = (await customerPage.locator("body").innerText()).match(/Ride (NDR-[A-Z0-9-]+) requested/);
      assert(match, "ride number not shown in the confirmation");
      rideNumber = match[1];
      const rides = (await customerPage.evaluate(async () => {
        const response = await fetch("/api/drive/rides", { cache: "no-store" });
        return response.json();
      })) as Array<{ id: string; rideNumber: string; status: string; paymentStatus: string }>;
      const ride = rides.find((row) => row.rideNumber === rideNumber);
      assert(ride, "created ride missing from the rider API");
      rideId = ride.id;
      assert(ride.paymentStatus === "held", `wallet fare was not held: ${ride.paymentStatus}`);
      return `${rideNumber} · ${ride.paymentStatus}`;
    });

    /* ----------------------------------------------------------- driver --- */
    driverContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      geolocation: SIMULATED_GPS,
      permissions: ["geolocation"],
      locale: "en-NG"
    });
    driverPage = await driverContext.newPage();
    driverPage.setDefaultTimeout(30_000);

    await step("Approved driver goes online and accepts the request", async () => {
      assert(driverPage, "driver page missing");
      await login(driverPage, E2E_DRIVER_EMAIL, E2E_PASSWORD, "/driver", /\/driver$/);
      await driverPage.waitForTimeout(1200);
      const goOnline = driverPage.getByRole("button", { name: "Go online" });
      if (await goOnline.count()) {
        await goOnline.click();
        await driverPage.getByText(/You are online/).waitFor({ timeout: 30_000 });
      }
      const row = driverPage.locator("li", { hasText: rideNumber }).first();
      await row.waitFor({ timeout: 40_000 });
      await row.getByRole("button", { name: "Accept" }).click();
      await driverPage.getByRole("heading", { name: /Heading to pick-up/i }).waitFor({ timeout: 40_000 });
      return "online · accepted";
    });

    await step("Driver arrives; rider retrieves the code with no-store cache headers", async () => {
      assert(driverPage && customerPage, "pages missing");
      await driverPage.getByRole("button", { name: /I have arrived at pick-up/i }).click();
      await driverPage.getByRole("heading", { name: /At the pick-up/i }).waitFor({ timeout: 30_000 });
      await customerPage.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
      await customerPage
        .getByText(/Share this code only when you have checked your driver and vehicle/i)
        .waitFor({ timeout: 30_000 });
      const verification = await customerPage.evaluate(async (id) => {
        const response = await fetch(`/api/drive/rides/${id}/verification`, { cache: "no-store" });
        const body = await response.json();
        return {
          code: body.code as string,
          cacheControl: response.headers.get("cache-control") ?? "",
          legacy: body.legacy as boolean,
          required: body.required as boolean
        };
      }, rideId);
      assert(/^\d{4}$/.test(verification.code), `pickup code is not 4 digits: ${verification.code}`);
      assert(verification.required && !verification.legacy, "current ride did not require a code");
      assert(/no-store/.test(verification.cacheControl), `verification response is cacheable: ${verification.cacheControl}`);
      assert(/private/.test(verification.cacheControl), `verification response is not private: ${verification.cacheControl}`);
      assert(!customerPage.url().includes(verification.code), "pickup code leaked into the page URL");
      verificationCode = verification.code;
      return `code retrieved · ${verification.cacheControl}`;
    });

    await step("Driver submits the code, starts and completes the trip", async () => {
      assert(driverPage && customerPage, "pages missing");
      const heldBefore = await prisma.wallet.findFirstOrThrow({
        where: { userId: fixtures.customer.id, ownerType: "CUSTOMER" },
        select: { heldKobo: true }
      });
      const rideBefore = await prisma.ride.findUniqueOrThrow({
        where: { id: rideId },
        select: { fareKobo: true, driverId: true }
      });
      assert(heldBefore.heldKobo === rideBefore.fareKobo, "rider fare was not held before the trip");

      await driverPage.bringToFront();
      await driverPage.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
      await driverPage.locator("#passenger-code").fill(verificationCode);
      await driverPage.getByRole("button", { name: "Verify passenger" }).click();
      await driverPage.getByText(/Passenger verified/i).first().waitFor({ timeout: 30_000 });
      await driverPage.getByRole("button", { name: "Start trip" }).click();
      await driverPage.getByRole("heading", { name: /Heading to destination/i }).waitFor({ timeout: 40_000 });
      await driverPage.getByRole("button", { name: /complete trip/i }).click();
      await driverPage.getByText(/Trip completed/i).first().waitFor({ timeout: 40_000 });

      const rideAfter = await prisma.ride.findUniqueOrThrow({
        where: { id: rideId },
        select: { status: true, paymentStatus: true, fareKobo: true }
      });
      assert(rideAfter.status === "completed" && rideAfter.paymentStatus === "paid", `ride state ${rideAfter.status}/${rideAfter.paymentStatus}`);
      return `${rideAfter.fareKobo} kobo released`;
    });

    await step("Ledger transaction and wallet projections match the completed fare", async () => {
      const ride = await prisma.ride.findUniqueOrThrow({
        where: { id: rideId },
        select: { fareKobo: true, driverId: true }
      });
      const transaction = await prisma.walletTransaction.findFirst({
        where: { reference: `RIDE-${rideId}-RELEASE` },
        include: { ledger: true }
      });
      assert(transaction, "release transaction missing");
      const debits = transaction.ledger
        .filter((entry) => entry.direction === "DEBIT")
        .reduce((total, entry) => total + entry.amountKobo, BigInt(0));
      const credits = transaction.ledger
        .filter((entry) => entry.direction === "CREDIT")
        .reduce((total, entry) => total + entry.amountKobo, BigInt(0));
      assert(debits === ride.fareKobo && credits === ride.fareKobo, "release ledger is not balanced");
      const riderWallet = await prisma.wallet.findFirstOrThrow({
        where: { userId: fixtures.customer.id, ownerType: "CUSTOMER" },
        select: { heldKobo: true }
      });
      assert(riderWallet.heldKobo === BigInt(0), `rider held balance is ${riderWallet.heldKobo}`);
      assert(ride.driverId, "completed ride has no driver");
      const driverProfile = await prisma.driverProfile.findUniqueOrThrow({ where: { id: ride.driverId } });
      const driverWallet = await prisma.wallet.findFirstOrThrow({
        where: { userId: driverProfile.userId, ownerType: "DRIVER" },
        select: { id: true, availableKobo: true }
      });
      assert(
        transaction.ledger.some(
          (entry) => entry.walletId === driverWallet.id && entry.direction === "CREDIT" && entry.amountKobo === ride.fareKobo
        ),
        "driver wallet did not receive the released fare in the ledger"
      );
      return `balanced ${debits} kobo debit/credit · rider held 0 · driver available ${driverWallet.availableKobo}`;
    });

    /* ---------------------------------------------------- receipts/rating --- */
    await step("Rider sees the receipt, rates the driver and opens history/support", async () => {
      assert(customerPage, "customer page missing");
      await customerPage.bringToFront();
      await customerPage.goto(`${BASE}/naijadrive`, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await customerPage.getByRole("heading", { name: "Your rides" }).waitFor({ timeout: 30_000 });
      try {
        await customerPage.getByRole("heading", { name: "Trip receipt" }).waitFor({ timeout: 30_000 });
      } catch (error) {
        const headings = await customerPage.locator("h1,h2,h3").allInnerTexts();
        const body = await customerPage.locator("body").innerText();
        await customerPage.screenshot({ path: `${OUT}/debug-receipt-missing.png`, fullPage: true });
        console.error("Receipt heading missing. URL:", customerPage.url());
        console.error("Headings:", JSON.stringify(headings));
        console.error("Body excerpt:", body.slice(0, 1600));
        throw error;
      }
      await customerPage.getByText("Rate your driver").waitFor({ timeout: 30_000 });
      await customerPage.getByRole("radio", { name: "5 out of 5" }).click();
      await customerPage.getByLabel("Optional feedback (not published)").fill("Smooth, careful trip.");
      await customerPage.getByRole("button", { name: "Submit rating" }).click();
      await customerPage.getByText(/You rated this trip 5\/5/).waitFor({ timeout: 30_000 });

      const history = customerPage.locator("#ride-history-heading");
      await history.scrollIntoViewIfNeeded();
      assert(await customerPage.getByText(rideNumber).count(), "completed ride missing from rider history");
      const supportLink = customerPage.locator('a[href="/naijadrive/help#support"]').first();
      assert(await supportLink.count(), "support link missing from the receipt/history");
      await supportLink.click();
      await customerPage.waitForURL(/\/naijadrive\/help#support/, { timeout: 30_000 });
      await customerPage.getByRole("heading", { name: "Support" }).waitFor({ timeout: 30_000 });
      await customerPage.goto(`${BASE}/naijadrive`, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await customerPage.getByRole("heading", { name: "Your rides" }).waitFor({ timeout: 30_000 });
      await customerPage.getByRole("heading", { name: "Trip receipt" }).waitFor({ timeout: 30_000 });

      await customerPage.setViewportSize({ width: 1440, height: 1000 });
      const desktop = await noOverflow(customerPage, "rider receipt at 1440px");
      await customerPage.screenshot({ path: `${OUT}/rider-receipt-rating-desktop.png`, fullPage: true });
      await customerPage.setViewportSize({ width: 390, height: 844 });
      const mobile = await noOverflow(customerPage, "rider receipt at 390px");
      await customerPage.screenshot({ path: `${OUT}/rider-receipt-rating-mobile.png`, fullPage: true });
      return `rated 5/5 · history/support · desktop ${desktop} mobile ${mobile}`;
    });

    await step("Driver rates the passenger and sees the trip in recent history", async () => {
      assert(driverPage, "driver page missing");
      await driverPage.bringToFront();
      await driverPage.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
      await driverPage.getByRole("button", { name: "Open driver menu" }).click();
      await driverPage.getByRole("button", { name: "Trips", exact: true }).click();
      await driverPage.getByText("Recent trips").waitFor({ timeout: 30_000 });
      await driverPage.getByText("Rate your passenger").waitFor({ timeout: 30_000 });
      await driverPage.getByRole("radio", { name: "4 out of 5" }).click();
      await driverPage.getByLabel("Optional feedback (not published)").fill("Ready at pick-up.");
      await driverPage.getByRole("button", { name: "Submit rating" }).click();
      await driverPage.getByText(/You rated this trip 4\/5/).waitFor({ timeout: 30_000 });
      assert(await driverPage.getByText(rideNumber).count(), "completed ride missing from driver recent trips");
      await driverPage.setViewportSize({ width: 390, height: 844 });
      const mobile = await noOverflow(driverPage, "driver recent trips at 390px");
      await driverPage.screenshot({ path: `${OUT}/driver-ratings-history-mobile.png`, fullPage: true });
      await driverPage.setViewportSize({ width: 1440, height: 1000 });
      const desktop = await noOverflow(driverPage, "driver recent trips at 1440px");
      await driverPage.screenshot({ path: `${OUT}/driver-ratings-history-desktop.png`, fullPage: true });

      await driverPage.getByRole("button", { name: "Support", exact: true }).click();
      await driverPage.getByRole("heading", { name: "Driver help" }).waitFor({ timeout: 30_000 });
      const support = driverPage.getByRole("link", { name: /Open driver help/i });
      const href = await support.getAttribute("href");
      assert(href === "/naijadrive/help#drivers", `driver support link is ${href}`);
      await support.click();
      await driverPage.waitForURL(/\/naijadrive\/help#drivers/, { timeout: 30_000 });
      await driverPage.getByRole("heading", { name: "Support" }).waitFor({ timeout: 30_000 });
      return `rated 4/5 · recent trip + support · ${mobile} ${desktop}`;
    });

    await step("Both completed-trip ratings are persisted with participant-derived roles", async () => {
      const ratings = await prisma.rideRating.findMany({ where: { rideId }, orderBy: { score: "asc" } });
      assert(ratings.length === 2, `expected two ratings, found ${ratings.length}`);
      assert(
        ratings[0].score === 4 && ratings[0].raterRole === "driver" && ratings[1].score === 5 && ratings[1].raterRole === "customer",
        JSON.stringify(ratings.map((row) => ({ score: row.score, role: row.raterRole })))
      );
      return "one rider rating + one driver rating";
    });

    /* ----------------------------------------------------- authorization --- */
    await step("Authorization and cache rules hold for the private endpoints", async () => {
      const other = await playwrightRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: BASE } });
      const email = `journey-other-${Date.now()}@naijadeals.local`;
      const registered = await other.post("/api/auth/register", {
        data: { name: "Journey Other", email, password: "JourneyPass123!" }
      });
      assert(registered.status() === 201, `other registration returned ${registered.status()}`);
      const otherTracking = await other.get(`/api/drive/rides/${rideId}/tracking`);
      assert(otherTracking.status() === 403, `cross-account tracking returned ${otherTracking.status()}`);
      const otherVerification = await other.get(`/api/drive/rides/${rideId}/verification`);
      assert([403, 409].includes(otherVerification.status()), `cross-account verification returned ${otherVerification.status()}`);

      const driverApi = await playwrightRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: BASE } });
      await apiLogin(driverApi, E2E_DRIVER_EMAIL, E2E_PASSWORD);
      const driverCode = await driverApi.get(`/api/drive/rides/${rideId}/verification`);
      assert(driverCode.status() === 403, `driver read of the rider code returned ${driverCode.status()}`);

      const adminApi = await playwrightRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: BASE } });
      await apiLogin(adminApi, ADMIN_EMAIL, ADMIN_PASSWORD);
      const adminCode = await adminApi.get(`/api/drive/rides/${rideId}/verification`);
      assert(adminCode.status() === 403, `admin read of the raw code returned ${adminCode.status()}`);

      const anonymous = await playwrightRequest.newContext({ baseURL: BASE });
      const anonymousTracking = await anonymous.get(`/api/drive/rides/${rideId}/tracking`);
      assert(anonymousTracking.status() === 401, `anonymous tracking returned ${anonymousTracking.status()}`);

      await Promise.all([other.dispose(), driverApi.dispose(), adminApi.dispose(), anonymous.dispose()]);
      return "cross-account 403 · driver/admin code 403 · anonymous 401";
    });

    /* ------------------------------------------- Control Center support UI --- */
    const customerApi = await playwrightRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: BASE } });
    const driverApi = await playwrightRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: BASE } });
    await apiLogin(customerApi, E2E_CUSTOMER_EMAIL, E2E_PASSWORD);
    await apiLogin(driverApi, E2E_DRIVER_EMAIL, E2E_PASSWORD);
    const adminRideRequest = await customerApi.post("/api/drive/rides", {
      data: {
        pickupId: "ikeja-city-mall",
        dropoffId: "maryland",
        vehicleClass: "economy",
        paymentMethod: "cash"
      }
    });
    assert(adminRideRequest.status() === 201, `support ride request returned ${adminRideRequest.status()}`);
    const adminRide = (await adminRideRequest.json()) as { id: string; rideNumber: string };
    adminRideId = adminRide.id;
    adminRideNumber = adminRide.rideNumber;
    const accepted = await driverApi.post(`/api/drive/driver/rides/${adminRideId}/accept`);
    assert(accepted.status() === 200, `support ride accept returned ${accepted.status()}`);

    await step("A read-only support role cannot see or call pickup-code moderation", async () => {
      const supportRole = await prisma.role.findUniqueOrThrow({ where: { name: "support" } });
      const supportUser = await prisma.user.create({
        data: {
          email: SUPPORT_EMAIL,
          name: "Journey Read-only Support",
          actorType: "ADMIN",
          passwordHash: await hashPassword(SUPPORT_PASSWORD),
          verifiedAt: new Date(),
          roles: { create: { roleId: supportRole.id } }
        }
      });
      supportUserId = supportUser.id;
      supportContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const supportPage = await supportContext.newPage();
      await login(supportPage, SUPPORT_EMAIL, SUPPORT_PASSWORD, "/admin?tab=rides&module=drive", /\/admin/);
      await supportPage.getByRole("heading", { name: "Trips" }).waitFor({ timeout: 90_000 });
      assert(
        (await supportPage.getByRole("heading", { name: "Pickup-code support" }).count()) === 0,
        "read-only support role can see the pickup-code moderation panel"
      );
      const status = await supportPage.evaluate(async (id) => {
        const response = await fetch(`/api/drive/rides/${id}/verification/support`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "verify", reason: "Read-only support role check" })
        });
        return response.status;
      }, adminRideId);
      assert(status === 403, `read-only support moderation returned ${status}`);
      return "panel hidden · support action 403";
    });

    await step("Control Center admin resets and verifies a pickup code through the UI", async () => {
      adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const adminPage = await adminContext.newPage();
      adminPage.setDefaultTimeout(30_000);
      await login(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD, "/admin?tab=rides&module=drive", /\/admin/);
      await adminPage.getByRole("heading", { name: "Pickup-code support" }).waitFor({ timeout: 90_000 });

      const row = adminPage.locator("li").filter({ hasText: adminRideNumber }).first();
      await row.waitFor({ timeout: 60_000 });
      const reason = row.getByLabel(/Reason for this support action/);
      await reason.fill("Browser journey support reset");
      await row.getByRole("button", { name: "Reset code" }).click();
      await adminPage.getByRole("status").filter({ hasText: /Pickup code reset for/ }).waitFor({ timeout: 30_000 });

      const riderCodeResponse = await customerApi.get(`/api/drive/rides/${adminRideId}/verification`);
      assert(riderCodeResponse.status() === 200, `rider code after support reset returned ${riderCodeResponse.status()}`);
      const riderCode = (await riderCodeResponse.json()) as { code: string | null; required: boolean };
      assert(typeof riderCode.code === "string" && /^\d{4}$/.test(riderCode.code), "support reset did not issue a new code");

      await reason.fill("Browser journey support verify");
      await row.getByRole("button", { name: "Mark passenger verified" }).click();
      await adminPage.getByRole("status").filter({ hasText: /Passenger marked verified/ }).waitFor({ timeout: 30_000 });
      const stateAfter = (await (await customerApi.get(`/api/drive/rides/${adminRideId}/verification`)).json()) as {
        verified: boolean;
        code: string | null;
      };
      assert(stateAfter.verified === true && stateAfter.code === null, "support verify did not persist");

      const audits = await prisma.auditLog.count({
        where: {
          entityId: adminRideId,
          action: { in: ["ride.verification_support_reset", "ride.verification_support_verified"] }
        }
      });
      assert(audits === 2, `expected two support audit rows, found ${audits}`);

      await adminPage.setViewportSize({ width: 390, height: 844 });
      const mobile = await noOverflow(adminPage, "Control Center support at 390px");
      await adminPage.screenshot({ path: `${OUT}/admin-support-mobile.png`, fullPage: true });
      await adminPage.setViewportSize({ width: 1440, height: 1000 });
      const desktop = await noOverflow(adminPage, "Control Center support at 1440px");
      await adminPage.screenshot({ path: `${OUT}/admin-support-desktop.png`, fullPage: true });
      return `reset + verify · audit 2 · mobile ${mobile} desktop ${desktop}`;
    });

    await step("Support-verified trip starts, completes and leaves a clean rider view", async () => {
      const arrived = await driverApi.post(`/api/drive/driver/rides/${adminRideId}/status`, {
        data: { status: "driver_arriving" }
      });
      assert(arrived.status() === 200, `arrive returned ${arrived.status()}`);
      const started = await driverApi.post(`/api/drive/driver/rides/${adminRideId}/status`, {
        data: { status: "in_progress" }
      });
      assert(started.status() === 200, `start returned ${started.status()}`);
      const completed = await driverApi.post(`/api/drive/driver/rides/${adminRideId}/status`, {
        data: { status: "completed" }
      });
      assert(completed.status() === 200, `complete returned ${completed.status()}`);
      const ride = await prisma.ride.findUniqueOrThrow({ where: { id: adminRideId }, select: { status: true } });
      assert(ride.status === "completed", `support ride did not complete: ${ride.status}`);
      return "approved by support · completed";
    });

    await Promise.all([customerApi.dispose(), driverApi.dispose()]);
  } catch (error) {
    console.error("\nJourney aborted:", error instanceof Error ? error.message : error);
  } finally {
    try {
      const active = await prisma.ride.findMany({
        where: {
          riderId: fixtures.customer.id,
          status: { in: ["requested", "driver_assigned", "driver_arriving"] }
        },
        select: { id: true }
      });
      for (const ride of active) {
        const context = await playwrightRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: BASE } });
        await apiLogin(context, E2E_CUSTOMER_EMAIL, E2E_PASSWORD);
        await context.post(`/api/drive/rides/${ride.id}/cancel`, { data: { reason: "Browser journey cleanup" } });
        await context.dispose();
      }
      await prisma.driverProfile.updateMany({
        where: { id: { in: [fixtures.driver.id, fixtures.driver2.id] } },
        data: { online: false }
      });
      if (supportUserId) {
        await prisma.userRole.deleteMany({ where: { userId: supportUserId } });
        await prisma.user.delete({ where: { id: supportUserId } }).catch(() => undefined);
      }
    } catch {
      // Best effort only; the next fixture setup clears driver presence.
    }
    for (const context of [customerContext, driverContext, adminContext, supportContext]) {
      if (context) await context.close().catch(() => undefined);
    }
    await browser.close();
    await prisma.$disconnect();
  }

  const failed = results.filter((row) => !row.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) process.exitCode = 1;
}

void main();
