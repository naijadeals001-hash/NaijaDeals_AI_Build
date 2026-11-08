/**
 * Real-browser acceptance test of the NaijaGigs customer + professional
 * journeys. Creates an isolated fixture professional, verifies it through the
 * admin API, then drives the UI: discovery → service detail → booking →
 * accept (pro API) → pay → start → submit → approve → review.
 *
 * Usage: BASE_URL=http://localhost:3015 node scripts/gigs-journey-browser.cjs
 * Cleanup is printed at the end (gigs-e2e-cleanup.cjs <stamp>).
 */
const { chromium } = require("playwright-core");
const path = require("node:path");
const fs = require("node:fs");

const BASE = process.env.BASE_URL ?? "http://localhost:3015";
const outDir = path.join(process.cwd(), "qa-artifacts", "gigs-journey");
fs.mkdirSync(outDir, { recursive: true });
const STAMP = Date.now().toString(36);

let passed = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) {
    passed += 1;
    console.log(`  PASS ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function apiAs(context, method, url, body) {
  const res = await context.request.fetch(`${BASE}${url}`, {
    method,
    headers: { Origin: BASE, ...(body ? { "Content-Type": "application/json" } : {}) },
    data: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status(), body: await res.json().catch(() => null) };
}

async function login(context, email, password) {
  const res = await apiAs(context, "POST", "/api/auth/login", { email, password });
  return res.status;
}

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });

  // --- Fixture professional (isolated, marked by email pattern) ------------
  const proContext = await browser.newContext();
  const proEmail = `gigspro-${STAMP}@test.local`;
  await apiAs(proContext, "POST", "/api/auth/register", { name: "Journey Fixture Pro", email: proEmail, password: "JourneyPass123!", phone: "08031234567" });
  await login(proContext, proEmail, "JourneyPass123!");
  const cats = (await apiAs(proContext, "GET", "/api/gigs/categories")).body.categories;
  const electrical = cats.find((c) => c.slug === "electrical-solar");
  const apply = await apiAs(proContext, "POST", "/api/gigs/pro", {
    displayName: `Journey Fixture ${STAMP}`,
    headline: "Isolated acceptance-test professional",
    bio: "Created by scripts/gigs-journey-browser.cjs for acceptance testing. Removed after the run.",
    countryCode: "NG",
    state: "Lagos",
    city: "Ikeja",
    serviceModes: ["LOCAL"],
    categoryIds: [electrical.id],
    languages: ["English"],
    yearsExperience: 4
  });
  const profileId = apply.body?.id;
  check("fixture professional applies", apply.status === 201 && Boolean(profileId), `status ${apply.status}`);

  const adminContext = await browser.newContext();
  await login(adminContext, "admin@naijadeals.local", "AdminPass123!");
  const verify = await apiAs(adminContext, "POST", `/api/admin/gigs/professionals/${profileId}`, { action: "VERIFY", note: "Journey acceptance fixture" });
  check("admin verifies through Control Center API", verify.status === 200 && verify.body?.status === "VERIFIED", `status ${verify.status}`);

  const listing = await apiAs(proContext, "POST", "/api/gigs/services", {
    categoryId: electrical.id,
    title: `Journey Fixture Wiring ${STAMP}`,
    summary: "Isolated acceptance-test service.",
    description: "Created by the journey test and removed afterwards.",
    mode: "LOCAL",
    pricingType: "FIXED",
    priceKobo: 50000,
    countryCode: "NG",
    state: "Lagos",
    city: "Ikeja",
    imageUrl: "/generated/gigs/gigs-spot-wiring.png"
  });
  check("verified pro publishes service", listing.status === 201, `status ${listing.status}`);
  const slug = listing.body?.slug;

  // --- Customer journey in the browser ------------------------------------
  const customer = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await customer.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("401")) consoleErrors.push(m.text().slice(0, 150));
  });
  await login(customer, "customer@naijadeals.local", "CustomerPass123!");

  await page.goto(`${BASE}/naijagigs/services?q=${STAMP}`, { waitUntil: "networkidle" });
  const foundCard = await page.locator(`a[href="/naijagigs/services/${slug}"]`).count();
  check("search finds the new service in the UI", foundCard > 0, `cards ${foundCard}`);

  await page.goto(`${BASE}/naijagigs/services?category=electrical-solar`, { waitUntil: "networkidle" });
  const catHrefs = await page.locator("a[href^='/naijagigs/services?category=']").evaluateAll((els) => els.filter((e) => e.getAttribute("aria-current") === "page").map((e) => e.getAttribute("href")));
  check("active category chip reflects the filter", catHrefs.includes("/naijagigs/services?category=electrical-solar"), JSON.stringify(catHrefs));

  await page.goto(`${BASE}/naijagigs/services/${slug}`, { waitUntil: "networkidle" });
  check("service detail renders title", (await page.locator("h1").first().innerText()).includes("Fixture Wiring"), "");
  await page.screenshot({ path: path.join(outDir, "detail.png"), fullPage: false });

  await page.locator("textarea").first().fill("Please install two lighting points in the living room.");
  await page.locator("input[type='date']").fill("2026-12-15");
  await page.getByRole("button", { name: /Request booking/i }).click();
  await page.waitForTimeout(1500);
  const successVisible = await page.getByText("Booking request sent").count();
  check("booking request submitted from the UI", successVisible > 0);
  const referenceMatch = await page.getByText(/Reference NG-/).first().innerText().catch(() => "");
  const reference = referenceMatch.replace("Reference ", "").trim();
  check("booking returns a real reference", reference.startsWith("NG-"), reference);

  const bookingsAfter = await apiAs(customer, "GET", "/api/gigs/bookings");
  const booking = (Array.isArray(bookingsAfter.body) ? bookingsAfter.body : bookingsAfter.body.bookings).find((b) => b.reference === reference);
  check("booking persisted in the database", Boolean(booking) && booking.status === "REQUESTED", JSON.stringify(booking?.status));

  // Professional accepts, customer pays from the wallets UI
  const accept = await apiAs(proContext, "POST", `/api/gigs/bookings/${booking.id}/action`, { action: "accept" });
  check("professional accepts", accept.status === 200 && accept.body?.status === "ACCEPTED", `status ${accept.status}`);

  await page.goto(`${BASE}/naijagigs/bookings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Pay from wallet" }).first().click();
  await page.waitForTimeout(1800);
  const paidNotice = await page.getByText(/escrow/i).count();
  check("customer pays into escrow from the UI", paidNotice > 0);
  const funded = (await apiAs(customer, "GET", "/api/gigs/bookings")).body.find((b) => b.reference === reference);
  check("payment held in escrow", funded?.paymentStatus === "HELD", funded?.paymentStatus);

  const start = await apiAs(proContext, "POST", `/api/gigs/bookings/${booking.id}/action`, { action: "start" });
  check("work starts after payment", start.status === 200 && start.body?.status === "IN_PROGRESS", `status ${start.status}`);
  const submit = await apiAs(proContext, "POST", `/api/gigs/bookings/${booking.id}/action`, { action: "submit" });
  check("professional submits completion", submit.status === 200 && submit.body?.status === "SUBMITTED", `status ${submit.status}`);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Confirm completion" }).first().click();
  await page.waitForTimeout(1800);
  const completed = (await apiAs(customer, "GET", "/api/gigs/bookings")).body.find((b) => b.reference === reference);
  check("customer approves completion in the UI", completed?.status === "COMPLETED" && completed?.paymentStatus === "RELEASED", `${completed?.status}/${completed?.paymentStatus}`);

  await page.getByRole("button", { name: "Leave a review" }).first().click();
  await page.locator("textarea").last().fill("Excellent work, arrived on time and cleaned up afterwards.");
  await page.getByRole("button", { name: "Submit review" }).click();
  await page.waitForTimeout(1500);
  const reviewed = (await apiAs(customer, "GET", "/api/gigs/bookings")).body.find((b) => b.reference === reference);
  check("review submitted after completion", Boolean(reviewed?.review), JSON.stringify(reviewed?.review));
  await page.screenshot({ path: path.join(outDir, "bookings-completed.png"), fullPage: true });

  // Professional earnings reflect the release
  const proOverview = await apiAs(proContext, "GET", "/api/gigs/pro");
  // Platform commission is 12% per ProfessionalProfile.commissionBps default:
  // ₦500 gross → ₦60 commission → ₦440 net.
  const gross = Number(proOverview.body?.overview?.metrics?.grossKobo ?? 0);
  const net = Number(proOverview.body?.overview?.metrics?.netKobo ?? 0);
  check("professional earnings net of 12% commission", gross === 50000 && net === 44000, `gross ${gross} net ${net}`);
  await proContext.close();

  // Demo listing cannot be booked
  const demoPages = await browser.newContext();
  const demoPage = await demoPages.newPage();
  await login(demoPages, "customer@naijadeals.local", "CustomerPass123!");
  await demoPage.goto(`${BASE}/naijagigs/services/demo-electrical-wiring-lighting`, { waitUntil: "networkidle" });
  check("demo listing shows demonstration notice", (await demoPage.getByText("Demonstration listing").count()) > 0);
  const demoBook = await apiAs(demoPages, "POST", "/api/gigs/bookings", { listingId: (await apiAs(demoPages, "GET", "/api/gigs/services/demo-electrical-wiring-lighting")).body.listing.id, description: "attempt", amountKobo: 100 });
  check("demo listing booking rejected server-side", demoBook.status === 409, `status ${demoBook.status}`);
  await demoPages.close();

  check("no unexpected console errors", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));

  await browser.close();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  console.log(`CLEANUP: node scripts/gigs-e2e-cleanup.cjs ${STAMP}`);
  if (failures.length > 0) {
    console.error("FAILURES:", failures);
    process.exit(1);
  }
})();
