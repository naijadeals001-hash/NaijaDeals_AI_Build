import { NextResponse } from "next/server";
import type { ServiceMode } from "@prisma/client";
import { assertSameOrigin, jsonError, optionalString, readJson, requireString, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import {
  applyAsProfessional,
  getProfessionalForUser,
  professionalOverview,
  updateProfessionalProfile,
  upsertAvailability
} from "@/lib/services/gigs/service";
import { optionalInt, stringList } from "@/lib/gigs/input";
import { ApiError } from "@/lib/auth/api-error";

export const dynamic = "force-dynamic";

const MODES: readonly ServiceMode[] = ["LOCAL", "REMOTE", "PROJECT"];

function modeList(value: unknown): ServiceMode[] {
  const modes = stringList(value, "Service modes", 3);
  if (modes.length === 0 || modes.some((mode) => !(MODES as readonly string[]).includes(mode))) {
    throw new ApiError(400, "invalid_modes", "Choose at least one service mode: LOCAL, REMOTE or PROJECT.");
  }
  return modes as ServiceMode[];
}

export async function GET() {
  try {
    const user = await requireUser();
    const [overview, profile] = await Promise.all([professionalOverview(user.id), getProfessionalForUser(user.id)]);
    return NextResponse.json(jsonSafe({ profile, overview }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const profile = await applyAsProfessional(user.id, {
      displayName: requireString(body.displayName, "Display name", 80),
      headline: requireString(body.headline, "Headline", 140),
      bio: requireString(body.bio, "Bio", 3000),
      countryCode: requireString(body.countryCode ?? user.countryCode, "Country", 2).toUpperCase(),
      state: requireString(body.state, "State", 80),
      city: requireString(body.city, "City", 80),
      serviceModes: modeList(body.serviceModes),
      categoryIds: stringList(body.categoryIds, "Categories", 4),
      languages: stringList(body.languages, "Languages", 8),
      yearsExperience: optionalInt(body.yearsExperience, "Years of experience", 0, 60),
      avatarUrl: optionalString(body.avatarUrl, 500)
    });
    return NextResponse.json(jsonSafe(profile), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const profile = await updateProfessionalProfile(user.id, {
      displayName: body.displayName === undefined ? undefined : requireString(body.displayName, "Display name", 80),
      headline: body.headline === undefined ? undefined : requireString(body.headline, "Headline", 140),
      bio: body.bio === undefined ? undefined : requireString(body.bio, "Bio", 3000),
      countryCode: body.countryCode === undefined ? undefined : requireString(body.countryCode, "Country", 2).toUpperCase(),
      state: body.state === undefined ? undefined : requireString(body.state, "State", 80),
      city: body.city === undefined ? undefined : requireString(body.city, "City", 80),
      serviceModes: body.serviceModes === undefined ? undefined : modeList(body.serviceModes),
      languages: body.languages === undefined ? undefined : stringList(body.languages, "Languages", 8),
      yearsExperience: body.yearsExperience === undefined ? undefined : optionalInt(body.yearsExperience, "Years of experience", 0, 60),
      responseMinutes: body.responseMinutes === undefined ? undefined : optionalInt(body.responseMinutes, "Response time", 1, 10080),
      avatarUrl: body.avatarUrl === undefined ? undefined : optionalString(body.avatarUrl, 500),
      published: body.published === undefined ? undefined : Boolean(body.published),
      categoryIds: body.categoryIds === undefined ? undefined : stringList(body.categoryIds, "Categories", 4)
    });
    return NextResponse.json(jsonSafe(profile));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<{ slots?: unknown }>(request);
    if (!Array.isArray(body.slots)) throw new ApiError(400, "invalid_slots", "Slots must be a list.");
    const slots = body.slots.slice(0, 21).map((slot) => {
      const value = slot as Record<string, unknown>;
      return {
        weekday: Number(value.weekday),
        startMinute: Number(value.startMinute),
        endMinute: Number(value.endMinute)
      };
    });
    const availability = await upsertAvailability(user.id, slots);
    return NextResponse.json(jsonSafe(availability));
  } catch (error) {
    return jsonError(error);
  }
}
