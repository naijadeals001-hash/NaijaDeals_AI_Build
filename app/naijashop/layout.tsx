import type { ReactNode } from "react";
import { ShopShell } from "@/components/shop/shop-header";

/**
 * Every /naijashop route renders the same header, panels, single main landmark
 * and Marketplace footer. Adding a route below this layout cannot drift into a
 * landing-only header or a second mobile navigation.
 */
export default function NaijaShopLayout({ children }: { children: ReactNode }) {
  return <ShopShell>{children}</ShopShell>;
}
