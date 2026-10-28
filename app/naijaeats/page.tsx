import type { Metadata } from "next";
import { NaijaEatsPage } from "@/components/commerce/naijashop";

export const metadata: Metadata = {
  title: "NaijaEats",
  description: "NaijaEats food ordering status in this environment."
};

export default function Page() {
  return <NaijaEatsPage />;
}
