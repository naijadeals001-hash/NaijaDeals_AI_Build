import { NextResponse } from "next/server";
import { jsonError } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { listPlans } from "@/lib/services/stream/subscriptions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(jsonSafe({ plans: await listPlans() }));
  } catch (error) {
    return jsonError(error);
  }
}
