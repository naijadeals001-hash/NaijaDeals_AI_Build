import { prisma } from "@/lib/prisma";

/**
 * NaijaFresh catalogue reads.
 *
 * Produce is priced per agricultural unit (kg, tuber, bunch, tray, bag…). The
 * unit is shown next to every price because comparing "₦3,500" across a tuber
 * and a kilogram is meaningless otherwise.
 */

export const FRESH_CATEGORIES = [
  { slug: "tomatoes-peppers", label: "Tomatoes & Peppers" },
  { slug: "vegetables-ugu", label: "Vegetables & Ugu Leaves" },
  { slug: "fruits", label: "Fruits" },
  { slug: "yam-cassava", label: "Yam & Cassava" },
  { slug: "grains-beans", label: "Grains & Beans" },
  { slug: "plantain", label: "Plantain" },
  { slug: "poultry-eggs", label: "Poultry & Eggs" },
  { slug: "fish-seafood", label: "Fish & Seafood" },
  { slug: "herbs-spices", label: "Herbs & Spices" }
] as const;

export type FreshCategorySlug = (typeof FRESH_CATEGORIES)[number]["slug"];

export function isFreshCategory(slug: string | undefined): slug is FreshCategorySlug {
  return FRESH_CATEGORIES.some((category) => category.slug === slug);
}

export type FreshListing = {
  id: string;
  slug: string;
  name: string;
  category: string;
  unit: string;
  priceKobo: string;
  quantity: number;
  available: boolean;
  description: string | null;
  imageUrl: string | null;
  farm: { id: string; name: string; slug: string; city: string; state: string; country: string; verified: boolean };
};

export type FreshFarm = {
  id: string;
  slug: string;
  name: string;
  farmerName: string;
  city: string;
  state: string;
  country: string;
  specialities: string[];
  verified: boolean;
  listingCount: number;
  avatarUrl: string | null;
  coverUrl: string | null;
  isSample: boolean;
};

const listingSelect = {
  id: true,
  slug: true,
  name: true,
  category: true,
  unit: true,
  priceKobo: true,
  quantity: true,
  available: true,
  description: true,
  imageUrl: true,
  farm: { select: { id: true, name: true, slug: true, city: true, state: true, country: true, verified: true } }
} as const;

export async function listProduce(options: { category?: string; q?: string; country?: string; take?: number } = {}): Promise<FreshListing[]> {
  const query = (options.q ?? "").trim();
  const rows = await prisma.produceListing.findMany({
    where: {
      available: true,
      farm: { verified: true },
      ...(options.category ? { category: options.category } : {}),
      ...(options.country ? { farm: { verified: true, country: options.country } } : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { description: { contains: query, mode: "insensitive" } },
              { farm: { name: { contains: query, mode: "insensitive" } } },
              { farm: { country: { contains: query, mode: "insensitive" } } }
            ]
          }
        : {})
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    take: options.take ?? 60,
    select: listingSelect
  });
  return rows.map((row) => ({ ...row, priceKobo: row.priceKobo.toString() }));
}

export async function listFarms(take = 24): Promise<FreshFarm[]> {
  const rows = await prisma.farm.findMany({
    where: { verified: true },
    orderBy: { createdAt: "asc" },
    take,
    select: {
      id: true,
      slug: true,
      name: true,
      farmerName: true,
      city: true,
      state: true,
      country: true,
      specialities: true,
      verified: true,
      avatarUrl: true,
      coverUrl: true,
      isSample: true,
      _count: { select: { listings: true } }
    }
  });
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    farmerName: row.farmerName,
    city: row.city,
    state: row.state,
    country: row.country,
    specialities: row.specialities,
    verified: row.verified,
    listingCount: row._count.listings,
    avatarUrl: row.avatarUrl,
    coverUrl: row.coverUrl,
    isSample: row.isSample
  }));
}

export async function categorySummary() {
  const rows = await prisma.produceListing.groupBy({ by: ["category"], where: { available: true, farm: { verified: true } }, _count: { _all: true } });
  const counts = new Map(rows.map((row) => [row.category, row._count._all]));
  return FRESH_CATEGORIES.map((category) => ({ ...category, listings: counts.get(category.slug) ?? 0 }));
}

export async function getFarmBySlug(slug: string) {
  return prisma.farm.findFirst({
    where: { slug, verified: true },
    select: {
      id: true,
      slug: true,
      name: true,
      farmerName: true,
      description: true,
      city: true,
      state: true,
      country: true,
      specialities: true,
      verified: true,
      coverUrl: true,
      avatarUrl: true,
      isSample: true,
      deliveryFeeKobo: true,
      prepMinMinutes: true,
      prepMaxMinutes: true,
      listings: { where: { available: true }, select: listingSelect }
    }
  });
}

/** Countries with at least one live listing, for the shop filter. */
export async function countryFacets() {
  const rows = await prisma.farm.groupBy({ by: ["country"], where: { verified: true, listings: { some: { available: true } } }, _count: { _all: true } });
  return rows.map((row) => ({ country: row.country, farms: row._count._all })).sort((a, b) => b.farms - a.farms || a.country.localeCompare(b.country));
}
