import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listAssignableRoles, setUserRoles } from "@/lib/services/core/admin.service";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/**
 * Role administration for platform staff.
 *
 * Guarded by the `roles:write` permission, which only super administrators hold.
 * The service enforces the invariants (no self-editing, no privilege delegation,
 * last super administrator protection) and writes the before/after audit record
 * in the same transaction as the change.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdminPermission("roles:write");
    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        email: true,
        actorType: true,
        scopeCountryCode: true,
        scopeCityCode: true,
        roles: { include: { role: true } }
      }
    });
    if (!user) {
      return NextResponse.json({ error: "User not found.", code: "user_not_found" }, { status: 404 });
    }
    return NextResponse.json(jsonSafe({ user, assignableRoles: await listAssignableRoles() }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("roles:write");
    const body = await readJson<Record<string, unknown>>(request);

    if (!Array.isArray(body.roles) || body.roles.some((role) => typeof role !== "string")) {
      return NextResponse.json({ error: "roles must be an array of role names.", code: "validation_error" }, { status: 400 });
    }

    const scopeCountryCode =
      body.scopeCountryCode === undefined ? undefined : body.scopeCountryCode === null ? null : String(body.scopeCountryCode).toUpperCase();
    const scopeCityCode =
      body.scopeCityCode === undefined ? undefined : body.scopeCityCode === null ? null : String(body.scopeCityCode).toLowerCase();

    const user = await setUserRoles({
      actor: admin,
      userId: params.id,
      roles: body.roles as string[],
      scopeCountryCode,
      scopeCityCode
    });

    return NextResponse.json(jsonSafe(user));
  } catch (error) {
    return jsonError(error);
  }
}
