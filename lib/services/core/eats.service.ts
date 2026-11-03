import { prisma } from "@/lib/prisma";

export type EatsMenuItem = {
  id: string;
  name: string;
  description: string | null;
  priceKobo: string;
  available: boolean;
};

export type EatsRestaurant = {
  id: string;
  slug: string;
  name: string;
  cuisine: string;
  market: string;
  address: string;
  phone: string;
  isSample: boolean;
  menuItems: EatsMenuItem[];
};

type RawRestaurant = Omit<EatsRestaurant, "menuItems" | "priceKobo"> & {
  menuItems: Array<{ id: string; name: string; description: string | null; priceKobo: string | number; available: boolean }>;
};

/** Verified kitchens with their available menu items; raw SQL keeps stale dev servers working. */
export async function listEatsRestaurants(): Promise<EatsRestaurant[]> {
  const rows = await prisma.$queryRaw<RawRestaurant[]>`
    SELECT r.id, r.slug, r.name, r.cuisine, r.market, r.address, r.phone, r."isSample",
      COALESCE(
        json_agg(
          json_build_object('id', m.id, 'name', m.name, 'description', m.description, 'priceKobo', m."priceKobo", 'available', m.available)
          ORDER BY m."createdAt"
        ) FILTER (WHERE m.id IS NOT NULL), '[]'
      ) AS "menuItems"
    FROM "Restaurant" r
    LEFT JOIN "MenuItem" m ON m."restaurantId" = r.id AND m.available = true
    WHERE r.status = 'VERIFIED'
    GROUP BY r.id
    ORDER BY r."createdAt" ASC`;

  return rows.map((row) => ({
    ...row,
    menuItems: (row.menuItems ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      priceKobo: String(item.priceKobo),
      available: item.available
    }))
  }));
}
