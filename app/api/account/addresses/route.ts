import { NextResponse } from "next/server";
import { createAddress, listAddresses } from "@/lib/services/core/account.service";
import { assertSameOrigin, jsonError, optionalString, readJson, requireString, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(jsonSafe(await listAddresses(user.id)));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const address = await createAddress(user.id, {
      label: optionalString(body.label, 60) ?? undefined,
      countryCode: (requireString(body.countryCode, "Country", 2) || "NG").toUpperCase(),
      state: requireString(body.state, "State", 100),
      city: requireString(body.city, "City", 100),
      line1: requireString(body.line1, "Street address", 200),
      line2: optionalString(body.line2, 200),
      phone: requireString(body.phone, "Phone", 40),
      postalCode: optionalString(body.postalCode, 20),
      isDefault: Boolean(body.isDefault)
    });
    return NextResponse.json(jsonSafe(address), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
