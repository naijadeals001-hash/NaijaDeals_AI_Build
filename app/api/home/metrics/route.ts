import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["impression", "hero_impression", "hero_click", "card_click", "cta_click", "search"]);
const VARIANTS = new Set(["original", "africa-super-app", "mobility", "commerce"]);

/**
 * Aggregate counter increments only. No visitor id, IP or user id is stored —
 * these are daily totals per variant, which is all the comparison needs.
 */
export async function POST(request: Request) {
  try {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
    const variant = String(body.variant ?? "");
    const kind = String(body.kind ?? "");
    const slide = typeof body.slide === "string" ? body.slide.slice(0, 60) : "";
    if (!VARIANTS.has(variant) || !ALLOWED.has(kind)) return NextResponse.json({ recorded: false }, { status: 202 });
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    await prisma.homeMetric.upsert({
      where: { variantKey_kind_slideSlug_day: { variantKey: variant, kind, slideSlug: slide, day } },
      update: { count: { increment: 1 } },
      create: { variantKey: variant, kind, slideSlug: slide, day, count: 1 }
    });
    return NextResponse.json({ recorded: true }, { status: 202 });
  } catch {
    // Metrics must never break the page.
    return NextResponse.json({ recorded: false }, { status: 202 });
  }
}
