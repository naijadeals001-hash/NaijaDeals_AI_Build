import { prisma } from "@/lib/prisma";
import { EcosystemHome2026, type HomeProduct } from "@/components/home/ecosystem-home-2026";

export const dynamic = "force-dynamic";

/** Seeded demo/fixture rows must never appear as real deals on the homepage. */
const FIXTURE_NAME = /^(variant fixture|test |upload test|last unit|product test|refund product)/i;

function naira(kobo: bigint | number | string) {
  return `₦${(Number(kobo) / 100).toLocaleString("en-NG")}`;
}

/**
 * Local fixture vendors are used by the test seeds. A listing is only eligible
 * for the homepage rail when it has a real image and a non-fixture vendor; the
 * section is omitted entirely when the catalogue has nothing genuine to show.
 */
function isGenuineListing(product: {
  isSample: boolean;
  name: string;
  slug: string;
  images: { url: string }[];
  vendor: { name: string; owner: { email: string } | null } | null;
}) {
  if (product.isSample) return false;
  if (FIXTURE_NAME.test(product.name) || /mw[0-9a-z]{8,}/i.test(product.slug)) return false;
  if (!product.images[0]?.url) return false;
  if (!product.vendor) return false;
  if (/demo|fixture|preview only/i.test(product.vendor.name)) return false;
  if (product.vendor.owner?.email?.toLowerCase().endsWith("@naijadeals.local")) return false;
  return true;
}

/**
 * The public ecosystem homepage.
 *
 * The four legacy design variants were retired from `/` with the 2026-11
 * direction: every visitor now gets the same light, mobility-led NaijaDeals
 * entrance. The variant code remains in the repository for recovery only; it
 * is no longer rendered here or offered by the public navigation.
 */
export default async function HomePage() {
  const deals = await prisma.product
    .findMany({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        name: true,
        slug: true,
        priceKobo: true,
        isSample: true,
        images: { take: 1, select: { url: true } },
        stock: { select: { quantity: true } },
        vendor: { select: { name: true, owner: { select: { email: true } } } }
      }
    })
    .catch(() => []);

  const products: HomeProduct[] = deals
    .filter((product) => (product.stock?.quantity ?? 0) > 0)
    .filter(isGenuineListing)
    .slice(0, 4)
    .map((product) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      price: naira(product.priceKobo),
      image: product.images[0]?.url ?? null
    }));

  return <EcosystemHome2026 products={products} />;
}
