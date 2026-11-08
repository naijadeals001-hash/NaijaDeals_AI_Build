import { prisma } from "@/lib/prisma";

/**
 * Active hero slides for the public homepage. Admin-managed rows, ordered, with
 * optional scheduling; only routes under /naijastream are accepted as CTAs so a
 * stored slide can never redirect users off-platform.
 */
export async function listHeroSlides() {
  const now = new Date();
  const rows = await prisma.streamHeroSlide.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }
      ]
    },
    orderBy: { sortOrder: "asc" }
  });
  const safe = (href: string) => (href.startsWith("/naijastream") ? href : "/naijastream");
  return rows.map((row) => ({
    id: row.id,
    eyebrow: row.eyebrow,
    headline: row.headline,
    accent: row.accent,
    body: row.body,
    imageUrl: row.imageUrl,
    mobileImageUrl: row.mobileImageUrl,
    primary: { label: row.primaryLabel, href: safe(row.primaryHref) },
    secondary: { label: row.secondaryLabel, href: safe(row.secondaryHref) }
  }));
}

/** Admin: create or update a slide (RBAC enforced by the route). */
export async function upsertHeroSlide(input: {
  id?: string;
  eyebrow: string;
  headline: string;
  accent: string;
  body: string;
  imageUrl: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
  sortOrder: number;
  isActive: boolean;
  adminId: string;
}) {
  const data = {
    eyebrow: input.eyebrow,
    headline: input.headline,
    accent: input.accent,
    body: input.body,
    imageUrl: input.imageUrl,
    primaryLabel: input.primaryLabel,
    primaryHref: input.primaryHref.startsWith("/naijastream") ? input.primaryHref : "/naijastream",
    secondaryLabel: input.secondaryLabel,
    secondaryHref: input.secondaryHref.startsWith("/naijastream") ? input.secondaryHref : "/naijastream",
    sortOrder: input.sortOrder,
    isActive: input.isActive,
    updatedBy: input.adminId
  };
  if (input.id) return prisma.streamHeroSlide.update({ where: { id: input.id }, data });
  return prisma.streamHeroSlide.create({ data });
}
