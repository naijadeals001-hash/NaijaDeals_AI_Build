import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { ApiError, assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/services/core/audit.service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    if (newPassword.length < 8 || newPassword.length > 128) throw new ApiError(400, "validation_error", "New password must be between 8 and 128 characters.");
    if (newPassword === currentPassword) throw new ApiError(400, "validation_error", "New password must be different from the current password.");
    const record = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
    if (!record || !(await verifyPassword(currentPassword, record.passwordHash))) {
      throw new ApiError(400, "invalid_current_password", "Current password is incorrect.");
    }
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } }),
      prisma.session.deleteMany({ where: { userId: user.id } })
    ]);
    await recordAudit({ actorId: user.id, action: "account.password_changed", entity: "User", entityId: user.id, metadata: { sessionsRevoked: true } });
    return NextResponse.json({ changed: true, reauthenticate: true });
  } catch (error) {
    return jsonError(error);
  }
}
