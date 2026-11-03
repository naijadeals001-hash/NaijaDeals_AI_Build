import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireSuperAdmin } from "@/lib/auth/guard";
import { listPaymentMethods } from "@/lib/payments/service";

export const dynamic = "force-dynamic";

/**
 * Super-admin-only platform settings snapshot.
 *
 * Returns capability and configuration state only. Provider secrets are never
 * read or returned here; payment methods expose their existing public
 * `configured` flag and reason.
 */
export async function GET() {
  try {
    const admin = await requireSuperAdmin();

    const [users, roles, vendors, orders] = await Promise.all([
      prisma.user.count(),
      prisma.role.findMany({ select: { name: true, description: true }, orderBy: { name: "asc" } }),
      prisma.vendor.count(),
      prisma.order.count()
    ]);

    return NextResponse.json({
      actor: { id: admin.id, name: admin.name, email: admin.email },
      counts: { users, roles: roles.length, vendors, orders },
      roles,
      paymentMethods: listPaymentMethods("NG"),
      environment: {
        nodeEnv: process.env.NODE_ENV ?? "unknown",
        appUrlConfigured: Boolean(process.env.NEXT_PUBLIC_APP_URL),
        databaseConfigured: Boolean(process.env.DATABASE_URL)
      },
      loadedAt: new Date().toISOString()
    });
  } catch (error) {
    return jsonError(error);
  }
}
