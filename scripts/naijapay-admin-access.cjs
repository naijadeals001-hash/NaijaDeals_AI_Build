/**
 * Control Center NaijaPay access control.
 *
 * Proves the server enforces the permissions rather than the UI hiding buttons:
 * anonymous is refused, a customer is refused, an administrator with the right
 * permission reads only status (no secrets), and settling a dispute requires the
 * dedicated permission plus a recorded reason.
 *
 * Run: node scripts/naijapay-admin-access.cjs
 */
const BASE = process.env.QA_BASE_URL ?? "http://localhost:3015";

let pass = 0;
let fail = 0;
const check = (n, ok, d = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`);
  if (ok) pass++;
  else fail++;
};

async function session(email, password) {
  const jar = [];
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, password })
  });
  for (const cookie of res.headers.getSetCookie?.() ?? []) jar.push(cookie.split(";")[0]);
  return { status: res.status, cookie: jar.join("; ") };
}

const get = (path, cookie) =>
  fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {} }).then(async (r) => ({ status: r.status, body: await r.text() }));

const post = (path, cookie, body) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body)
  }).then(async (r) => ({ status: r.status, body: await r.text() }));

(async () => {
  console.log("1) Access control");
  const anon = await get("/api/admin/naijapay");
  check("anonymous is refused", anon.status === 401 || anon.status === 403, `status ${anon.status}`);

  const customer = await session("naijapay-test-sender@naijadeals.test", "NaijaPayTest123!");
  const customerRead = await get("/api/admin/naijapay", customer.cookie);
  check("a customer is refused", customerRead.status === 403, `status ${customerRead.status}`);

  // A finance operator, created for this check only and removed afterwards.
  const { PrismaClient } = require("@prisma/client");
  const { pathToFileURL } = require("node:url");
  const path = require("node:path");
  const prisma = new PrismaClient();
  const adminEmail = `naijapay-admin-check-${Date.now()}@naijadeals.test`;
  const passwordHash = await (await import(pathToFileURL(path.join(process.cwd(), "lib", "auth", "password.ts")).href)).hashPassword("AdminCheck123!");
  const financeRole = await prisma.role.findFirstOrThrow({ where: { name: "finance" } });
  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      name: "Finance Check",
      passwordHash,
      actorType: "CUSTOMER",
      roles: { create: { roleId: financeRole.id } }
    }
  });

  const adminSession = await session(adminEmail, "AdminCheck123!");
  check("finance admin can sign in", adminSession.status === 200, `status ${adminSession.status}`);

  const adminRead = await get("/api/admin/naijapay", adminSession.cookie);
  check("finance admin can read controls", adminRead.status === 200, `status ${adminRead.status}`);

  if (adminRead.status === 200) {
    const body = JSON.parse(adminRead.body);
    check("response reports the database classification", typeof body.database?.classification === "string", body.database?.classification);
    check("providers are reported as status only", Array.isArray(body.providers) && body.providers.every((p) => "configured" in p && "note" in p));
    const raw = adminRead.body;
    check("no secret value leaks into the response", !/sk_live_|sk_test_[A-Za-z0-9]{8}|FLWSECK_[A-Za-z0-9]{8}|KIE_API_KEY|DATABASE_URL/i.test(raw));
    check("journal totals are present", typeof body.journal?.creditKobo === "string" && typeof body.journal?.debitKobo === "string");
  }

  console.log("\n2) Settlement requires a reason and the right permission");
  const noReason = await post("/api/admin/naijapay", adminSession.cookie, { reference: "MS-NONEXISTENT", decision: "release", note: "" });
  check("settling without a reason is refused", noReason.status === 400, `status ${noReason.status}`);

  const badDecision = await post("/api/admin/naijapay", adminSession.cookie, { reference: "MS-NONEXISTENT", decision: "steal", note: "trying" });
  check("an invalid decision is refused", badDecision.status === 400, `status ${badDecision.status}`);

  const unknownMilestone = await post("/api/admin/naijapay", adminSession.cookie, { reference: "MS-NONEXISTENT", decision: "release", note: "no such milestone" });
  check("an unknown milestone is refused", unknownMilestone.status === 404, `status ${unknownMilestone.status}`);

  const customerSettle = await post("/api/admin/naijapay", customer.cookie, { reference: "MS-NONEXISTENT", decision: "release", note: "should be refused" });
  check("a customer cannot settle a dispute", customerSettle.status === 403, `status ${customerSettle.status}`);

  const crossSite = await fetch(`${BASE}/api/admin/naijapay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://evil.example", cookie: adminSession.cookie },
    body: JSON.stringify({ reference: "MS-X", decision: "release", note: "cross site" })
  });
  check("a cross-site settlement request is refused", crossSite.status === 403, `status ${crossSite.status}`);

  // Remove the role link first: the join table restricts deleting a linked user.
  await prisma.userRole.deleteMany({ where: { userId: admin.id } });
  await prisma.session.deleteMany({ where: { userId: admin.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: admin.id } });
  await prisma.$disconnect();

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
