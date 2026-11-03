import { chromium } from "playwright-core";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3101";
const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

let passed = 0;
let failed = 0;
function check(condition, label) {
  if (condition) { passed += 1; console.log("PASS  " + label); }
  else { failed += 1; console.log("FAIL  " + label); }
}

async function login(browser, email, password, next) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE + "/login?next=" + next, { waitUntil: "networkidle" });
  await page.fill("input[type=email]", email);
  await page.fill("input[type=password]", password);
  await Promise.all([page.waitForURL((url) => !url.pathname.startsWith("/login")), page.click("button[type=submit]")]);
  return page;
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
try {
  const unique = Date.now().toString(36);
  const email = "lifecycle-" + unique + "@example.com";
  const applicant = await login(browser, "customer@naijadeals.local", "CustomerPass123!", "/");
  const register = await applicant.evaluate(async ({ email }) => (await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Lifecycle Applicant", email, password: "ApplicantPass123!", phone: "08050000000" }) })).status, { email });
  check(register === 201, "applicant registered");
  const application = await applicant.evaluate(async () => {
    const res = await fetch("/api/account/seller-application", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessName: "Lifecycle Stall", market: "Yaba", countryCode: "NG", pickupAddress: "1 Lifecycle Road, Yaba", phone: "08050000000", category: "Fashion" }) });
    return res.status;
  });
  check(application === 201, "application submitted");

  const admin = await login(browser, "superadmin@naijadeals.local", "SuperAdminPass123!", "/admin");
  const rejection = await admin.evaluate(async ({ email }) => {
    const apps = await (await fetch("/api/admin/applications")).json();
    const list = Array.isArray(apps) ? apps : apps.applications ?? [];
    const app = list.find((row) => row.user?.email === email);
    if (!app) return { status: 0 };
    const res = await fetch("/api/admin/applications/" + app.id, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: "reject", note: "Lifecycle regression" }) });
    return { status: res.status };
  }, { email });
  check(rejection.status === 200, "admin rejected application");
  const denied = await applicant.evaluate(async () => (await fetch("/api/seller/overview")).status);
  check(denied === 403, "rejected applicant denied seller API");
  await applicant.goto(BASE + "/seller", { waitUntil: "networkidle" });
  check(new URL(applicant.url()).pathname === "/sell", "rejected applicant redirected to /sell");
  const applicantNotifications = await applicant.evaluate(async () => {
    const body = await (await fetch("/api/partner/notifications")).json();
    return body.notifications?.[0]?.kind ?? null;
  });
  check(applicantNotifications === "application_rejected", "applicant notified of rejection");

  const seller = await login(browser, "seller@naijadeals.local", "SellerPass123!", "/seller");
  const vendorId = await seller.evaluate(async () => (await (await fetch("/api/seller/overview")).json()).vendor.id);
  await admin.evaluate(async (id) => {
    await fetch("/api/admin/vendors/" + id + "/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "SUSPENDED", reason: "Lifecycle regression" }) });
  }, vendorId);
  const sellerNotification = await seller.evaluate(async () => (await (await fetch("/api/partner/notifications")).json()).notifications?.[0]?.kind ?? null);
  check(sellerNotification === "vendor_suspended", "seller notified of suspension");
  const markRead = await seller.evaluate(async () => {
    await fetch("/api/partner/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markAllRead: true }) });
    return (await (await fetch("/api/partner/notifications")).json()).unread;
  });
  check(markRead === 0, "unread count cleared");
  await admin.evaluate(async (id) => {
    await fetch("/api/admin/vendors/" + id + "/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "VERIFIED" }) });
  }, vendorId);

  const courier = await login(browser, "courier@naijadeals.local", "CourierPass123!", "/courier");
  const courierId = await admin.evaluate(async () => {
    const list = await (await fetch("/api/admin/couriers")).json();
    return (Array.isArray(list) ? list : list.couriers ?? [])[0]?.id;
  });
  await admin.evaluate(async (id) => {
    await fetch("/api/admin/couriers/" + id + "/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: false, reason: "Lifecycle regression" }) });
  }, courierId);
  const courierNotification = await courier.evaluate(async () => (await (await fetch("/api/partner/notifications")).json()).notifications?.[0]?.kind ?? null);
  check(courierNotification === "courier_suspended", "courier notified of suspension");
  await admin.evaluate(async (id) => {
    await fetch("/api/admin/couriers/" + id + "/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: true }) });
  }, courierId);
} finally {
  await browser.close();
}

console.log("\nPartner lifecycle verification: " + passed + "/" + (passed + failed) + " passed");
if (failed > 0) process.exit(1);
