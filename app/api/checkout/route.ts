import { NextResponse } from "next/server";
import { checkout } from "@/lib/services/core/checkout.service";
import {
  assertSameOrigin,
  jsonError,
  optionalString,
  readJson,
  requireString,
  requireUser
} from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const address = (body.address ?? {}) as Record<string, unknown>;
    const result = await checkout({
      userId: user.id,
      address: {
        label: optionalString(address.label, 60) ?? undefined,
        contactName: requireString(address.contactName, "Contact name", 120),
        contactPhone: requireString(address.contactPhone, "Contact phone", 40),
        countryCode: (requireString(address.countryCode, "Country", 2) || "NG").toUpperCase(),
        state: requireString(address.state, "State", 100),
        city: requireString(address.city, "City", 100),
        line1: requireString(address.line1, "Street address", 200),
        line2: optionalString(address.line2, 200),
        postalCode: optionalString(address.postalCode, 20)
      },
      saveAddress: Boolean(body.saveAddress)
    });
    return NextResponse.json(jsonSafe(result), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
