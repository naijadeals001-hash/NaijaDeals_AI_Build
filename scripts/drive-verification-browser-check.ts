/**
 * Browser check for the bounded pickup-verification recovery states.
 *
 * Requires a preview built from the current working tree and pointed at the
 * isolated acceptance database. It creates its own labelled fixtures, checks the
 * rider recovery notice, the driver's disabled start, and the Control Center
 * support queue/action, then removes every fixture and its audit trail.
 *
 * Usage:
 *   DATABASE_URL=<naijadeals_wallet_acceptance URL> TEST_BASE_URL=http://localhost:3037 \
 *     npx tsx scripts/drive-verification-browser-check.ts
 *
 * The preview server must be started with the same
 * DRIVE_PICKUP_VERIFICATION_KEY_VERSION / DRIVE_PICKUP_VERIFICATION_KEY_V<version>
 * pair this script generates below. The variables here cover only the script's
 * direct service calls; they are never written to the database.
 */
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type Page } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { hashPassword } from "../lib/auth/password";

process.env.DRIVE_PICKUP_VERIFICATION_KEY_VERSION = "1";
process.env.DRIVE_PICKUP_VERIFICATION_KEY_V1 = `test-browser-pickup-${randomBytes(16).toString("hex")}`;

const BASE = (process.env.TEST_BASE_URL ?? "").replace(/\/$/, "");
const DB = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid").pathname.replace(/^\//, "");
const RUN = `drive-browser-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const PASSWORD = "DriveBrowserCheck123!";
const OUT = path.join("qa-artifacts", "drive-verification-browser");

if (!BASE) throw new Error("TEST_BASE_URL is required (for example http://localhost:3037).");
if (DB !== "naijadeals_wallet_acceptance") {
  throw new Error(`Refusing to run against "${DB}"; expected the isolated naijadeals_wallet_acceptance database.`);
}

const prisma = new PrismaClient();
let browser: Browser | null = null;
const userIds: string[] = [];
const driverProfileIds: string[] = [];
const rideIds: string[] = [];
let createdAdminRole = false;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function login(page: Page, email: string, password: string, next: string, expected: RegExp) {
  await page.goto(`${BASE}/login?next=${encodeURIComponent(next)}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000
  });
  // The form is a client component; wait for hydration before typing, otherwise
  // the click can happen before React has attached the submit handler.
  await page.getByRole("button", { name: "Sign in" }).waitFor();
  await page.waitForTimeout(1200);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  try {
    await page.waitForURL(expected, { timeout: 45_000 });
  } catch {
    const alerts = await page.locator("[role=alert]").allInnerTexts().catch(() => []);
    throw new Error(`Login did not reach ${expected}: url=${page.url()} alerts=${alerts.join(" | ")}`);
  }
  await page.waitForLoadState("load");
}

async function screenshot(page: Page, label: string, width: number) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
  await page.waitForTimeout(300);
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth
  }));
  assert(metrics.scrollWidth <= metrics.innerWidth + 1, `${label} overflows at ${width}: ${JSON.stringify(metrics)}`);
  await page.screenshot({ path: path.join(OUT, `${label}-${width}.png`), fullPage: true });
}

