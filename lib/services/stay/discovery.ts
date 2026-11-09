import { prisma } from "@/lib/prisma";

/**
 * NaijaStay discovery. Published properties only; demonstration rows are marked
 * so the UI can label them and never present generated art as a real listing.
 */

export const STAY_CATEGORIES = [
  { slug: "hotels", label: "Hotels & Resorts" },
  { slug: "serviced-apartments", label: "Serviced Apartments" },
  { slug: "short-term-rentals", label: "Short-Term Rentals" },
  { slug: "long-term-rentals", label: "Long-Term Rentals" },
  { slug: "houses-for-sale", label: "Houses for Sale" },
  { slug: "land-and-plots", label: "Land & Plots" },
  { slug: "student-accommodation", label: "Student Accommodation" },
  { slug: "corporate-stays", label: "Corporate Stays" },
  { slug: "vacation-homes", label: "Vacation Homes" },
  { slug: "event-conference-spaces", label: "Event & Conference Spaces" }
] as const;

export const DESTINATIONS = [
  { slug: "lagos", city: "Lagos", country: "Nigeria", image: "stay-dest-lagos" },
  { slug: "abuja", city: "Abuja", country: "Nigeria", image: "stay-dest-abuja" },
  { slug: "accra", city: "Accra", country: "Ghana", image: "stay-dest-accra" },
  { slug: "nairobi", city: "Nairobi", country: "Kenya", image: "stay-dest-nairobi" },
  { slug: "cape-town", city: "Cape Town", country: "South Africa", image: "stay-dest-capetown" },
  { slug: "kigali", city: "Kigali", country: "Rwanda", image: "stay-dest-kigali" }
] as const;

export type StayCard = {
  id: string;
  slug: string;
  title: string;
  category: string;
  listingType: string;
  city: string;
  country: string;
  nightlyKobo: string;
  salePriceKobo: string | null;
  currency: string;
  imageUrl: string | null;
  imageKind: string;
  isDemo: boolean;
  featured: boolean;
  maxGuests: number;
  bedrooms: number;
  rating: number | null;
  reviewCount: number;
};

const cardSelect = {
  id: true,
  slug: true,
  title: true,
  category: true,
  listingType: true,
  city: true,
  country: true,
  nightlyKobo: true,
  salePriceKobo: true,
  currency: true,
  isDemo: true,
  featured: true,
  maxGuests: true,
  bedrooms: true,
  images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true, kind: true } }
} as const;

async function withRatings(rows: Array<Record<string, unknown> & { id: string; images: Array<{ url: string; kind: string }>; nightlyKobo: bigint; salePriceKobo: bigint | null }>): Promise<StayCard[]> {
  const ids = rows.map((row) => row.id);
  const reviews = ids.length
    ? await prisma.stayReview.groupBy({ by: ["propertyId"], where: { propertyId: { in: ids }, status: "published" }, _avg: { rating: true }, _count: { _all: true } })
    : [];
  const byProperty = new Map(reviews.map((r) => [r.propertyId, r]));
  return rows.map((row) => {
    const r = byProperty.get(row.id);
    return {
      ...row,
      nightlyKobo: row.nightlyKobo.toString(),
      salePriceKobo: row.salePriceKobo === null ? null : row.salePriceKobo.toString(),
      imageUrl: row.images[0]?.url ?? null,
      imageKind: row.images[0]?.kind ?? "photo",
      rating: r?._avg.rating ? Math.round(r._avg.rating * 10) / 10 : null,
      reviewCount: r?._count._all ?? 0
    } as unknown as StayCard;
  });
}

export async function listFeatured() {
  const rows = await prisma.stayProperty.findMany({ where: { status: "published", featured: true }, orderBy: { createdAt: "asc" }, take: 6, select: cardSelect });
  return withRatings(rows as never);
}

export async function searchStay(input: { q?: string; city?: string; category?: string; guests?: number; listingType?: string; take?: number }) {
  const q = (input.q ?? "").trim();
  const rows = await prisma.stayProperty.findMany({
    where: {
      status: "published",
      ...(input.city ? { city: { equals: input.city, mode: "insensitive" } } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.listingType ? { listingType: input.listingType } : {}),
      ...(input.guests ? { maxGuests: { gte: input.guests } } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { city: { contains: q, mode: "insensitive" } },
              { country: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } }
            ]
          }
        : {})
    },
    orderBy: [{ featured: "desc" }, { createdAt: "asc" }],
    take: input.take ?? 40,
    select: cardSelect
  });
  return withRatings(rows as never);
}

/** Countries that actually have published inventory. */
export async function liveCities() {
  const rows = await prisma.stayProperty.findMany({ where: { status: "published" }, select: { city: true, country: true }, distinct: ["city", "country"] });
  return rows.sort((a, b) => a.city.localeCompare(b.city));
}

export function categoryLabel(slug: string) {
  return STAY_CATEGORIES.find((c) => c.slug === slug)?.label ?? slug;
}
