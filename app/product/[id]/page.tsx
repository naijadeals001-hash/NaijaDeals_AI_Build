import type { Metadata } from "next";
import { ProductDetailClient } from "@/components/functional/product-detail-client";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: "Product detail",
    description: "NaijaDeals product detail page"
  };
}

export default function ProductDetail({ params }: { params: { id: string } }) {
  return <ProductDetailClient id={params.id} />;
}
