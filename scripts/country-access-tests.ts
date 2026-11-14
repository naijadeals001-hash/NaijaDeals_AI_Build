/**
 * Discover Africa permission separation and role-allowlist verification.
 *
 * Creates run-owned REVIEW accounts (editor, publisher, origin reviewer,
 * ordinary admin, region-scoped variants), verifies the permission matrix from
 * the real role rows, exercises the assignable-role allowlist through
 * setUserRoles, and removes every account, assignment, session and actor audit
 * row afterwards. Role definitions themselves remain shared reference data.
 *
 * Run only against REVIEW:
 *   REVIEW_DATABASE_URL=<explicit review connection> npx tsx scripts/country-access-tests.ts
 */
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { requireCountryReviewDatabase, sanitizeCountryReviewError } from "./lib/country-review-db";
import { cleanupReviewCountryRoles, setupReviewCountryRoles } from "./review-country-role-setup";

type CheckResult = { name: string; status: "PASS" | "FAIL"; detail: string };
const results: CheckResult[] = [];

async function check(name: string, fn: () => Promise<string>) {
  try {
    const detail = await fn();
    results.push({ name, status: "PASS", detail });
    console.log(`PASS  ${name} — ${detail}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, status: "FAIL", detail });
    console.error(`FAIL  ${name}\n      ${detail}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const target = await requireCountryReviewDatabase();
  const prismaModule = await import("../lib/prisma");
  const prisma = prismaModule.prisma;
  const permissionsModule = await import("../lib/auth/permissions");
  const { PERMISSIONS, STAFF_ROLES, isStaffRole, permissionsFor, regionViolation } = permissionsModule;
  const { assertRegion } = await import("../lib/auth/scope");
  const { setUserRoles } = await import("../lib/services/core/admin.service");

  const run = `access-${randomUUID().slice(0, 8)}`;
  const credentialsDir = mkdtempSync(path.join(tmpdir(), "nd-country-access-"));
  let superActorId: string | null = null;

  try {
    const setup = await setupReviewCountryRoles(prisma, run, credentialsDir);
    const emails = new Map(setup.accounts.map((account) => [account.key, account.email] as const));

    const loadUser = async (key: string) => {
      const email = emails.get(key);
      assert(email, `account ${key} is missing from the run-owned setup`);
      const user = await prisma.user.findUnique({
        where: { email },
        include: { roles: { include: { role: true } }, vendors: true }
      });
      assert(user, `user ${key} was not created`);
      return user;
    };

    const editor = await loadUser("editor");
    const publisher = await loadUser("publisher");
    const origin = await loadUser("origin");
    const ordinaryAdmin = await loadUser("admin");
    const editorGh = await loadUser("editor-gh");
    const publisherGh = await loadUser("publisher-gh");
    const originNg = await loadUser("origin-ng");
    const originGh = await loadUser("origin-gh");

    const names = (user: typeof editor) => user.roles.map((entry) => entry.role.name);
    const granted = (user: typeof editor) => new Set(permissionsFor(user as never));

    await check("country_editor is an assignable staff role", async () => {
      assert(isStaffRole("country_editor"), "isStaffRole does not recognise country_editor");
      assert((STAFF_ROLES as readonly string[]).includes("country_editor"), "STAFF_ROLES omits country_editor");
      return "STAFF_ROLES and isStaffRole include country_editor";
    });

    await check("dedicated editor can read and edit but cannot publish or verify origin", async () => {
      const permissions = granted(editor);
      assert(permissions.has("countries:editorial:read"), "editor lacks read");
      assert(permissions.has("countries:editorial:write"), "editor lacks write");
      assert(!permissions.has("countries:editorial:publish"), "editor must not publish");
      assert(!permissions.has("countries:origin:review"), "editor must not review origin");
      return [...permissions].sort().join(", ");
    });

    await check("dedicated publisher can publish but cannot edit or verify origin", async () => {
      const permissions = granted(publisher);
      assert(permissions.has("countries:editorial:read"), "publisher lacks read");
      assert(permissions.has("countries:editorial:publish"), "publisher lacks publish");
      assert(!permissions.has("countries:editorial:write"), "publisher must not edit");
      assert(!permissions.has("countries:origin:review"), "publisher must not review origin");
      return [...permissions].sort().join(", ");
    });

    await check("dedicated origin reviewer can verify origin but cannot publish or edit", async () => {
      const permissions = granted(origin);
      assert(permissions.has("countries:origin:review"), "origin reviewer lacks origin review");
      assert(!permissions.has("countries:editorial:publish"), "origin reviewer must not publish");
      assert(!permissions.has("countries:editorial:write"), "origin reviewer must not edit");
      return [...permissions].sort().join(", ");
    });

    await check("ordinary admin still cannot publish, review origin or grant roles", async () => {
      const permissions = granted(ordinaryAdmin);
      assert(permissions.has("countries:editorial:read"), "admin lost country read");
      assert(permissions.has("countries:editorial:write"), "admin lost country write");
      assert(!permissions.has("countries:editorial:publish"), "ordinary admin must not publish");
      assert(!permissions.has("countries:origin:review"), "ordinary admin must not review origin");
      assert(!permissions.has("roles:write"), "ordinary admin must not grant roles");
      assert(!permissions.has("verticals:write"), "ordinary admin must not activate verticals");
      return `${names(ordinaryAdmin).join(",") || "role-less admin"} keeps editorial but withholds publish/origin`;
    });

    await check("super_admin retains every permission", async () => {
      const synthetic = { id: "synthetic", actorType: "ADMIN", roles: [{ role: { name: "super_admin" } }], vendors: [] };
      const permissions = new Set(permissionsFor(synthetic as never));
      const missing = PERMISSIONS.filter((permission) => !permissions.has(permission));
      assert(missing.length === 0, `super_admin is missing ${missing.join(", ")}`);
      return `${permissions.size}/${PERMISSIONS.length} permissions`;
    });

    await check("region-scoped accounts cannot cross country markets", async () => {
      const perms = granted(editorGh);
      assert(perms.has("countries:editorial:write"), "scoped editor lost its write permission");
      assert(regionViolation(editorGh as never, { countryCode: "DZ" }) !== null, "GH editor should be outside DZ");
      assert(regionViolation(editorGh as never, { countryCode: "GH" }) === null, "GH editor should be allowed in GH");
      assert(regionViolation(originNg as never, { countryCode: "GH" }) !== null, "NG origin reviewer should be outside GH");
      assert(regionViolation(originGh as never, { countryCode: "GH" }) === null, "GH origin reviewer should be allowed in GH");
      let status = 0;
      try {
        assertRegion(publisherGh as never, { countryCode: "DZ" }, "country profile");
      } catch (error) {
        status = (error as { status?: number }).status ?? 0;
      }
      assert(status === 403, `scoped publisher DZ region check returned ${status}, expected 403`);
      return "GH scope blocked for DZ; GH scope allowed for GH; publish permission does not widen the region";
    });

    await check("assignable-role allowlist accepts country_editor and rejects unknown roles", async () => {
      const superRole = await prisma.role.findUnique({ where: { name: "super_admin" }, select: { id: true } });
      assert(superRole, "super_admin role row is missing");
      const superUser = await prisma.user.create({
        data: {
          email: `qa-country-role-${run}-super-actor@review.local`,
          name: `QA super actor (${run})`,
          actorType: "ADMIN"
        },
        select: { id: true }
      });
      superActorId = superUser.id;
      await prisma.userRole.create({ data: { userId: superUser.id, roleId: superRole.id } });
      const superActor = await prisma.user.findUnique({
        where: { id: superUser.id },
        include: { roles: { include: { role: true } }, vendors: true }
      });
      assert(superActor, "super actor could not be reloaded");

      await setUserRoles({ actor: superActor as never, userId: editor.id, roles: ["country_editor"] });
      const reloaded = await prisma.user.findUnique({
        where: { id: editor.id },
        include: { roles: { include: { role: true } } }
      });
      assert(reloaded, "editor could not be reloaded after assignment");
      assert(
        reloaded.roles.map((entry) => entry.role.name).join(",") === "country_editor",
        `unexpected roles after assignment: ${reloaded.roles.map((entry) => entry.role.name).join(",")}`
      );

      let unknownStatus = 0;
      try {
        await setUserRoles({ actor: superActor as never, userId: editor.id, roles: ["country_superuser"] });
      } catch (error) {
        unknownStatus = (error as { status?: number }).status ?? 0;
      }
      assert(unknownStatus === 400, `unknown role returned ${unknownStatus}, expected 400`);

      let delegationStatus = 0;
      try {
        await setUserRoles({ actor: editor as never, userId: origin.id, roles: ["country_origin_reviewer"] });
      } catch (error) {
        delegationStatus = (error as { status?: number }).status ?? 0;
      }
      assert(delegationStatus === 403, `editor role delegation returned ${delegationStatus}, expected 403`);
      return "country_editor assignable by super admin; unknown role 400; non-role-admin 403";
    });

    await check("dedicated country role rows exist in REVIEW", async () => {
      const rows = await prisma.role.findMany({
        where: { name: { in: ["country_editor", "country_publisher", "country_origin_reviewer"] } },
        select: { name: true }
      });
      assert(rows.length === 3, `expected 3 country roles, found ${rows.length}`);
      return rows.map((row) => row.name).sort().join(",");
    });

    console.log(
      JSON.stringify(
        {
          database: target.databaseName,
          run,
          accounts: setup.accounts.map((account) => ({
            key: account.key,
            role: account.role,
            scope: account.scopeCountryCode
          }))
        },
        null,
        2
      )
    );
  } finally {
    await cleanupReviewCountryRoles(prisma, run).catch(() => undefined);
    if (superActorId) {
      await prisma.session.deleteMany({ where: { userId: superActorId } }).catch(() => undefined);
      await prisma.auditLog.deleteMany({ where: { actorId: superActorId } }).catch(() => undefined);
      await prisma.systemEvent.deleteMany({ where: { actorId: superActorId } }).catch(() => undefined);
      await prisma.userRole.deleteMany({ where: { userId: superActorId } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { id: superActorId } }).catch(() => undefined);
    }
    const residue = await prisma.user.count({
      where: { email: { startsWith: `qa-country-role-${run}-`, endsWith: "@review.local" } }
    });
    rmSync(credentialsDir, { recursive: true, force: true });
    console.log(JSON.stringify({ cleanup: { remainingRunOwnedUsers: residue, credentialsRemoved: true } }, null, 2));
    if (residue > 0) process.exitCode = 1;
  }

  const failed = results.filter((row) => row.status === "FAIL").length;
  console.log(JSON.stringify({ passed: results.length - failed, failed }, null, 2));
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`COUNTRY_ACCESS_TESTS_FAILED: ${sanitizeCountryReviewError(error)}`);
  process.exitCode = 1;
});
