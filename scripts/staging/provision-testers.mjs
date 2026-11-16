#!/usr/bin/env node
/**
 * Provisions the approved local staging testers.
 *
 * Accounts are created through the real registration endpoint (password hashed
 * server-side, customer role and wallet created by the application). Roles and
 * staging-only seller/driver personas are then attached narrowly:
 *   - Testing Manager: existing `support` role (support inbox + assignment).
 *   - Testers: existing `customer` role only.
 *   - One separate seller persona for tester02 and one driver persona for
 *     tester03. Persona emails use the non-deliverable .test domain and are not
 *     Cloudflare identities.
 *
 * No password is printed or committed. New credentials are written only to the
 * ACL-protected `C:\NaijaDeals-Staging\secrets\tester-activation.json` file for
 * out-of-band owner handoff. Re-running never resets an existing password.
 */
import fs from "node:fs";
import { randomBytes } from "node:crypto";

const SECRETS = "C:/NaijaDeals-Staging/secrets/staging-secrets.json";
const ENV_FILE = "C:/NaijaDeals-Staging/env/staging.env";
const ACTIVATION = "C:/NaijaDeals-Staging/secrets/tester-activation.json";
const BASE = (process.env.STAGING_BASE_URL ?? "http://127.0.0.1:3200").replace(/\/$/, "");

const env = {};
for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
  if (!line || line.trim().startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i > 0) env[line.slice(0, i)] = line.slice(i + 1);
}
process.env.DATABASE_URL = env.DATABASE_URL;
const { prisma } = await import("../../lib/prisma.ts");

const secrets = JSON.parse(fs.readFileSync(SECRETS, "utf8"));
const approved = secrets.approvedTesters ?? [];
const personas = secrets.stagingPersonas ?? [];
if (approved.length !== 3) {
  console.error("approvedTesters must contain exactly three entries");
  process.exit(2);
}

const activation = fs.existsSync(ACTIVATION)
  ? JSON.parse(fs.readFileSync(ACTIVATION, "utf8"))
  : { generatedAt: new Date().toISOString(), accounts: [] };

function newPassword() {
  return randomBytes(18).toString("base64url");
}

async function register(entry) {
  const existing = await prisma.user.findUnique({ where: { email: entry.email } });
  if (existing) return { userId: existing.id, created: false, password: null };
  const password = newPassword();
  const response = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ name: entry.displayName, email: entry.email, password })
  });
  const body = await response.json();
  if (response.status !== 201) {
    throw new Error(`registration failed for ${entry.email}: ${response.status} ${body.code ?? body.error ?? "unknown"}`);
  }
  return { userId: body.user.id, created: true, password };
}

async function addRole(userId, roleName, actorNote) {
  const role = await prisma.role.findUnique({ where: { name: roleName }, select: { id: true } });
  if (!role) throw new Error(`role missing: ${roleName}`);
  await prisma.userRole.createMany({ data: [{ userId, roleId: role.id }], skipDuplicates: true });
  await prisma.auditLog.create({
    data: {
      action: "staging.tester_role_assigned",
      entity: "User",
      entityId: userId,
      metadata: { role: roleName, note: actorNote }
    }
  });
}

/** Add a persona entry to the activation file without duplicating it. */
function remember(entry) {
  const index = activation.accounts.findIndex((row) => row.email === entry.email);
  if (index >= 0) activation.accounts[index] = { ...activation.accounts[index], ...entry };
  else activation.accounts.push(entry);
}

let created = 0;
let existing = 0;

for (const tester of approved) {
  const result = await register(tester);
  if (result.created) created += 1;
  else existing += 1;
  if (tester.stagingRole !== "customer") await addRole(result.userId, tester.stagingRole, "approved tester role");
  remember({
    email: tester.email,
    displayName: tester.displayName,
    roles: ["customer", ...(tester.stagingRole !== "customer" ? [tester.stagingRole] : [])],
    purpose: tester.purpose,
    password: result.password,
    existingAccount: !result.created,
    note: "Staging only. Deliver credentials out of band; never share this account."
  });
}

for (const persona of personas) {
  const result = await register(persona);
  if (result.created) created += 1;
  else existing += 1;
  const roleName = persona.role === "vendor" ? "vendor" : "driver";
  await addRole(result.userId, roleName, `persona for ${persona.ownerTester}`);
  if (roleName === "vendor") {
    const present = await prisma.vendor.findFirst({ where: { ownerId: result.userId }, select: { id: true } });
    if (!present) {
      await prisma.vendor.create({
        data: {
          ownerId: result.userId,
          name: "STAGING TEST Seller Persona",
          slug: "staging-test-seller-tester02",
          market: "Wuse",
          description: "Staging-only seller persona for approved tester02. Not a real seller.",
          pickupAddress: "Staging test pickup, Abuja",
          pickupPhone: "+2340000000000",
          countryCode: "NG",
          status: "VERIFIED"
        }
      });
    }
  } else {
    const present = await prisma.driverProfile.findUnique({ where: { userId: result.userId }, select: { id: true } });
    if (!present) {
      await prisma.driverProfile.create({
        data: {
          userId: result.userId,
          licenseNumber: "STG-DRV-TESTER03",
          status: "approved",
          vehicleClass: "economy",
          vehicleMake: "Toyota",
          vehicleModel: "Corolla",
          vehiclePlate: "STG-003",
          serviceZone: "Abuja",
          active: true
        }
      });
    }
  }
  remember({
    email: persona.email,
    displayName: persona.displayName,
    roles: ["customer", roleName],
    purpose: [`${roleName} journey persona for ${persona.ownerTester}`],
    ownerTester: persona.ownerTester,
    password: result.password,
    existingAccount: !result.created,
    note: "Staging persona only. Non-deliverable .test address. Use only through its owning tester."
  });
}

activation.generatedAt = new Date().toISOString();
activation.accounts = activation.accounts.map((row) => (row.password ? row : { ...row, password: null }));
fs.writeFileSync(ACTIVATION, JSON.stringify(activation, null, 2), { encoding: "utf8" });
await prisma.$disconnect();
console.log(JSON.stringify({ created, existing, activationFile: ACTIVATION, accounts: activation.accounts.length }));
