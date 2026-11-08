import { NextResponse } from "next/server";
import type { ServiceMode } from "@prisma/client";
import { assertSameOrigin, jsonError, optionalString, readJson, requireString, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { createCustomerJob, listOpenGigJobs } from "@/lib/services/gigs/service";
import { oneOf, optionalDate, optionalMoney, pageParams } from "@/lib/gigs/input";

export const dynamic = "force-dynamic";

const MODES: readonly ServiceMode[] = ["LOCAL", "REMOTE", "PROJECT"];

export async function GET(request: Request) {
  try {
    const { params, page, pageSize } = pageParams(request.url);
    const mode = params.get("mode");
    const result = await listOpenGigJobs({
      q: params.get("q")?.slice(0, 120) || undefined,
      category: params.get("category") || undefined,
      mode: mode ? oneOf(mode, MODES, "Mode") : undefined,
      countryCode: params.get("countryCode")?.slice(0, 2).toUpperCase() || undefined,
      page,
      pageSize
    });
    return NextResponse.json(jsonSafe(result));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const job = await createCustomerJob(user.id, {
      categoryId: optionalString(body.categoryId, 60),
      title: requireString(body.title, "Title", 140),
      description: requireString(body.description, "Description", 4000),
      mode: oneOf(body.mode, MODES, "Service mode"),
      budgetKobo: optionalMoney(body.budgetKobo, "Budget"),
      countryCode: requireString(body.countryCode ?? user.countryCode, "Country", 2).toUpperCase(),
      state: requireString(body.state, "State", 80),
      city: optionalString(body.city, 80),
      deadline: optionalDate(body.deadline, "Deadline")
    });
    return NextResponse.json(jsonSafe(job), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
