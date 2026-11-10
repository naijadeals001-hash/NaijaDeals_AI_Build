import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { jsonError, requireUser, assertSameOrigin } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/**
 * Personalisation and privacy choices.
 *
 * Everything defaults to off. When personalisation is switched off, stored
 * preferences are cleared rather than kept dormant, so "off" means the data is
 * gone rather than merely ignored.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const pref = await prisma.auraPreference.findUnique({ where: { userId: user.id } });
    const conversationCount = await prisma.auraConversation.count({ where: { userId: user.id } });
    const savedCount = await prisma.auraMessage.count({ where: { saved: true, conversation: { userId: user.id } } });
    return NextResponse.json(
      jsonSafe({
        preferences: {
          personalised: pref?.personalised ?? false,
          useSavedPreferences: pref?.useSavedPreferences ?? false,
          savedPreferences: pref?.savedPreferences ?? null,
          preferredCity: pref?.preferredCity ?? null,
          preferredArea: pref?.preferredArea ?? null
        },
        conversationCount,
        savedCount
      })
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await assertSameOrigin(request);
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));

    const personalised = Boolean(body?.personalised);
    const useSavedPreferences = personalised ? Boolean(body?.useSavedPreferences) : false;
    const notes = personalised && typeof body?.savedPreferences === "string" ? body.savedPreferences.slice(0, 500) : null;
    const city = typeof body?.preferredCity === "string" ? body.preferredCity.trim().slice(0, 60) || null : null;
    const area = typeof body?.preferredArea === "string" ? body.preferredArea.trim().slice(0, 60) || null : null;

    const preference = await prisma.auraPreference.upsert({
      where: { userId: user.id },
      update: {
        personalised,
        useSavedPreferences,
        savedPreferences: notes ? ({ notes } as never) : Prisma.DbNull,
        preferredCity: personalised ? city : null,
        preferredArea: personalised ? area : null
      },
      create: {
        userId: user.id,
        personalised,
        useSavedPreferences,
        savedPreferences: notes ? ({ notes } as never) : undefined,
        preferredCity: personalised ? city : null,
        preferredArea: personalised ? area : null
      }
    });
    return NextResponse.json(jsonSafe({ preferences: preference }));
  } catch (error) {
    return jsonError(error);
  }
}

/** Clears this user's conversations and plans, or their preferences. Nothing else. */
export async function DELETE(request: NextRequest) {
  try {
    await assertSameOrigin(request);
    const user = await requireUser();
    const scope = request.nextUrl.searchParams.get("scope") ?? "conversations";
    if (scope === "conversations") {
      const removed = await prisma.auraConversation.deleteMany({ where: { userId: user.id } });
      await prisma.auraPlan.deleteMany({ where: { userId: user.id } });
      return NextResponse.json({ ok: true, removed: removed.count });
    }
    if (scope === "preferences") {
      await prisma.auraPreference.deleteMany({ where: { userId: user.id } });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown scope.", code: "invalid_scope" }, { status: 400 });
  } catch (error) {
    return jsonError(error);
  }
}