async function cleanup() {
  if (browser) await browser.close().catch(() => undefined);
  if (rideIds.length) {
    const notificationIds = (
      await prisma.notification.findMany({
        where: { OR: [{ entityType: "Ride", entityId: { in: rideIds } }, { userId: { in: userIds } }] },
        select: { id: true }
      })
    ).map((row) => row.id);
    if (notificationIds.length) {
      await prisma.notificationAttempt.deleteMany({ where: { notificationId: { in: notificationIds } } });
      await prisma.notification.deleteMany({ where: { id: { in: notificationIds } } });
    }
  }
  if (userIds.length) {
    await prisma.partnerNotification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  }
  await prisma.rideVerification.deleteMany({ where: { rideId: { in: rideIds } } });
  await prisma.rideEvent.deleteMany({ where: { rideId: { in: rideIds } } });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: rideIds } }] }
  });
  await prisma.systemEvent.deleteMany({
    where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: rideIds } }] }
  });
  await prisma.ride.deleteMany({ where: { id: { in: rideIds } } });
  await prisma.driverProfile.deleteMany({ where: { id: { in: driverProfileIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  if (createdAdminRole) {
    await prisma.role.deleteMany({ where: { name: "admin", users: { none: {} } } });
  }
  await prisma.$disconnect();
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const drive = await import("../lib/services/core/drive.service");
  const passwordHash = await hashPassword(PASSWORD);

  const existingRole = await prisma.role.findUnique({ where: { name: "admin" } });
  const adminRole =
    existingRole ??
    (await prisma.role.create({ data: { name: "admin", description: "Control Center administrator" } }));
  createdAdminRole = !existingRole;

  async function user(label: string, actorType: "ADMIN" | "CUSTOMER" | "DRIVER", admin = false) {
    const created = await prisma.user.create({
      data: {
        email: `${RUN}-${label}@naijadeals.local`,
        name: `Browser check ${label}`,
        actorType,
        passwordHash,
        verifiedAt: new Date(),
        ...(admin ? { roles: { create: { roleId: adminRole.id } } } : {})
      }
    });
    userIds.push(created.id);
    return created;
  }

  async function driver(label: string) {
    const created = await user(label, "DRIVER");
    const profile = await prisma.driverProfile.create({
      data: {
        userId: created.id,
        licenseNumber: `BROWSER-${label}`.slice(0, 40),
        status: "approved",
        active: true,
        vehicleClass: "economy",
        vehicleMake: "Toyota",
        vehicleModel: "Corolla",
        vehiclePlate: `BRW-${label.slice(-4).toUpperCase()}`,
        serviceZone: "Lagos"
      }
    });
    driverProfileIds.push(profile.id);
    return { user: created, profile };
  }

  const admin = await user("admin", "ADMIN", true);
  const recoveryRider = await user("rider-recovery", "CUSTOMER");
  const legacyRider = await user("rider-legacy", "CUSTOMER");
  const recoveryDriver = await driver("recovery");
  const legacyDriver = await driver("legacy");

  const recoveryRide = await drive.requestRide({
    riderId: recoveryRider.id,
    pickupId: "computer-village",
    dropoffId: "maryland",
    vehicleClassId: "economy",
    paymentMethod: "cash"
  });
  rideIds.push(recoveryRide.id);
  await drive.acceptRide({ userId: recoveryDriver.user.id, rideId: recoveryRide.id });
  await prisma.rideVerification.delete({ where: { rideId: recoveryRide.id } });
  await drive.driverUpdateRideStatus({
    userId: recoveryDriver.user.id,
    rideId: recoveryRide.id,
    status: "driver_arriving"
  });

  const legacyRide = await drive.requestRide({
    riderId: legacyRider.id,
    pickupId: "yaba-tejuosho",
    dropoffId: "lekki-phase-1",
    vehicleClassId: "economy",
    paymentMethod: "cash"
  });
  rideIds.push(legacyRide.id);
  await drive.acceptRide({ userId: legacyDriver.user.id, rideId: legacyRide.id });
  await prisma.rideVerification.delete({ where: { rideId: legacyRide.id } });
  await prisma.ride.update({
    where: { id: legacyRide.id },
    data: { pickupVerificationLegacyAt: new Date(Date.now() - 60 * 60 * 1000) }
  });

  browser = await chromium.launch({ headless: true });
  console.log("Fixtures ready; browser launched");

  const riderContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-NG" });
  const riderPage = await riderContext.newPage();
  await login(riderPage, recoveryRider.email, PASSWORD, "/naijadrive", /\/naijadrive/);
  await riderPage
    .getByText(/protected pickup-code record is missing for this trip/i)
    .waitFor({ timeout: 30_000 });
  await riderPage.getByRole("link", { name: "Contact NaijaDrive support" }).waitFor();
  await screenshot(riderPage, "rider-recovery", 390);
  console.log("PASS rider recovery notice");

  const driverContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-NG" });
  const driverPage = await driverContext.newPage();
  await login(driverPage, recoveryDriver.user.email, PASSWORD, "/driver", /\/driver$/);
  await driverPage
    .getByText(/protected pickup-code record is missing for this assignment/i)
    .waitFor({ timeout: 30_000 });
  const startButton = driverPage.getByRole("button", { name: "Start trip" });
  await startButton.waitFor();
  assert(await startButton.isDisabled(), "the driver's Start trip control is not disabled for a missing record");
  await screenshot(driverPage, "driver-recovery", 390);
  console.log("PASS driver recovery notice and disabled start");

  const adminContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-NG" });
  const adminPage = await adminContext.newPage();
  await login(adminPage, admin.email, PASSWORD, "/admin?tab=rides", /\/admin/);
  const support = adminPage.locator("section[aria-labelledby='drive-verification-heading']");
  await support.getByRole("heading", { name: "Pickup-code support" }).waitFor({ timeout: 30_000 });
  const recoveryRow = support.locator("li", { hasText: recoveryRide.rideNumber }).first();
  const legacyRow = support.locator("li", { hasText: legacyRide.rideNumber }).first();
  await recoveryRow.getByText("Missing record · recovery required").waitFor();
  await recoveryRow.getByRole("button", { name: "Issue recovery code" }).waitFor();
  await legacyRow.getByText("Pre-enforcement assignment · no code").waitFor();
  await legacyRow.getByRole("button", { name: "Issue pickup code" }).waitFor();
  await screenshot(adminPage, "admin-queue", 390);
  await screenshot(adminPage, "admin-queue", 768);
  await screenshot(adminPage, "admin-queue", 1440);
  console.log("PASS Control Center queue states and responsive layouts");

  await recoveryRow
    .getByLabel(/Reason for this recovery action/i)
    .fill("Browser check: protected record missing after assignment");
  await recoveryRow.getByRole("button", { name: "Issue recovery code" }).click();
  await adminPage
    .getByText(new RegExp(`Pickup code reset for ${recoveryRide.rideNumber}`))
    .waitFor({ timeout: 20_000 });
  const audit = await prisma.auditLog.findFirstOrThrow({
    where: { action: "ride.verification_support_reset", entityId: recoveryRide.id }
  });
  const metadata = audit.metadata as Record<string, unknown>;
  assert(metadata.authorizationBasis === "support_recovery", "support recovery audit basis is missing");
  assert(metadata.previousState === "missing_record", "support recovery audit did not record the previous state");

  const riderReload = await riderContext.newPage();
  await riderReload.goto(`${BASE}/naijadrive`, { waitUntil: "domcontentloaded" });
  await riderReload.getByText(/Share this code only when you have checked your driver and vehicle/i).waitFor({
    timeout: 30_000
  });
  await screenshot(riderReload, "rider-recovered-code", 390);

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        database: DB,
        baseUrl: BASE,
        checks: [
          "rider recovery notice and support link",
          "driver recovery notice and disabled start",
          "Control Center recovery and pre-enforcement rows",
          "audited support recovery and rider code after reset",
          "no horizontal overflow at 390/768/1440"
        ],
        screenshots: OUT
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanup();
    } catch (error) {
      console.error("cleanup failed", error);
      process.exitCode = 1;
    }
    // Force exit: Playwright/Prisma child handles can otherwise keep the process
    // alive after the fixtures are gone, which hides the real result.
    process.exit(process.exitCode ?? 0);
  });
