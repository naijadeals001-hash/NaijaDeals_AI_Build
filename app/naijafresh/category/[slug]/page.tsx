import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FRESH_CATEGORIES, isFreshCategory, listProduce } from "@/lib/services/fresh/catalogue";
import { ProduceCard } from "@/components/fresh/fresh-sections";
import { produceImage } from "@/lib/services/fresh/images";
import { FreshEmpty, FreshHeading, FreshPage } from "@/components/fresh/fresh-page";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return FRESH_CATEGORIES.map((row) => ({ slug: row.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const category = FRESH_CATEGORIES.find((row) => row.slug === params.slug);
  return { title: category ? `${category.label} — NaijaFresh` : "Category — NaijaFresh", alternates: { canonical: `/naijafresh/category/${params.slug}` } };
}

export default async function FreshCategoryPage({ params }: { params: { slug: string } }) {
  if (!isFreshCategory(params.slug)) notFound();
  const category = FRESH_CATEGORIES.find((row) => row.slug === params.slug)!;
  const listings = await listProduce({ category: params.slug, take: 120 });
  return (
    <FreshPage>
      <FreshHeading eyebrow={category.label} title={category.label} description={`Fresh ${category.label.toLowerCase()} sold directly by verified African farms. Each price is per the unit shown.`} />
      {listings.length ? (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {listings.map((listing) => (
            <ProduceCard key={listing.id} listing={listing} variant="grid" image={produceImage(listing)} />
          ))}
        </ul>
      ) : (
        <FreshEmpty title="Nothing in this category yet" body="No farm has published produce in this category. Seasonal harvests appear here when they are listed." cta={{ href: "/naijafresh/shop", label: "Browse all produce" }} />
      )}
    </FreshPage>
  );
}
