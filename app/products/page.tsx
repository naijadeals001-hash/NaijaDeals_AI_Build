import type { Metadata } from "next";
import { ProductsPage } from "@/components/sections/products-page";

export const metadata: Metadata = {
  title: "Products",
  description:
    "Every NaijaDeals service in one place: shopping, food, groceries, delivery, rides, stays, gigs, payments, streaming and Aura AI."
};

export default function Page() {
  return <ProductsPage />;
}
