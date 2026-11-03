import type { Metadata } from "next";
import { EatsOrderClient } from "@/components/commerce/eats-order-client";

export const metadata: Metadata = { title: "Food order" };

export default function Page({ params }: { params: { id: string } }) {
  return <EatsOrderClient id={params.id} />;
}
