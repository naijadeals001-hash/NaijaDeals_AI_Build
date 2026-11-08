/**
 * NaijaGigs end-to-end journey tests against the running app's REAL APIs.
 *
 * Covers: application → admin verification → listing publication → discovery →
 * booking → escrow funding → state machine (accept/start/submit/approve) →
 * commission-aware release → eligible review → authorization denials →
 * ledger reconciliation.
 *
 * Usage: BASE_URL=http://localhost:3020 node scripts/gigs-e2e-tests.mjs
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3020";

function jar() {
  const cookies = new Map();
  return {
    header: () => [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
    absorb: (res) => {
      for (const entry of res.headers.getSetCookie?.() ?? []) {
        const pair = entry.split(";")[0];
        const i = pair.indexOf("=");
        if (i > 0) cookies.set(pair.slice(0, i), pair.slice(i + 1));
      }
    }
  };
}

async function api(j, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Origin: BASE,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(j.header() ? { Cookie: j.header() } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual"
  });
  j.absorb(res);
  let parsed = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed };
}

const STAMP = Date.now().toString(36);
let passed = 0;
const failures = [];
function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const pro = jar();
const customer = jar();
const admin = jar();
const outsider = jar();

// --- 1. Accounts -----------------------------------------------------------
console.log("1) accounts");
const proEmail = `gigspro-${STAMP}@test.local`;
let r = await api(pro, "POST", "/api/auth/register", { name: "Gigs Pro Fixture", email: proEmail, password: "GigsProPass123!", phone: "08031112222" });
check("pro registers", r.status === 201 || r.status === 200, `status ${r.status}`);
r = await api(pro, "POST", "/api/auth/login", { email: proEmail, password: "GigsProPass123!" });
check("pro signs in", r.status === 200, `status ${r.status}`);
r = await api(customer, "POST", "/api/auth/login", { email: "customer@naijadeals.local", password: "CustomerPass123!" });
check("customer signs in", r.status === 200, `status ${r.status}`);
r = await api(admin, "POST", "/api/auth/login", { email: "admin@naijadeals.local", password: "AdminPass123!" });
check("admin signs in", r.status === 200, `status ${r.status}`);
r = await api(outsider, "POST", "/api/auth/login", { email: "seller@naijadeals.local", password: "SellerPass123!" });
check("outsider signs in", r.status === 200, `status ${r.status}`);

// --- 2. Application --------------------------------------------------------
console.log("2) professional application");
r = await api(pro, "GET", "/api/gigs/pro");
check("no profile before applying", r.status === 200 && r.body.profile === null, JSON.stringify(r.body).slice(0, 80));
const categories = (await api(jar(), "GET", "/api/gigs/categories")).body.categories;
check("taxonomy seeded", Array.isArray(categories) && categories.length >= 8, `got ${categories?.length}`);
r = await api(pro, "POST", "/api/gigs/pro", {
  displayName: "Fixture Pro Solar",
  headline: "Test-only fixture professional",
  bio: "Isolated development fixture for NaijaGigs verification. Not a real business.",
  countryCode: "NG",
  state: "Lagos",
  city: "Ikeja",
  serviceModes: ["LOCAL"],
  categoryIds: [categories[1].id],
  languages: ["English"],
  yearsExperience: 3
});
check("application accepted", r.status === 201, `status ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
const profileId = r.body?.id;
check("status starts PENDING", r.body?.status === "PENDING", r.body?.status);

// --- 3. Publishing blocked while PENDING ----------------------------------
console.log("3) unverified restrictions");
r = await api(pro, "POST", "/api/gigs/services", {
  categoryId: categories[1].id,
  title: "Fixture Solar Check",
  summary: "Should be rejected while unverified",
  description: "Isolated fixture.",
  mode: "LOCAL",
  pricingType: "FIXED",
  priceKobo: 50000,
  countryCode: "NG"
});
check("listing blocked while PENDING", r.status === 403, `status ${r.status}`);

// --- 4. Admin verification -------------------------------------------------
console.log("4) admin verification");
r = await api(customer, "POST", `/api/admin/gigs/professionals/${profileId}`, { action: "VERIFY" });
check("non-admin cannot verify", r.status === 403, `status ${r.status}`);
r = await api(admin, "POST", `/api/admin/gigs/professionals/${profileId}`, { action: "VERIFY", note: "Fixture verification for e2e test" });
check("admin verifies professional", r.status === 200 && r.body.status === "VERIFIED", `status ${r.status} ${r.body?.status}`);

// --- 5. Listing publication + discovery ------------------------------------
console.log("5) listing publication and discovery");
r = await api(pro, "POST", "/api/gigs/services", {
  categoryId: categories[1].id,
  title: `Fixture Solar Installation ${STAMP}`,
  summary: "Isolated test fixture service (not a real offer).",
  description: "Created by scripts/gigs-e2e-tests.mjs and removed after the run.",
  mode: "LOCAL",
  pricingType: "FIXED",
  priceKobo: 50000,
  countryCode: "NG",
  state: "Lagos",
  city: "Ikeja"
});
check("verified pro publishes listing", r.status === 201, `status ${r.status}`);
const listingId = r.body?.id;
const listingSlug = r.body?.slug;
r = await api(jar(), "GET", `/api/gigs/services?q=${STAMP}`);
check("public search finds listing", r.status === 200 && r.body.items?.some((item) => item.id === listingId), `items ${r.body?.items?.length}`);
r = await api(jar(), "GET", `/api/gigs/services/${listingSlug}`);
const detail = r.body?.listing ?? r.body;
check("public detail by slug", r.status === 200 && (detail?.id === listingId || detail?.listing?.id === listingId), `status ${r.status} keys ${Object.keys(r.body ?? {}).join(",")}`);

// --- 6. Booking lifecycle --------------------------------------------------
console.log("6) booking lifecycle and escrow");
const walletBefore = (await api(customer, "GET", "/api/wallet")).body;
r = await api(customer, "POST", "/api/gigs/bookings", { listingId, description: "Fixture booking", address: "1 Test Road, Ikeja" });
check("booking requested", r.status === 201 && r.body.status === "REQUESTED", `status ${r.status}`);
const bookingId = r.body?.id;

r = await api(customer, "POST", `/api/gigs/bookings/${bookingId}/fund`, {});
check("funding before acceptance blocked", r.status === 409, `status ${r.status}`);
r = await api(customer, "POST", `/api/gigs/bookings/${bookingId}/action`, { action: "accept" });
check("customer cannot accept", r.status === 403, `status ${r.status}`);
r = await api(outsider, "POST", `/api/gigs/bookings/${bookingId}/action`, { action: "accept" });
check("outsider cannot accept", r.status === 403, `status ${r.status}`);

r = await api(pro, "POST", `/api/gigs/bookings/${bookingId}/action`, { action: "accept" });
check("professional accepts", r.status === 200 && r.body.status === "ACCEPTED", `status ${r.status} ${r.body?.status}`);

r = await api(customer, "POST", `/api/gigs/bookings/${bookingId}/fund`, {});
check("booking funded from wallet", r.status === 200 && r.body.paymentStatus === "HELD", `status ${r.status} ${r.body?.paymentStatus}`);
r = await api(customer, "POST", `/api/gigs/bookings/${bookingId}/fund`, {});
check("double funding blocked", r.status === 409, `status ${r.status}`);
const walletAfter = (await api(customer, "GET", "/api/wallet")).body;
check("customer wallet debited", Number(walletAfter.availableKobo) === Number(walletBefore.availableKobo) - 50000, `${walletBefore.availableKobo} -> ${walletAfter.availableKobo}`);

r = await api(customer, "POST", `/api/gigs/bookings/${bookingId}/review`, { rating: 5, comment: "premature" });
check("review before completion blocked", r.status === 409, `status ${r.status}`);

r = await api(pro, "POST", `/api/gigs/bookings/${bookingId}/action`, { action: "start" });
check("work starts after funding", r.status === 200 && r.body.status === "IN_PROGRESS", `status ${r.status}`);
r = await api(pro, "POST", `/api/gigs/bookings/${bookingId}/action`, { action: "submit" });
check("work submitted", r.status === 200 && r.body.status === "SUBMITTED", `status ${r.status}`);
r = await api(pro, "POST", `/api/gigs/bookings/${bookingId}/action`, { action: "approve" });
check("professional cannot approve", r.status === 403, `status ${r.status}`);

const proWalletBefore = (await api(pro, "GET", "/api/wallet")).body;
r = await api(customer, "POST", `/api/gigs/bookings/${bookingId}/action`, { action: "approve" });
check("customer approves completion", r.status === 200 && r.body.status === "COMPLETED", `status ${r.status}`);
check("payment released", r.body?.paymentStatus === "RELEASED", r.body?.paymentStatus);
const proWalletAfter = (await api(pro, "GET", "/api/wallet")).body;
const bookingRow = (await api(customer, "GET", "/api/gigs/bookings")).body.find?.((b) => b.id === bookingId)
  ?? (await api(customer, "GET", "/api/gigs/bookings")).body.bookings?.find?.((b) => b.id === bookingId);
const commission = Math.round(50000 * (bookingRow?.commissionBps ?? 1200) / 10000);
const proGain = Number(proWalletAfter.availableKobo) - Number(proWalletBefore.availableKobo);
check("professional credited net of commission", proGain === 50000 - commission, `gain ${proGain} expected ${50000 - commission} (bps ${bookingRow?.commissionBps})`);

// --- 7. Review after completion -------------------------------------------
console.log("7) eligible review");
r = await api(pro, "POST", `/api/gigs/bookings/${bookingId}/review`, { rating: 5, comment: "wrong actor" });
check("only customer can review", r.status === 403, `status ${r.status}`);
r = await api(customer, "POST", `/api/gigs/bookings/${bookingId}/review`, { rating: 5, comment: "Fixture review from e2e test" });
check("review submitted", r.status === 201 || r.status === 200, `status ${r.status}`);
r = await api(customer, "POST", `/api/gigs/bookings/${bookingId}/review`, { rating: 4, comment: "duplicate" });
check("duplicate review blocked", r.status === 409, `status ${r.status}`);

// --- 8. Messaging + overviews ---------------------------------------------
console.log("8) communication and overviews");
r = await api(customer, "GET", "/api/gigs/conversations");
const conversation = r.body?.conversations?.[0] ?? r.body?.[0];
check("booking conversation exists", Boolean(conversation), JSON.stringify(r.body).slice(0, 80));
if (conversation) {
  r = await api(customer, "POST", `/api/gigs/conversations/${conversation.id}`, { body: "Fixture message" });
  check("customer sends message", r.status === 200 || r.status === 201, `status ${r.status}`);
  r = await api(outsider, "GET", `/api/gigs/conversations/${conversation.id}`);
  check("outsider cannot read conversation", r.status === 403 || r.status === 404, `status ${r.status}`);
}
r = await api(customer, "GET", "/api/gigs/overview");
check("customer overview lists booking", r.status === 200 && (r.body.bookings ?? []).some((b) => b.id === bookingId));
r = await api(pro, "GET", "/api/gigs/pro");
check("pro metrics show released earnings", r.status === 200 && Number(r.body.overview?.metrics?.grossKobo ?? 0) >= 50000, `gross ${r.body?.overview?.metrics?.grossKobo}`);

// --- 9. Admin overview + reconciliation -----------------------------------
console.log("9) control center and reconciliation");
r = await api(customer, "GET", "/api/admin/gigs");
check("admin gigs overview blocked for customer", r.status === 403, `status ${r.status}`);
r = await api(admin, "GET", "/api/admin/gigs");
check("admin gigs overview works", r.status === 200, `status ${r.status}`);
r = await api(admin, "GET", "/api/admin/finance/reconciliation");
check("ledger still reconciles", r.status === 200 && r.body.totals.mismatchedWallets === 0, `mismatched ${r.body?.totals?.mismatchedWallets}`);
check("no unbalanced journals", (r.body?.unbalancedTransactions ?? []).length === 0, `count ${(r.body?.unbalancedTransactions ?? []).length}`);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error("FAILURES:", failures);
  process.exit(1);
}
console.log(`FIXTURE CLEANUP: node scripts/gigs-e2e-cleanup.cjs ${STAMP}`);
process.env.__GIGS_STAMP__ = STAMP;
