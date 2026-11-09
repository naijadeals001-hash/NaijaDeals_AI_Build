import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/services/core/audit.service";
import { VARIANT_KEYS } from "@/lib/home/assignment";

export const dynamic = "force-dynamic";

/** Only paths that exist in this application are accepted as CTA destinations. */
const ALLOWED_HREF = /^\/($|naijashop|naijaeats|naijafresh|naijadrive|naijasend|naijagigs|naijastay|naijastream|pay|aura-ai|wallet|orders|cart|account|sell|partner|install|designs|support|legal|search)(\/[a-z0-9\-/\[\]]*)?$/i;

function safeText(value: unknown, max: number) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new ApiError(400, "validation_error", "Required text field is empty.");
  if (text.length > max) throw new ApiError(400, "validation_error", `Text must be at most ${max} characters.`);
  // Strip control characters and any HTML angle brackets so a headline can never
  // be interpreted as markup, even if it is later rendered outside React.
  return text.replace(/[\u0000-\u001f<>]/g, "").slice(0, max);
}

function safeHref(value: unknown, required = true) {
  const href = typeof value === "string" ? value.trim() : "";
  if (!href && !required) return null;
  if (!ALLOWED_HREF.test(href)) throw new ApiError(400, "invalid_href", `"${href}" is not an existing NaijaDeals route.`);
  return href;
}

export async function GET() {
  try {
    await requireAdminPermission("dashboard:read");
    const [variants, slides, metrics] = await Promise.all([
      prisma.homeVariant.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.homeHeroSlide.findMany({ orderBy: [{ variantKey: "asc" }, { sortOrder: "asc" }] }),
      prisma.homeMetric.groupBy({ by: ["variantKey", "kind"], _sum: { count: true } })
    ]);
    return NextResponse.json(jsonSafe({ variants, slides, metrics }));
  } catch (error) {
    return jsonError(error);
  }
}

/** Update allocation/enabled state of variants. Percentages of enabled variants must total 100. */
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("homepage:write");
    const body = await readJson<Record<string, unknown>>(request);
    const incoming = Array.isArray(body.variants) ? (body.variants as Record<string, unknown>[]) : [];
    if (!incoming.length) throw new ApiError(400, "validation_error", "No variants supplied.");

    const current = await prisma.homeVariant.findMany();
    const byKey = new Map(current.map((row) => [row.key, row]));
    const next = incoming.map((row) => {
      const key = String(row.key ?? "");
      if (!VARIANT_KEYS.includes(key as never)) throw new ApiError(400, "invalid_variant", `Unknown variant ${key}.`);
      const existing = byKey.get(key);
      const allocation = Number(row.allocation ?? existing?.allocation ?? 25);
      if (!Number.isInteger(allocation) || allocation < 0 || allocation > 100) throw new ApiError(400, "invalid_allocation", "Allocation must be a whole number from 0 to 100.");
      const revision = Number(row.revision ?? existing?.revision ?? 1);
      if (existing && revision !== existing.revision) throw new ApiError(409, "stale_revision", "Someone else changed this design. Reload before saving.");
      return { key, enabled: row.enabled === undefined ? existing?.enabled ?? true : Boolean(row.enabled), allocation, revision: (existing?.revision ?? 1) + 1, existing };
    });

    const total = next.filter((row) => row.enabled).reduce((sum, row) => sum + row.allocation, 0);
    if (total !== 100) throw new ApiError(409, "allocation_total", `Enabled designs must total 100%; they currently total ${total}%.`);

    await prisma.$transaction(async (tx) => {
      for (const row of next) {
        if (row.existing) {
          await tx.homeVariant.update({ where: { key: row.key }, data: { enabled: row.enabled, allocation: row.allocation, revision: row.revision } });
        } else {
          await tx.homeVariant.create({ data: { key: row.key, name: row.key, description: "", enabled: row.enabled, allocation: row.allocation } });
        }
      }
    });
    await recordAudit({ actorId: admin.id, action: "homepage.variants_updated", entity: "HomeVariant", metadata: { variants: next.map((row) => ({ key: row.key, enabled: row.enabled, allocation: row.allocation })) } });
    return NextResponse.json(jsonSafe({ saved: true }));
  } catch (error) {
    return jsonError(error);
  }
}

/** Upsert one hero slide. Copy is sanitised and the destination must be a real route. */
export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("homepage:write");
    const body = await readJson<Record<string, unknown>>(request);
    const variantKey = String(body.variantKey ?? "");
    if (!VARIANT_KEYS.includes(variantKey as never)) throw new ApiError(400, "invalid_variant", "Unknown variant.");
    const slug = String(body.slug ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
    if (!slug) throw new ApiError(400, "validation_error", "Slide slug is required.");
    const alt = safeText(body.alt, 200);
    const imageId = typeof body.imageId === "string" && /^[a-z0-9-]{1,60}$/.test(body.imageId) ? body.imageId : null;

    const data = {
      headline: safeText(body.headline, 90),
      body: safeText(body.body, 220),
      ctaLabel: safeText(body.ctaLabel, 30),
      ctaHref: safeHref(body.ctaHref) as string,
      secondaryLabel: typeof body.secondaryLabel === "string" && body.secondaryLabel.trim() ? safeText(body.secondaryLabel, 30) : null,
      secondaryHref: safeHref(body.secondaryHref, false),
      imageId,
      alt,
      enabled: body.enabled === undefined ? true : Boolean(body.enabled),
      sortOrder: Number.isInteger(Number(body.sortOrder)) ? Number(body.sortOrder) : 0
    };
    const slide = await prisma.homeHeroSlide.upsert({
      where: { variantKey_slug: { variantKey, slug } },
      update: data,
      create: { variantKey, slug, ...data }
    });
    await recordAudit({ actorId: admin.id, action: "homepage.slide_saved", entity: "HomeHeroSlide", entityId: slide.id, metadata: { variantKey, slug, ctaHref: data.ctaHref } });
    return NextResponse.json(jsonSafe(slide));
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("homepage:write");
    const body = await readJson<Record<string, unknown>>(request);
    const id = String(body.id ?? "");
    const slide = await prisma.homeHeroSlide.delete({ where: { id } });
    await recordAudit({ actorId: admin.id, action: "homepage.slide_deleted", entity: "HomeHeroSlide", entityId: id, metadata: { variantKey: slide.variantKey, slug: slide.slug } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return jsonError(error);
  }
}
