import { NextResponse } from "next/server";
import type { ServiceMode } from "@prisma/client";
import { assertSameOrigin, jsonError, optionalString, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { listBookingsForUser, requestBooking } from "@/lib/services/gigs/service";
import { oneOf, optionalDate, optionalMoney } from "@/lib/gigs/input";
import { ApiError } from "@/lib/auth/api-error";

export const dynamic = "force-dynamic";

const MODES: readonly ServiceMode[] = ["LOCAL", "REMOTE", "PROJECT"];

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(jsonSafe(await listBookingsForUser(user.id)));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const listingId = optionalString(body.listingId, 60) ?? undefined;
    const professionalProfileId = optionalString(body.professionalProfileId, 60) ?? undefined;
    if (!listingId && !professionalProfileId) {
      throw new ApiError(400, "target_required", "Choose a service listing or a professional.");
    }
    const booking = await requestBooking(user.id, {
      listingId,
      professionalProfileId,
      title: optionalString(body.title, 140) ?? undefined,
      description: optionalString(body.description, 3000) ?? undefined,
      mode: body.mode === undefined ? undefined : oneOf(body.mode, MODES, "Service mode"),
      scheduledAt: optionalDate(body.scheduledAt, "Scheduled date"),
      address: optionalString(body.address, 300),
      amountKobo: optionalMoney(body.amountKobo, "Amount") ?? undefined
    });
    return NextResponse.json(jsonSafe(booking), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
