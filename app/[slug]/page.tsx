import type { Metadata } from "next";
import { GenericPage } from "@/components/sections/generic-page";
import { publicRoutes, routeTitles } from "@/lib/routes";

export function generateStaticParams() {
  return publicRoutes.map((slug) => ({ slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const title = routeTitles[params.slug] ?? "NaijaDeals";
  return {
    title,
    description: `${title} for the NaijaDeals.com African super ecosystem.`
  };
}

export default function Page({ params }: { params: { slug: string } }) {
  return <GenericPage slug={params.slug} />;
}
