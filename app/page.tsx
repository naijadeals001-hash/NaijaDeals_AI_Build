import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { loadSlides, resolveVariant } from "@/lib/home/assignment";
import { EcosystemHome } from "@/components/sections/ecosystem-home";
import { CommerceDashboard, MobilityDashboard, SuperAppDashboard, type DashboardData, type SlideOverride } from "@/components/home/dashboard-views";
import { DesignSwitcher } from "@/components/home/design-switcher";

export const dynamic = "force-dynamic";

/** Seeded demo/fixture rows must never appear as real deals on the homepage. */
const FIXTURE_NAME = /^(variant fixture|test |upload test|last unit|product test)/i;

/**
 * The homepage router. Dashboard 1 is the untouched EcosystemHome; the other
 * three share the new component set. Which one a visitor sees is resolved from
 * a stable assignment, and a manual choice always wins.
 */
export default async function HomePage() {
  const { variant, manual, visitorId } = await resolveVariant();

  if (variant === "original") {
    return <EcosystemHome />;
  }

  const session = await getSessionUser();
  const [deals, cartItems, heroRows] = await Promise.all([
    prisma.product.findMany({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, name: true, slug: true, priceKobo: true, compareAtKobo: true, isSample: true, images: { take: 1, select: { url: true } }, stock: { select: { quantity: true } } }
    }),
    session ? prisma.cartItem.count({ where: { cart: { userId: session.id } } }).catch(() => 0) : Promise.resolve(0),
    loadSlides(variant).catch(() => [])
  ]);

  const data: DashboardData = {
    cartCount: cartItems,
    // Only in-stock, non-fixture products appear; a deal badge needs a real compare-at price.
    deals: deals
      .filter((product) => (product.stock?.quantity ?? 0) > 0)
      .filter((product) => !product.isSample && !FIXTURE_NAME.test(product.name) && !/mw[0-9a-z]{8,}/i.test(product.slug))
      .slice(0, 8)
      .map((product) => ({ id: product.id, name: product.name, slug: product.slug, priceKobo: String(product.priceKobo), compareKobo: product.compareAtKobo === null ? null : String(product.compareAtKobo), image: product.images[0]?.url ?? null })),
    heroOverrides: heroRows.map((row) => ({
      slug: row.slug,
      headline: row.headline,
      body: row.body,
      ctaLabel: row.ctaLabel,
      ctaHref: row.ctaHref,
      secondaryLabel: row.secondaryLabel,
      secondaryHref: row.secondaryHref,
      imageId: row.imageId,
      alt: row.alt
    })) as SlideOverride[]
  };

  const design =
    variant === "mobility" ? (
      <MobilityDashboard variantKey={variant} data={data} />
    ) : variant === "commerce" ? (
      <CommerceDashboard variantKey={variant} data={data} />
    ) : (
      <SuperAppDashboard variantKey={variant} data={data} />
    );

  return (
    <>
      {design}
      <DesignSwitcher current={variant} manual={manual} visitorId={visitorId} />
    </>
  );
}
