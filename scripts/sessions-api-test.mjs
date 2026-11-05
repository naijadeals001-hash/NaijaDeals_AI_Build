// Session security API test: list, revoke-other, revoke-current (blocked), foreign revoke (404).
// Run: node scripts/sessions-api-test.mjs  (expects dev/prod server on localhost:3015)
const BASE = "http://localhost:3015";

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

async function login(j) {
  return loginAs(j, { email: "customer@naijadeals.local", password: "CustomerPass123!" });
}

async function loginAs(j, credentials) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE, Cookie: j.header() },
    body: JSON.stringify(credentials)
  });
  j.absorb(res);
  return res.status;
}

const results = {};
const a = jar();
const b = jar();
results.loginA = await login(a);
results.loginB = await login(b);

const anon = await fetch(`${BASE}/api/account/sessions`);
results.anonList = anon.status;

const listRes = await fetch(`${BASE}/api/account/sessions`, { headers: { Cookie: a.header() } });
const list = await listRes.json();
results.listStatus = listRes.status;
results.sessionCount = list.sessions.length;
results.currentFlags = list.sessions.filter((s) => s.current).length;
const other = list.sessions.find((s) => !s.current);
const current = list.sessions.find((s) => s.current);
const revokeOther = await fetch(`${BASE}/api/account/sessions/${other.id}`, { method: "DELETE", headers: { Cookie: a.header() } });
results.revokeOther = revokeOther.status;

const revokeCurrent = await fetch(`${BASE}/api/account/sessions/${current.id}`, { method: "DELETE", headers: { Cookie: a.header() } });
results.revokeCurrentBlocked = revokeCurrent.status; // expect 400

// A seller (different account) tries to revoke the customer's session -> 404, no leakage
const seller = jar();
await loginAs(seller, { email: "seller@naijadeals.local", password: "SellerPass123!" });
const foreign = await fetch(`${BASE}/api/account/sessions/${current.id}`, { method: "DELETE", headers: { Cookie: seller.header() } });
results.foreignRevoke = foreign.status; // expect 404

const listAfter = await (await fetch(`${BASE}/api/account/sessions`, { headers: { Cookie: a.header() } })).json();
results.countAfterRevoke = listAfter.sessions.length;

console.log(JSON.stringify(results, null, 2));
const ok =
  results.anonList === 401 &&
  results.listStatus === 200 &&
  results.currentFlags === 1 &&
  results.revokeOther === 200 &&
  results.revokeCurrentBlocked === 400 &&
  results.foreignRevoke === 404 &&
  results.countAfterRevoke === results.sessionCount - 1;
process.exit(ok ? 0 : 1);
