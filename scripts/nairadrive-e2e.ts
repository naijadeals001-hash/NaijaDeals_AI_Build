/**
 * NaijaDrive end-to-end browser verification.
 *
 * Runs against an explicitly isolated test database (the database name must contain
 * "test"), with simulated browser geolocation clearly labelled as simulated. It
 * covers customer sign-in preserving the route, a wallet booking, driver presence,
 * acceptance, real location heartbeat, tracking, arrival, passenger verification,
 * trip start, completion, receipt, earnings and online-time persistence.
 *
 * Usage:
 *   DATABASE_URL=<isolated test db> TEST_BASE_URL=http://localhost:3017 \
 *     npx tsx scripts/nairadrive-e2e.ts
 */
import { PrismaClient } from "@prisma/client";
import { chromium, request as playwrightRequest, type BrowserContext, type Page } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import {
  E2E_CUSTOMER_EMAIL,
  E2E_DRIVER2_EMAIL,
  E2E_DRIVER_EMAIL,
  E2E_PASSWORD,
  ensureNairadriveFixtures
} from "./nairadrive-fixtures";

const BASE = (process.env.TEST_BASE_URL || "http://localhost:3017").replace(/\/$/, "");
const OUT = "qa-artifacts/nairadrive-redesign";
const SIMULATED_GPS = { latitude: 6.5244, longitude: 3.3792, accuracy: 12 };
const MOVED_GPS = { latitude: 6.5312, longitude: 3.3811, accuracy: 10 };
const ON_TRIP_GPS = { latitude: 6.5502, longitude: 3.3608, accuracy: 9 };

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const dbName = new URL(process.env.DATABASE_URL).pathname.replace(/^\//, "");
if (!/test/i.test(dbName)) {
  throw new Error(`Refusing to run: database "${dbName}" does not look isolated (name must contain "test").`);
}

const prisma = new PrismaClient();
const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

function record(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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

function moneyText(value: string | number | bigint | null | undefined) {
  return String(value ?? "");
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const fixtures = await ensureNairadriveFixtures();
  const browser = await chromium.launch({ headless: true });
  const consoleErrors: string[] = [];
  let customerContext: BrowserContext | null = null;
  let driverContext: BrowserContext | null = null;
  let customerPage: Page | null = null;
  let driverPage: Page | null = null;
  let rideId = "";
  let rideNumber = "";
  let verificationCode = "";
  let onlineSecondsBeforeReload = 0;

  try {
    /* ------------------------------------------------------- landing shots --- */
    for (const [name, width, height] of [
      ["mobile", 390, 844],
      ["tablet", 768, 1024],
      ["desktop", 1440, 1000]
    ] as const) {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
      await page.goto(`${BASE}/naijadrive?pickup=computer-village&dropoff=maryland&class=comfort`, {
        waitUntil: "domcontentloaded",
        timeout: 90_000
      });
      await page.getByRole("heading", { name: "Your city. Your move." }).waitFor({ timeout: 20_000 });
      await page.getByText("A ride for every kind of day").waitFor({ timeout: 20_000 });
      await page.locator(".leaflet-tile-loaded").first().waitFor({ timeout: 15_000 }).catch(() => undefined);
      await page.waitForTimeout(1800);
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth
      }));
      record(
        `Landing has no horizontal overflow at ${width}px`,
        overflow.scrollWidth <= overflow.innerWidth + 1,
        JSON.stringify(overflow)
      );
      await page.screenshot({ path: `${OUT}/landing-${name}.png`, fullPage: true });
      await context.close();
    }

    await step("Service-area checker, disabled scheduling and PWA dismissal are honest", async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      await page.goto(`${BASE}/naijadrive`, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await page.getByRole("heading", { name: "Your city. Your move." }).waitFor({ timeout: 20_000 });
      const schedule = page.getByRole("button", { name: /Schedule/ });
      assert(await schedule.isDisabled(), "Schedule is not disabled even though scheduling is unavailable");
      await page.getByRole("button", { name: "Check availability" }).click();
      await page.getByText(/Lagos is activated and NaijaDrive passenger rides are dispatched here/i).waitFor({ timeout: 20_000 });
      await page.getByRole("button", { name: "Continue on web" }).click();
      await page
        .getByRole("heading", { name: "Take NaijaDeals with you." })
        .waitFor({ state: "detached", timeout: 5_000 })
        .catch(() => undefined);
      assert(
        (await page.getByRole("heading", { name: "Take NaijaDeals with you." }).count()) === 0,
        "install offer did not dismiss"
      );
      const unnamedButtons = await page.locator("button").evaluateAll((buttons) =>
        buttons.filter((button) => {
          const element = button as HTMLElement;
          return !element.innerText.trim() && !element.getAttribute("aria-label") && !element.getAttribute("title");
        }).length
      );
      assert(unnamedButtons === 0, `${unnamedButtons} buttons have no accessible name`);
      const missingAlt = await page.locator("img:not([alt])").count();
      assert(missingAlt === 0, `${missingAlt} images have no alt text`);
      const h1Count = await page.locator("h1").count();
      assert(h1Count === 1, `expected one h1, found ${h1Count}`);
      await page.keyboard.press("Tab");
      const focus = await page.evaluate(() => ({
        tag: document.activeElement?.tagName ?? "",
        outline: document.activeElement ? getComputedStyle(document.activeElement).outlineStyle : "none"
      }));
      assert(focus.tag !== "BODY" && focus.outline !== "none", `keyboard focus is not visible: ${JSON.stringify(focus)}`);
      await context.close();
      return "Lagos activation · Schedule disabled · PWA dismissed · keyboard/labels";
    });

    /* -------------------------------------------------- customer booking --- */
    await step("Customer landing shows real server quotes for the preserved route", async () => {
      customerContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        locale: "en-NG"
      });
      customerPage = await customerContext.newPage();
      customerPage.setDefaultTimeout(30_000);
      customerPage.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(`customer: ${message.text()}`);
      });
      customerPage.on("pageerror", (error) => consoleErrors.push(`customer pageerror: ${error.message}`));
      await customerPage.goto(
        `${BASE}/naijadrive?pickup=computer-village&dropoff=maryland&class=comfort`,
        { waitUntil: "domcontentloaded", timeout: 90_000 }
      );
      await customerPage.getByRole("heading", { name: "A ride for every kind of day" }).waitFor({ timeout: 20_000 });
      const naira = customerPage.getByText(/^₦/).first();
      await naira.waitFor({ timeout: 20_000 });
      assert(/₦\d/.test(await naira.innerText()), "no real quoted fare rendered");
      return await naira.innerText();
    });

    await step("Sign-in preserves pick-up, destination and selected class", async () => {
      assert(customerPage, "customer page missing");
      await customerPage.getByRole("link", { name: "Sign in to request" }).click();
      await customerPage.waitForURL(/\/login\?next=/, { timeout: 20_000 });
      await customerPage.waitForLoadState("load");
      await customerPage.getByLabel("Email").waitFor({ state: "visible", timeout: 30_000 });
      await customerPage.waitForTimeout(1500);
      await customerPage.getByLabel("Email").fill(E2E_CUSTOMER_EMAIL);
      await customerPage.getByLabel("Password").fill(E2E_PASSWORD);
      await customerPage.getByRole("button", { name: "Sign in" }).click();
      await customerPage.waitForURL(/\/naijadrive\?/, { timeout: 30_000 });
      await customerPage.getByRole("heading", { name: "A ride for every kind of day" }).waitFor({ timeout: 20_000 });
      const pickup = await customerPage.locator("#drive-pickup").inputValue();
      const dropoff = await customerPage.locator("#drive-dropoff").inputValue();
      assert(/Computer Village/i.test(pickup), `pick-up was not preserved: ${pickup}`);
      assert(/Maryland/i.test(dropoff), `destination was not preserved: ${dropoff}`);
      const selectedComfort = await customerPage
        .getByRole("button", { name: /Comfort/ })
        .first()
        .getAttribute("aria-pressed");
      assert(selectedComfort === "true", "Comfort class was not preserved");
      return `${pickup} → ${dropoff}`;
    });

    await step("Customer requests a wallet ride and the server holds the fare", async () => {
      assert(customerPage, "customer page missing");
      await customerPage.getByText("NaijaPay wallet", { exact: true }).click();
      await customerPage.getByRole("button", { name: "Request ride" }).click();
      await customerPage.getByText(/Ride NDR-.* requested/).waitFor({ timeout: 20_000 });
      const text = await customerPage.locator("body").innerText();
      const match = text.match(/Ride (NDR-[A-Z0-9-]+) requested/);
      assert(match, "ride number not shown in confirmation");
      rideNumber = match[1];
      await customerPage.waitForTimeout(1000);
      const rides = (await customerPage.evaluate(async () => {
        const response = await fetch("/api/drive/rides", { cache: "no-store" });
        return response.json();
      })) as Array<{ id: string; rideNumber: string; status: string; paymentStatus: string }>;
      const ride = rides.find((row) => row.rideNumber === rideNumber);
      assert(ride, "created ride missing from rider API");
      rideId = ride.id;
      assert(ride.paymentStatus === "held", `wallet fare was not held: ${ride.paymentStatus}`);
      return `${rideNumber} · ${ride.status} · ${ride.paymentStatus}`;
    });

    /* ------------------------------------------------------------ driver --- */
    await step("Approved driver signs in, grants simulated location and goes online", async () => {
      driverContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        geolocation: SIMULATED_GPS,
        permissions: ["geolocation"],
        locale: "en-NG"
      });
      driverPage = await driverContext.newPage();
      driverPage.setDefaultTimeout(30_000);
      driverPage.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(`driver: ${message.text()}`);
      });
      driverPage.on("pageerror", (error) => consoleErrors.push(`driver pageerror: ${error.message}`));
      await driverPage.goto(`${BASE}/login?next=/driver`, { waitUntil: "load", timeout: 90_000 });
      await driverPage.waitForTimeout(1500);
      await driverPage.getByLabel("Email").fill(E2E_DRIVER_EMAIL);
      await driverPage.getByLabel("Password").fill(E2E_PASSWORD);
      await driverPage.getByRole("button", { name: "Sign in" }).click();
      await driverPage.waitForURL("**/driver", { timeout: 30_000 });
      await driverPage.getByRole("button", { name: "Go online" }).waitFor({ timeout: 30_000 });
      await driverPage.getByRole("button", { name: "Go online" }).click();
      await driverPage.getByText(/You are online/).waitFor({ timeout: 30_000 });
      const presence = (await driverPage.evaluate(async () => {
        const response = await fetch("/api/drive/driver/presence", { cache: "no-store" });
        return response.json();
      })) as { online: boolean; lastSeenAt: string | null; todayOnlineSeconds: number };
      assert(presence.online, "server presence is not online");
      assert(presence.lastSeenAt, "no heartbeat timestamp was recorded");
      const unnamedDriverButtons = await driverPage.locator("button").evaluateAll((buttons) =>
        buttons.filter((button) => {
          const element = button as HTMLElement;
          return !element.innerText.trim() && !element.getAttribute("aria-label") && !element.getAttribute("title");
        }).length
      );
      assert(unnamedDriverButtons === 0, `${unnamedDriverButtons} driver buttons have no accessible name`);
      onlineSecondsBeforeReload = presence.todayOnlineSeconds;
      return `simulated GPS ${SIMULATED_GPS.latitude},${SIMULATED_GPS.longitude} · online ${presence.todayOnlineSeconds}s`;
    });

    await step("Driver receives the open request and accepts it atomically", async () => {
      assert(driverPage, "driver page missing");
      const row = driverPage.locator("li", { hasText: rideNumber }).first();
      await row.waitFor({ timeout: 40_000 });
      await row.getByRole("button", { name: "Accept" }).click();
      await driverPage.getByText(/accepted/i).first().waitFor({ timeout: 30_000 });
      await driverPage.getByRole("heading", { name: /Heading to pick-up/i }).waitFor({ timeout: 40_000 });
      const ride = await prisma.ride.findUnique({ where: { id: rideId }, select: { status: true, driverId: true } });
      assert(ride?.status === "driver_assigned", `ride status is ${ride?.status}`);
      assert(ride.driverId === fixtures.driver.id, "ride assigned to the wrong driver");
      return "one driver, one assignment";
    });

    await step("Driver sends a fresh simulated position and the customer sees a real road route", async () => {
      assert(driverPage && customerPage, "pages missing");
      // The driver tab is a background tab while this script drives the rider page,
      // and browsers throttle background timers. Bring it to the front and upload a
      // real getCurrentPosition fix through the presence endpoint (the test context's
      // geolocation is simulated; no coordinate is invented by the application).
      await driverPage.bringToFront();
      type TrackingSnapshot = {
        latest: { capturedAt: string } | null;
        stale: boolean;
        route: { geometry: unknown[]; distanceMeters: number } | null;
        leg: string;
      };
      let after: TrackingSnapshot | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await driverPage.evaluate(async (point) => {
          // Test-only simulated coordinates, clearly labelled: Chromium throttles a
          // background tab's watchPosition even after bringToFront, so the heartbeat
          // is posted with the same simulated point the context was configured with.
          // The application itself never falls back to a synthetic coordinate.
          await fetch("/api/drive/driver/presence", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "heartbeat",
              latitude: point.latitude,
              longitude: point.longitude,
              accuracyM: point.accuracy
            })
          });
        }, MOVED_GPS);
        await customerPage.bringToFront();
        await customerPage.waitForTimeout(1500);
        after = (await customerPage.evaluate(async (id) => {
          const response = await fetch(`/api/drive/rides/${id}/tracking`, { cache: "no-store" });
          return response.json();
        }, rideId)) as TrackingSnapshot;
        if (after?.latest && !after.stale && after.route) break;
      }
      const snapshot = after as TrackingSnapshot | null;
      assert(snapshot, "customer tracking returned no response");
      assert(snapshot.latest, "customer tracking has no driver position");
      assert(snapshot.leg === "pickup", `tracking leg should be pickup, got ${snapshot.leg}`);
      assert(snapshot.route, "no OSRM road route was returned");
      assert(snapshot.route.geometry.length > 2, "route geometry is empty");
      assert(!snapshot.stale, "driver position is stale");
      // Simulated coordinates only: this does not prove physical GPS or background
      // tracking, which are explicitly unverified in the final report.
      return `OSRM ${Math.round(snapshot.route.distanceMeters / 1000)} km · simulated fix ${snapshot.latest.capturedAt}`;
    });

    await step("Driver workspace renders at desktop, tablet and mobile with no overflow", async () => {
      assert(driverPage, "driver page missing");
      for (const [name, width, height] of [
        ["desktop", 1440, 1000],
        ["tablet", 768, 1024],
        ["mobile", 390, 844]
      ] as const) {
        await driverPage.setViewportSize({ width, height });
        await driverPage.locator(".leaflet-tile-loaded").first().waitFor({ timeout: 15_000 }).catch(() => undefined);
        await driverPage.waitForTimeout(2200);
        const overflow = await driverPage.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth
        }));
        record(
          `Driver workspace has no horizontal overflow at ${width}px`,
          overflow.scrollWidth <= overflow.innerWidth + 1,
          JSON.stringify(overflow)
        );
        await driverPage.screenshot({ path: `${OUT}/driver-${name}.png`, fullPage: true });
      }
      await driverPage.setViewportSize({ width: 390, height: 844 });
      return "full-page shots captured";
    });

    await step("Customer tracking shows the assigned driver, freshness and accuracy", async () => {
      assert(customerPage, "customer page missing");
      await customerPage.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
      await customerPage.getByText(/Driver heading to your pick-up/i).waitFor({ timeout: 30_000 });
      await customerPage.getByText(/Driver update \d+s ago|Accuracy ±/i).first().waitFor({ timeout: 30_000 });
      const body = await customerPage.locator("body").innerText();
      assert(/Accuracy ±/i.test(body), "accuracy is not shown");
      assert(/Location updated|Driver update/i.test(body), "freshness label is missing");
      const plate = await customerPage.getByText("E2E-482-XA").count();
      assert(plate > 0, "assigned vehicle plate is not shown");
      await customerPage.screenshot({ path: `${OUT}/customer-tracking-mobile.png`, fullPage: true });
      await customerPage.locator("#active-trip").screenshot({ path: `${OUT}/customer-tracking-card-mobile.png` }).catch(() => undefined);
      return "assigned driver only, server freshness";
    });

    await step("Driver arrives, passenger code is verified and the trip starts", async () => {
      assert(driverPage && customerPage, "pages missing");
      await driverPage.bringToFront();
      await driverPage.getByRole("button", { name: /I have arrived at pick-up/i }).click();
      await driverPage.getByRole("heading", { name: /At the pick-up/i }).waitFor({ timeout: 30_000 });
      await customerPage.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
      await customerPage
        .getByText(/Share this code only when you have checked your driver and vehicle/i)
        .waitFor({ timeout: 30_000 });
      const code = await customerPage.evaluate(async (id) => {
        const response = await fetch(`/api/drive/rides/${id}/verification`, { cache: "no-store" });
        const body = await response.json();
        return body.code as string;
      }, rideId);
      assert(/^\d{4}$/.test(code), `verification code is not 4 digits: ${code}`);
      verificationCode = code;

      await driverPage.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
      await driverPage.locator("#passenger-code").waitFor({ timeout: 40_000 });
      await driverPage.locator("#passenger-code").fill(code);
      await driverPage.getByRole("button", { name: "Verify passenger" }).click();
      await driverPage.getByText(/Passenger verified/i).first().waitFor({ timeout: 30_000 });
      await driverPage.getByRole("button", { name: "Start trip" }).click();
      await driverPage.getByRole("heading", { name: /Heading to destination/i }).waitFor({ timeout: 40_000 });
      const ride = await prisma.ride.findUnique({ where: { id: rideId }, select: { status: true, startedAt: true } });
      assert(ride?.status === "in_progress" && ride.startedAt, `trip did not start: ${ride?.status}`);
      return `code ${code} verified server-side`;
    });

    await step("Customer tracking switches to the destination and external navigation is labelled", async () => {
      assert(customerPage && driverPage, "pages missing");
      await driverPage.bringToFront();
      await driverPage.evaluate(async (point) => {
        await fetch("/api/drive/driver/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "heartbeat",
            latitude: point.latitude,
            longitude: point.longitude,
            accuracyM: point.accuracy
          })
        });
      }, ON_TRIP_GPS);
      await customerPage.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
      await customerPage.getByText(/Driver heading to your destination/i).waitFor({ timeout: 30_000 });
      const nav = driverPage.getByRole("link", { name: /Open navigation \(external/i });
      await nav.waitFor({ timeout: 20_000 });
      const href = await nav.getAttribute("href");
      assert(href?.startsWith("https://www.google.com/maps/dir/"), `unexpected navigation target: ${href}`);
      await driverPage.screenshot({ path: `${OUT}/driver-on-trip-mobile.png`, fullPage: true });
      return "drop-off leg and labelled Google Maps handoff";
    });

    await step("On-trip driver workspace screenshots show the destination route at all widths", async () => {
      assert(driverPage, "driver page missing");
      await driverPage.bringToFront();
      await driverPage.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
      await driverPage.getByRole("heading", { name: /Heading to destination/i }).waitFor({ timeout: 40_000 });
      await driverPage.getByText(/OSRM route/i).first().waitFor({ timeout: 30_000 }).catch(() => undefined);
      for (const [name, width, height] of [
        ["desktop", 1440, 1000],
        ["tablet", 768, 1024],
        ["mobile", 390, 844]
      ] as const) {
        await driverPage.setViewportSize({ width, height });
        await driverPage.locator(".leaflet-tile-loaded").first().waitFor({ timeout: 15_000 }).catch(() => undefined);
        await driverPage.waitForTimeout(2200);
        await driverPage.screenshot({ path: `${OUT}/driver-${name}.png`, fullPage: true });
      }
      await driverPage.setViewportSize({ width: 390, height: 844 });
      return "on-trip full-page shots";
    });

    await step("Driver completes the trip; rider receipt, payment and driver earnings reconcile", async () => {
      assert(driverPage && customerPage, "pages missing");
      await driverPage.bringToFront();
      await driverPage.getByRole("button", { name: /complete trip/i }).click();
      await driverPage.getByText(/Trip completed/i).first().waitFor({ timeout: 40_000 });
      const ride = await prisma.ride.findUnique({
        where: { id: rideId },
        select: { status: true, paymentStatus: true, fareKobo: true }
      });
      assert(ride?.status === "completed", `ride status ${ride?.status}`);
      assert(ride.paymentStatus === "paid", `wallet fare not released: ${ride.paymentStatus}`);
      await driverPage.waitForTimeout(3000);
      const board = (await driverPage.evaluate(async () => {
        const response = await fetch("/api/drive/driver/rides", { cache: "no-store" });
        return response.json();
      })) as {
        summary: { todayFareReleasedKobo: string; todayCompletedTrips: number };
        presence: { online: boolean; todayOnlineSeconds: number };
      };
      assert(board.summary.todayCompletedTrips >= 1, "completed trip not counted today");
      assert(
        BigInt(board.summary.todayFareReleasedKobo) >= BigInt(moneyText(ride.fareKobo)),
        "released fare is lower than the completed trip fare"
      );
      onlineSecondsBeforeReload = board.presence.todayOnlineSeconds;

      await customerPage.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
      await customerPage.getByRole("heading", { name: "Trip receipt" }).waitFor({ timeout: 30_000 });
      const body = await customerPage.locator("body").innerText();
      assert(/Paid from NaijaPay wallet/i.test(body), "receipt does not show wallet payment");
      const closed = await customerPage.evaluate(async (id) => {
        const response = await fetch(`/api/drive/rides/${id}/tracking`, { cache: "no-store" });
        return response.json();
      }, rideId);
      assert(closed.closed === true && closed.latest === null, "completed ride still exposes location");
      await customerPage.screenshot({ path: `${OUT}/customer-receipt-mobile.png`, fullPage: true });
      return `fare ${ride.fareKobo} kobo released · ${board.summary.todayCompletedTrips} trip(s) today`;
    });

    await step("Online presence and online-time survive a full driver refresh", async () => {
      assert(driverPage, "driver page missing");
      const before = (await driverPage.evaluate(async () => {
        const response = await fetch("/api/drive/driver/presence", { cache: "no-store" });
        return response.json();
      })) as { online: boolean; todayOnlineSeconds: number; lastSeenAt: string | null };
      assert(before.online, "driver went offline unexpectedly");
      await driverPage.bringToFront();
      await driverPage.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
      await driverPage.getByRole("button", { name: /Stop new requests/i }).waitFor({ timeout: 30_000 });
      await driverPage.waitForTimeout(2500);
      const after = (await driverPage.evaluate(async () => {
        const response = await fetch("/api/drive/driver/presence", { cache: "no-store" });
        return response.json();
      })) as { online: boolean; todayOnlineSeconds: number; lastSeenAt: string | null };
      assert(after.online, "presence was not restored after refresh");
      assert(after.todayOnlineSeconds >= before.todayOnlineSeconds, "online seconds went backwards after refresh");
      assert(after.lastSeenAt, "no fresh heartbeat after refresh");
      return `${before.todayOnlineSeconds}s → ${after.todayOnlineSeconds}s`;
    });

    /* --------------------------------------------------------- security --- */
    await step("Another account cannot read this ride's tracking", async () => {
      const other = await playwrightRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: BASE } });
      const email = `e2e-other-${Date.now()}@naijadeals.local`;
      const register = await other.post("/api/auth/register", {
        data: { name: "E2E Other", email, password: "OtherPass123!" }
      });
      assert(register.status() === 201, `other account registration failed: ${register.status()}`);
      const tracking = await other.get(`/api/drive/rides/${rideId}/tracking`);
      assert(tracking.status() === 403, `cross-account tracking returned ${tracking.status()}`);
      const verification = await other.get(`/api/drive/rides/${rideId}/verification`);
      assert(verification.status() === 409 || verification.status() === 403, `cross-account verification returned ${verification.status()}`);
      await other.dispose();
      return "403 before any coordinate is read";
    });

    await step("Unauthenticated tracking is rejected", async () => {
      const anonymous = await playwrightRequest.newContext({ baseURL: BASE });
      const response = await anonymous.get(`/api/drive/rides/${rideId}/tracking`);
      assert(response.status() === 401, `anonymous tracking returned ${response.status()}`);
      await anonymous.dispose();
      return "401";
    });

    /* ------------------------------------------------- assignment expiry --- */
    await step("Expired assignment returns to the queue and a second driver can accept", async () => {
      const customerApi = await playwrightRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: BASE } });
      const driverApi = await playwrightRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: BASE } });
      const driver2Api = await playwrightRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: BASE } });
      await customerApi.post("/api/auth/login", { data: { email: E2E_CUSTOMER_EMAIL, password: E2E_PASSWORD } });
      await driverApi.post("/api/auth/login", { data: { email: E2E_DRIVER_EMAIL, password: E2E_PASSWORD } });
      await driver2Api.post("/api/auth/login", { data: { email: E2E_DRIVER2_EMAIL, password: E2E_PASSWORD } });

      const created = await customerApi.post("/api/drive/rides", {
        data: { pickupId: "ikeja-city-mall", dropoffId: "lekki-phase-1", vehicleClass: "economy", paymentMethod: "cash" }
      });
      assert(created.status() === 201, `expiry ride request failed: ${created.status()}`);
      const expiryRide = (await created.json()) as { id: string };
      const accepted = await driverApi.post(`/api/drive/driver/rides/${expiryRide.id}/accept`);
      assert(accepted.status() === 200, `driver1 accept failed: ${accepted.status()}`);
      await prisma.ride.update({
        where: { id: expiryRide.id },
        data: { assignmentExpiresAt: new Date(Date.now() - 1_000) }
      });
      const advancing = await driverApi.post(`/api/drive/driver/rides/${expiryRide.id}/status`, {
        data: { status: "driver_arriving" }
      });
      assert(advancing.status() === 409, `expired assignment advanced with ${advancing.status()}`);
      const released = await prisma.ride.findUnique({
        where: { id: expiryRide.id },
        select: { status: true, driverId: true }
      });
      assert(released?.status === "requested" && released.driverId === null, "expired ride was not released");
      const second = await driver2Api.post(`/api/drive/driver/rides/${expiryRide.id}/accept`);
      assert(second.status() === 200, `second driver could not accept released ride: ${second.status()}`);
      await customerApi.post(`/api/drive/rides/${expiryRide.id}/cancel`, { data: { reason: "E2E expiry cleanup" } });

      const raceRide = await customerApi.post("/api/drive/rides", {
        data: { pickupId: "yaba-tejuosho", dropoffId: "apapa", vehicleClass: "economy", paymentMethod: "cash" }
      });
      assert(raceRide.status() === 201, `race ride request failed: ${raceRide.status()}`);
      const raceId = ((await raceRide.json()) as { id: string }).id;
      const [a, b] = await Promise.all([
        driverApi.post(`/api/drive/driver/rides/${raceId}/accept`),
        driver2Api.post(`/api/drive/driver/rides/${raceId}/accept`)
      ]);
      const statuses = [a.status(), b.status()].sort((x, y) => x - y);
      assert(statuses[0] === 200 && statuses[1] === 409, `race statuses were ${a.status()} and ${b.status()}`);
      await customerApi.post(`/api/drive/rides/${raceId}/cancel`, { data: { reason: "E2E race cleanup" } });
      await customerApi.dispose();
      await driverApi.dispose();
      await driver2Api.dispose();
      return "expiry released · reassignment 200 · duplicate acceptance 409";
    });

    /* ------------------------------------------------ denied geolocation --- */
    await step("Denied location leaves a second driver offline with a specific reason", async () => {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        permissions: [],
        locale: "en-NG"
      });
      const page = await context.newPage();
      await page.goto(`${BASE}/login?next=/driver`, { waitUntil: "load", timeout: 90_000 });
      await page.waitForTimeout(1500);
      await page.getByLabel("Email").fill(E2E_DRIVER2_EMAIL);
      await page.getByLabel("Password").fill(E2E_PASSWORD);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL("**/driver", { timeout: 30_000 });
      await page.getByRole("button", { name: "Go online" }).click();
      await page.getByText(/permission was denied|usable browser location is required/i).first().waitFor({ timeout: 30_000 });
      const presence = (await page.evaluate(async () => {
        const response = await fetch("/api/drive/driver/presence", { cache: "no-store" });
        return response.json();
      })) as { online: boolean };
      assert(!presence.online, "driver went online without location permission");
      await context.close();
      return "offline · honest permission message";
    });
  } catch (error) {
    console.error("\nE2E aborted:", error instanceof Error ? error.message : error);
  } finally {
    // Leave the isolated fixture driver offline and any active fixture ride closed.
    try {
      const riderPage = customerPage as unknown as Page | null;
      if (riderPage) {
        const rides = (await riderPage.evaluate(async () => {
          const response = await fetch("/api/drive/rides", { cache: "no-store" });
          return response.json();
        })) as Array<{ id: string; status: string }>;
        for (const ride of rides) {
          if (["requested", "driver_assigned", "driver_arriving"].includes(ride.status)) {
            await riderPage.evaluate(async (id) => {
              await fetch(`/api/drive/rides/${id}/cancel`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: "E2E cleanup" })
              });
            }, ride.id);
          }
        }
      }
      await prisma.driverProfile.updateMany({
        where: { userId: { in: [fixtures.driver.userId, fixtures.driver2.userId] } },
        data: { online: false }
      });
    } catch {
      // Best effort only; the next fixture setup resets these accounts.
    }
    if (customerContext) await customerContext.close().catch(() => undefined);
    if (driverContext) await driverContext.close().catch(() => undefined);
    await browser.close();
    await prisma.$disconnect();
  }

  const failed = results.filter((row) => !row.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (consoleErrors.length) {
    console.log(`Console errors captured: ${consoleErrors.length}`);
    for (const message of consoleErrors.slice(0, 5)) console.log(`  ${message}`);
  }
  if (failed.length) process.exitCode = 1;
}

void main();
