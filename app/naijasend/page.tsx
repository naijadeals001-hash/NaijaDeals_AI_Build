import type { Metadata } from "next";
import { NaijaSendPage } from "@/components/commerce/naijashop";

export const metadata: Metadata = {
  title: "NaijaSend",
  description: "NaijaSend delivery workflow for NaijaDeals marketplace orders."
};

export default function Page() {
  return <NaijaSendPage />;
}
