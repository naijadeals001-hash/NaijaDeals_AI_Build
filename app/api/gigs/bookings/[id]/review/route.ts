import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireNumber, requireString, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { createBookingReview } from "@/lib/services/gigs/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const review = await createBookingReview(user.id, params.id, {
      rating: requireNumber(body.rating, "Rating", 1, 5),
      comment: requireString(body.comment, "Comment", 2000)
    });
    return NextResponse.json(jsonSafe(review), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
