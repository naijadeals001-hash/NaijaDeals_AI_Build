import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { createSession, sessionCookieOptions, SESSION_COOKIE, toPublicSessionUser } from "@/lib/auth/session";
import { ApiError, assertSameOrigin, jsonError, readJson, requireString } from "@/lib/auth/guard";
import { ensureWallet } from "@/lib/payments/service";
import { recordAudit } from "@/lib/services/core/audit.service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJson<Record<string, unknown>>(request);
    const name = requireString(body.name, "Name", 120);
    const email = requireString(body.email, "Email", 254).toLowerCase();
    const password = requireString(body.password, "Password", 200);
    const phone = typeof body.phone === "string" && body.phone.trim() ? body.phone.trim() : null;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ApiError(400, "validation_error", "Enter a valid email address.");
    }
    if (password.length < 8) throw new ApiError(400, "validation_error", "Password must be at least 8 characters.");

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new ApiError(409, "email_taken", "An account with this email already exists.");

    const customerRole = await prisma.role.upsert({
      where: { name: "customer" },
      update: {},
      create: { name: "customer", description: "Buyer account" }
    });
    const passwordHash = await hashPassword(password);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          name,
          phone,
          passwordHash,
          actorType: "CUSTOMER",
          roles: { create: { roleId: customerRole.id } }
        },
        include: { roles: { include: { role: true } }, vendors: true }
      });
      await ensureWallet(tx, { userId: created.id, ownerType: "CUSTOMER" });
      await recordAudit({
        tx,
        actorId: created.id,
        action: "auth.registered",
        entity: "User",
        entityId: created.id,
        metadata: { email }
      });
      return created;
    });

    const session = await createSession(user.id, request.headers.get("user-agent"));
    const response = NextResponse.json({ user: await toPublicSessionUser(user) }, { status: 201 });
    response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.maxAge));
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
