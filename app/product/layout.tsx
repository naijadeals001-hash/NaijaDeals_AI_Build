import type { ReactNode } from "react";
import { ShopShell } from "@/components/shop/shop-header";

/**
 * Product detail is a Marketplace journey: every variant (slug or id, gallery,
 * image-less, unavailable) renders inside the same Shop header, location state,
 * navigation and footer as the storefront, department and search routes.
 * Keeping this in the route layout means no product state can drift back to the
 * legacy ecosystem chrome or lose the shared shell.
 */
export default function ProductLayout({ children }: { children: ReactNode }) {
  return (
    <ShopShell>
      <div className="mx-auto w-full max-w-[1180px] px-3 py-5 sm:px-5 lg:px-8 lg:py-7">{children}</div>
    </ShopShell>
  );
}
