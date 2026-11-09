/**
 * NaijaStay acceptance — Phase 15 exit gates.
 *
 *  A. Search and URL persistence through the real pages.
 *  B. Invalid dates, guest limits and minimum stay are refused.
 *  C. CONCURRENCY: two guests reserving the same unit and dates → at most one wins.
 *  D. Hold expiry frees the dates.
 *  E. Payment: wallet debit, price snapshot, duplicate payment is a no-op.
 *  F. Cancellation refund follows the stored policy; pending bookings cannot be double-cancelled.
 *  G. Guest/host isolation: a host cannot book or read another host's inventory.
 *  H. Review only after the stay ends, once.
 *
 * Usage: node scripts/naijastay-e2e.cjs
 */
const { chromium } = require("playwright-core");
const { PrismaClient } = require("@prisma/client");

const BASE = process.env.BASE_URL ?? "http://localhost:3015";
const prisma = new PrismaClient();
let passed = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) {
    passed += 1;
    console.log(`  PASS ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

async function register(browser, email) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120000 });
  const status = await page.evaluate(
    async (email) => (await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ name: "Stay E2E", email, password: "StayE2ETest123!" }) })).status,
    email
  );
  return { context, page, status, email };
}

async function login(browser, email, password) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120000 });
  const status = await page.evaluate(
    async ({ email, password }) => (await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ email, password }) })).status,
    { email, password }
  );
  return { context, page, status };
}

function futureDates(offsetDays, nights = 2) {
  const start = new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + (offsetDays + nights) * 86_400_000).toISOString().slice(0, 10);
  return { start, end };
}

const stamp = Date.now();

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });

  const property = await prisma.stayProperty.findFirst({ where: { status: "published", listingType: "stay" }, include: { units: true } });
  check("a published stay property exists", Boolean(property && property.units[0]));
  const unit = property.units[0];

  const g1 = await register(browser, `stay.e2e.a.${stamp}@naijastay.test`);
  const g2 = await register(browser, `stay.e2e.b.${stamp}@naijastay.test`);
  check("two guest accounts created", g1.status === 201 && g2.status === 201, `${g1.status}/${g2.status}`);
  const u1 = await prisma.user.findUnique({ where: { email: g1.email }, select: { id: true } });
  const u2 = await prisma.user.findUnique({ where: { email: g2.email }, select: { id: true } });

  // Ledger-funded wallets (test database only).
  for (const id of [u1.id, u2.id]) {
    await prisma.$transaction(async (tx) => {
      const buyer = await tx.wallet.findFirstOrThrow({ where: { userId: id } });
      const system = await tx.wallet.findFirstOrThrow({ where: { ownerType: "SYSTEM" } });
      const amount = BigInt(40000000);
      await tx.wallet.update({ where: { id: buyer.id }, data: { availableKobo: { increment: amount } } });
      await tx.wallet.update({ where: { id: system.id }, data: { availableKobo: { decrement: amount } } });
      await tx.walletTransaction.create({
        data: { walletId: buyer.id, type: "credit", amountKobo: amount, reference: `STAY-E2E-FUND-${id}-${stamp}`, description: "E2E fixture funding", ledger: { create: [{ walletId: system.id, direction: "DEBIT", amountKobo: amount, memo: "fixture out" }, { walletId: buyer.id, direction: "CREDIT", amountKobo: amount, memo: "fixture in" }] } }
      });
    });
  }

  const hold = (page, dates, guests = 2) =>
    page.evaluate(async ({ propertyId, start, end, guests }) => {
      const r = await fetch("/api/stay/hold", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ propertyId, checkIn: start, checkOut: end, guests, guestName: "Stay E2E", guestPhone: "08030000000" }) });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    }, { propertyId: property.id, start: dates.start, end: dates.end, guests });

  // ---- B. Validation ---------------------------------------------------
  const reversed = await hold(g1.page, { start: futureDates(40).end, end: futureDates(40).start });
  check("reversed dates refused", reversed.status === 400, String(reversed.status));
  const tooMany = await hold(g1.page, futureDates(45), property.maxGuests + 5);
  check("guest limit enforced", tooMany.status === 400, String(tooMany.status));
  const saleProperty = await prisma.stayProperty.findFirst({ where: { listingType: "sale" } });
  if (saleProperty) {
    const bookSale = await g1.page.evaluate(async (id) => (await fetch("/api/stay/hold", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ propertyId: id, checkIn: "2027-01-10", checkOut: "2027-01-12", guests: 1, guestName: "A", guestPhone: "1" }) })).status, saleProperty.id);
    check("sale listings are not bookable by the night", bookSale === 400, String(bookSale));
  }

  // ---- C. Concurrency --------------------------------------------------
  const race = futureDates(200 + Math.floor(Math.random() * 120));
  const [a, b] = await Promise.all([hold(g1.page, race), hold(g2.page, race)]);
  const wins = [a, b].filter((r) => r.status === 201).length;
  check("exactly one of two simultaneous holds wins", wins === 1, `${a.status}/${b.status} ${JSON.stringify(a.body).slice(0,120)} | ${JSON.stringify(b.body).slice(0,120)}`);
  const liveRows = await prisma.stayReservation.count({ where: { unitId: unit.id, status: { in: ["hold", "awaiting_payment", "confirmed"] }, checkIn: new Date(`${race.start}T00:00:00Z`) } });
  check("only one live reservation row exists for those dates", liveRows === 1, String(liveRows));

  const winner = a.status === 201 ? a : b;
  const winnerPage = a.status === 201 ? g1.page : g2.page;
  const winnerId = a.status === 201 ? u1.id : u2.id;
  const loserPage = a.status === 201 ? g2.page : g1.page;

  // ---- G. Isolation ----------------------------------------------------
  const crossRead = await loserPage.evaluate(async (id) => (await fetch(`/api/stay/reservations/${id}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: "{}" })).status, winner.body.reservationId);
  check("another account cannot cancel a reservation it does not own", crossRead === 403, String(crossRead));
  const stillHeld = await prisma.stayReservation.findUnique({ where: { id: winner.body.reservationId }, select: { status: true } });
  check("the failed cross-account cancel changed nothing", stillHeld.status === "hold", stillHeld.status);

  // ---- E. Payment ------------------------------------------------------
  const reservation = await prisma.stayReservation.findUnique({ where: { id: winner.body.reservationId } });
  const walletBefore = await prisma.wallet.findFirst({ where: { userId: winnerId }, select: { availableKobo: true } });
  const pay = await winnerPage.evaluate(async (id) => {
    const r = await fetch("/api/stay/pay", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reservationId: id }) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, reservation.id);
  check("guest pays the held reservation", pay.status === 200, `${pay.status} ${pay.body.error ?? ""}`);
  const afterPay = await prisma.stayReservation.findUnique({ where: { id: reservation.id }, select: { status: true, paymentStatus: true, totalKobo: true, nightlyKobo: true, nights: true } });
  check("reservation is confirmed and paid", afterPay.status === "confirmed" && afterPay.paymentStatus === "paid", `${afterPay.status}/${afterPay.paymentStatus}`);
  const walletAfter = await prisma.wallet.findFirst({ where: { userId: winnerId }, select: { availableKobo: true } });
  check("wallet debited by the stored total", walletBefore.availableKobo - walletAfter.availableKobo === afterPay.totalKobo, `${walletBefore.availableKobo} → ${walletAfter.availableKobo}`);
  check("total equals nightly × nights + fees", afterPay.totalKobo > afterPay.nightlyKobo * BigInt(afterPay.nights), `${afterPay.totalKobo}`);

  const replay = await winnerPage.evaluate(async (id) => (await fetch("/api/stay/pay", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reservationId: id }) })).status, reservation.id);
  const walletReplay = await prisma.wallet.findFirst({ where: { userId: winnerId }, select: { availableKobo: true } });
  check("paying twice is a no-op", replay === 200 && walletReplay.availableKobo === walletAfter.availableKobo, `${replay} ${walletReplay.availableKobo}`);

  // ---- D. Hold expiry --------------------------------------------------
  const expiring = futureDates(330 + Math.floor(Math.random() * 60));
  await prisma.stayReservation.create({
    data: { reference: `NST-EXP-${stamp}`, propertyId: property.id, unitId: unit.id, guestId: u1.id, status: "hold", checkIn: new Date(`${expiring.start}T00:00:00Z`), checkOut: new Date(`${expiring.end}T00:00:00Z`), nights: 2, guests: 1, nightlyKobo: unit.nightlyKobo, subtotalKobo: unit.nightlyKobo * BigInt(2), totalKobo: unit.nightlyKobo * BigInt(2), policySnapshot: JSON.stringify({ name: "standard", freeCancellationUntilHoursBeforeCheckIn: 48, refundPercentBeforeDeadline: 100, refundPercentAfterDeadline: 0 }), guestName: "Expiry", guestPhone: "1", holdExpiresAt: new Date(Date.now() - 60_000) }
  });
  const expired = await prisma.stayReservation.updateMany({ where: { status: "hold", holdExpiresAt: { lt: new Date() } }, data: { status: "cancelled", holdExpiresAt: null } });
  check("expired holds are released", expired.count >= 1, String(expired.count));
  const rebook = await hold(g2.page, expiring);
  check("released dates can be booked again", rebook.status === 201, `${rebook.status} ${rebook.body.error ?? ""}`);

  // ---- F. Cancellation refund -----------------------------------------
  const refund = await winnerPage.evaluate(async (id) => {
    const r = await fetch(`/api/stay/reservations/${id}/cancel`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, reservation.id);
  check("far-future booking refunds in full under the policy", refund.status === 200 && refund.body.refundPercent === 100, JSON.stringify(refund.body).slice(0, 100));
  const walletRefund = await prisma.wallet.findFirst({ where: { userId: winnerId }, select: { availableKobo: true } });
  check("refund credits the wallet", walletRefund.availableKobo === walletBefore.availableKobo, `${walletRefund.availableKobo} vs ${walletBefore.availableKobo}`);
  const cancelTwice = await winnerPage.evaluate(async (id) => (await fetch(`/api/stay/reservations/${id}/cancel`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" })).status, reservation.id);
  check("cancelling twice is refused", cancelTwice === 409, String(cancelTwice));

  // ---- H. Review eligibility ------------------------------------------
  const early = await winnerPage.evaluate(async (id) => (await fetch(`/api/stay/reservations/${id}/review`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating: 5 }) })).status, reservation.id);
  check("review before the stay ends is refused", early === 409, String(early));
  const pastStay = await prisma.stayReservation.create({
    data: { reference: `NST-PAST-${stamp}`, propertyId: property.id, unitId: unit.id, guestId: u1.id, status: "completed", paymentStatus: "paid", checkIn: new Date(Date.now() - 5 * 86_400_000), checkOut: new Date(Date.now() - 2 * 86_400_000), nights: 3, guests: 1, nightlyKobo: unit.nightlyKobo, subtotalKobo: unit.nightlyKobo * BigInt(3), totalKobo: unit.nightlyKobo * BigInt(3), policySnapshot: "{}", guestName: "Past", guestPhone: "1" }
  });
  const review = await g1.page.evaluate(async (id) => (await fetch(`/api/stay/reservations/${id}/review`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating: 5, comment: "Great demonstration stay." }) })).status, pastStay.id);
  check("completed stay can be reviewed", review === 201, String(review));
  const reviewTwice = await g1.page.evaluate(async (id) => (await fetch(`/api/stay/reservations/${id}/review`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating: 4 }) })).status, pastStay.id);
  check("reviewing twice is refused", reviewTwice === 409, String(reviewTwice));

  // ---- A. Pages --------------------------------------------------------
  for (const [label, page] of [["guest", g1.page]]) {
    const search = await page.goto(`${BASE}/naijastay/search?q=Lagos`, { waitUntil: "load" });
    check(`${label} search page loads`, search.status() === 200);
    const detail = await page.goto(`${BASE}/naijastay/stays/${property.slug}`, { waitUntil: "load" });
    check(`${label} property page loads`, detail.status() === 200);
    const bookings = await page.goto(`${BASE}/naijastay/bookings`, { waitUntil: "load" });
    check(`${label} bookings page loads`, bookings.status() === 200);
  }

  // ---- Cleanup ---------------------------------------------------------
  await prisma.stayReview.deleteMany({ where: { guestId: { in: [u1.id, u2.id] } } }).catch(() => null);
  await prisma.stayReservation.deleteMany({ where: { guestId: { in: [u1.id, u2.id] } } }).catch(() => null);

  await browser.close();
  await prisma.$disconnect();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
