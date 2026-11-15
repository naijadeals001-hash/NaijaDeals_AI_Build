/**
 * Run-owned Discover Africa staff accounts for REVIEW verification.
 *
 * Creates (or removes) dedicated editor, publisher, origin-reviewer,
 * ordinary-admin and region-scoped accounts so permission separation can be
 * exercised without changing any existing person's roles.
 *
 * Usage:
 *   REVIEW_DATABASE_URL=<explicit review connection> npx tsx scripts/review-country-role-setup.ts setup --run=<run-id> [--credentials-dir=<dir>]
 *   REVIEW_DATABASE_URL=<explicit review connection> npx tsx scripts/review-country-role-setup.ts cleanup --run=<run-id>
 *
 * Every account email is namespaced with the run id. `cleanup` removes those
 * accounts' sessions, role assignments and users; role definitions themselves
 * are shared reference rows created by scripts/seed-country-roles.ts. Passwords
 * are written only to the credential directory (outside Git by default) and are
 * never printed.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";
import { requireCountryReviewDatabase } from "./lib/country-review-db";

type AccountSpec = {
  key: string;
  role: "country_editor" | "country_publisher" | "country_origin_reviewer" | "admin";
  scopeCountryCode: string | null;
  label: string;
};

const ACCOUNTS: AccountSpec[] = [
  { key: "editor", role: "country_editor", scopeCountryCode: null, label: "Dedicated country editor" },
  { key: "publisher", role: "country_publisher", scopeCountryCode: null, label: "Dedicated country publisher" },
  { key: "origin", role: "country_origin_reviewer", scopeCountryCode: null, label: "Platform origin reviewer" },
  { key: "admin", role: "admin", scopeCountryCode: null, label: "Ordinary administrator probe" },
  { key: "editor-gh", role: "country_editor", scopeCountryCode: "GH", label: "Ghana-scoped editor" },
  { key: "editor-qt", role: "country_editor", scopeCountryCode: "QT", label: "Run-owned fixture-scoped editor" },
  { key: "publisher-gh", role: "country_publisher", scopeCountryCode: "GH", label: "Ghana-scoped publisher" },
  { key: "origin-ng", role: "country_origin_reviewer", scopeCountryCode: "NG", label: "Nigeria-scoped origin reviewer" },
  { key: "origin-gh", role: "country_origin_reviewer", scopeCountryCode: "GH", label: "Ghana-scoped origin reviewer" }
];

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length).trim() || undefined;
}

function runId(): string {
  const value = argument("run") ?? process.env.RUN_ID?.trim();
  if (!value) {
    throw new Error("--run=<run-id> (or RUN_ID) is required so accounts stay run-owned and cleanup is exact.");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,60}$/.test(value)) {
    throw new Error("--run must be 3-60 characters of letters, digits, hyphen or underscore.");
  }
  return value;
}

function emailFor(run: string, key: string) {
  return `qa-country-role-${run}-${key}@review.local`;
}

function emailPattern(run: string) {
  return `qa-country-role-${run}-%@review.local`;
}

export async function cleanupReviewCountryRoles(prisma: PrismaClient, run: string) {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: `@review.local`, startsWith: `qa-country-role-${run}-` } },
    select: { id: true, email: true }
  });
  const ids = users.map((user) => user.id);
  if (ids.length > 0) {
    await prisma.session.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
    // Run-owned audit/system rows reference these actors; remove them before
    // deleting the users so the fixture does not leave residue behind.
    await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.systemEvent.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  const remaining = await prisma.user.count({
    where: { email: { endsWith: `@review.local`, startsWith: `qa-country-role-${run}-` } }
  });
  if (remaining > 0) throw new Error(`cleanup left ${remaining} run-owned account(s).`);
  return { removed: ids.length, remaining, emails: users.map((user) => user.email) };
}

export async function setupReviewCountryRoles(prisma: PrismaClient, run: string, credentialsDir?: string) {
  // An interrupted previous setup for the same run must not leave stale
  // assignments behind.
  await cleanupReviewCountryRoles(prisma, run);

  const roleRows = new Map<string, string>();
  for (const role of ["country_editor", "country_publisher", "country_origin_reviewer", "admin"]) {
    const row = await prisma.role.upsert({
      where: { name: role },
      update: {},
      create: {
        name: role,
        description:
          role === "country_editor"
            ? "Drafts and edits Discover Africa country guides; cannot publish or verify origin."
            : role === "country_publisher"
              ? "Publishes and unpublishes reviewed Discover Africa country guides."
              : role === "country_origin_reviewer"
                ? "Records and reviews product country-of-origin evidence."
                : undefined
      },
      select: { id: true, name: true }
    });
    roleRows.set(row.name, row.id);
  }

  const directory = credentialsDir ?? path.join(tmpdir(), `naijadeals-country-roles-${run}`);
  mkdirSync(directory, { recursive: true });

  const accounts: Array<{
    key: string;
    label: string;
    email: string;
    userId: string;
    role: string;
    scopeCountryCode: string | null;
    credentialsFile: string;
  }> = [];

  for (const spec of ACCOUNTS) {
    const email = emailFor(run, spec.key);
    const password = randomBytes(24).toString("base64url");
    const user = await prisma.user.create({
      data: {
        email,
        name: `QA ${spec.label} (${run})`,
        passwordHash: await hashPassword(password),
        actorType: "ADMIN",
        scopeCountryCode: spec.scopeCountryCode,
        verifiedAt: new Date()
      },
      select: { id: true, email: true }
    });
    const roleId = roleRows.get(spec.role);
    if (!roleId) throw new Error(`role ${spec.role} was not seeded`);
    await prisma.userRole.create({ data: { userId: user.id, roleId } });

    const credentialsFile = path.join(directory, `${spec.key}.json`);
    writeFileSync(
      credentialsFile,
      JSON.stringify(
        {
          run,
          key: spec.key,
          label: spec.label,
          email,
          password,
          userId: user.id,
          role: spec.role,
          scopeCountryCode: spec.scopeCountryCode,
          createdAt: new Date().toISOString()
        },
        null,
        2
      ),
      { encoding: "utf8", mode: 0o600 }
    );
    accounts.push({
      key: spec.key,
      label: spec.label,
      email,
      userId: user.id,
      role: spec.role,
      scopeCountryCode: spec.scopeCountryCode,
      credentialsFile
    });
  }

  const manifestFile = path.join(directory, "manifest.json");
  writeFileSync(
    manifestFile,
    JSON.stringify(
      {
        run,
        createdAt: new Date().toISOString(),
        accounts: accounts.map(({ email: accountEmail, userId, role, scopeCountryCode, key }) => ({
          key,
          email: accountEmail,
          userId,
          role,
          scopeCountryCode
        }))
      },
      null,
      2
    ),
    { encoding: "utf8", mode: 0o600 }
  );

  return {
    run,
    credentialDirectory: directory,
    manifestFile,
    accounts,
    note: "Passwords live only in the credential directory; cleanup removes the accounts, assignments, sessions and actor audit rows."
  };
}

async function main() {
  const action = (process.argv[2] ?? "setup").toLowerCase();
  if (action !== "setup" && action !== "cleanup") {
    throw new Error("Use setup or cleanup.");
  }
  const run = runId();
  await requireCountryReviewDatabase();
  const prisma = new PrismaClient();
  try {
    if (action === "cleanup") {
      const result = await cleanupReviewCountryRoles(prisma, run);
      console.log(JSON.stringify({ action, run, ...result }, null, 2));
      return;
    }
    const result = await setupReviewCountryRoles(prisma, run, argument("credentials-dir"));
    console.log(JSON.stringify({ action, ...result }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

const executedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (executedDirectly) {
  main().catch((error) => {
    const text = error instanceof Error ? error.message : String(error);
    console.error(
      `COUNTRY_ROLE_SETUP_FAILED: ${text.replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "postgresql://[redacted]")}`
    );
    process.exitCode = 1;
  });
}
