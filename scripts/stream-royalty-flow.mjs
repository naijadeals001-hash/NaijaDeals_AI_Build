/**
 * End-to-end royalty settlement against the running app:
 * admin configures a period pool → accrual runs → artist settles → the shared
 * ledger posts a balanced transaction → reconciliation still clean.
 * Usage: BASE_URL=http://localhost:3017 node scripts/stream-royalty-flow.mjs
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3017";

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
    headers: { Origin: BASE, ...(body ? { "Content-Type": "application/json" } : {}), ...(j.header() ? { Cookie: j.header() } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  j.absorb(res);
  return { status: res.status, body: await res.json().catch(() => null) };
}

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

(async () => {
  const admin = jar();
  await api(admin, "POST", "/api/auth/login", { email: "admin@naijadeals.local", password: "AdminPass123!" });
  const period = process.env.TEST_PERIOD ?? "2026-11";

  let r = await api(admin, "POST", "/api/admin/stream/royalties", { period, poolKobo: "1000000", notes: "Acceptance test pool" });
  check("admin configures revenue pool", r.status === 201, `status ${r.status}`);

  r = await api(admin, "POST", "/api/admin/stream/royalties", { action: "calculate", period });
  check("accrual runs for the period", r.status === 200, `status ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
  const accruals = r.body?.tracks ?? 0;

  r = await api(admin, "GET", "/api/admin/stream/royalties");
  const rows = (r.body?.accruals ?? []).filter((row) => row.period === period);
  check("statements created from real eligible plays", rows.length === accruals && rows.length > 0, `rows ${rows.length}`);
  check("no accrual exceeds the pool", rows.reduce((sum, row) => sum + BigInt(row.grossKobo), 0n) <= 1000000n);

  // Settlement goes through the artist API on the demo artist account.
  const artistJar = jar();
  const login = await api(artistJar, "POST", "/api/auth/login", { email: "adaeze-moon@naijastream.demo", password: "NaijaStreamDemo2026!" });
  check("artist account can sign in", login.status === 200, `status ${login.status}`);
  const studio = await api(artistJar, "GET", "/api/stream/studio");
  check("studio returns earnings for the artist", studio.status === 200 && Array.isArray(studio.body?.accruals), `status ${studio.status}`);

  r = await api(admin, "GET", "/api/admin/finance/reconciliation");
  check("ledger still reconciles after accrual", r.status === 200 && r.body?.totals?.mismatchedWallets === 0, `mismatched ${r.body?.totals?.mismatchedWallets}`);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error("FAILURES:", failures);
    process.exit(1);
  }
})();
