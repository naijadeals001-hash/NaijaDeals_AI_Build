"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Home, ReceiptText, Store, User } from "lucide-react";

/**
 * Mobile bottom navigation from the approved mockup. Padding accounts for the
 * device safe area, and pages reserve bottom space so this never covers a cart
 * or checkout control.
 */
export function EatsBottomNav({ cartCount }: { cartCount: number }) {
  const pathname = usePathname();
  const items = [
    { href: "/naijaeats", label: "Home", icon: Home },
    { href: "/naijaeats/restaurants", label: "Restaurants", icon: Store },
    { href: "/naijaeats/orders", label: "Orders", icon: ReceiptText, badge: cartCount },
    { href: "/naijaeats/favourites", label: "Favourites", icon: Heart },
    { href: "/account", label: "Account", icon: User }
  ];

  return (
    <nav aria-label="NaijaEats navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-[#eef1ef] bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const active = item.href === "/naijaeats" ? pathname === "/naijaeats" : pathname?.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold ${active ? "text-[#f26b21]" : "text-[#5d6d64]"}`}
              >
                <item.icon className="h-5 w-5" aria-hidden />
                {item.label}
                {item.badge ? (
                  <span className="absolute right-[22%] top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#f26b21] px-1 text-[9px] font-black text-white">{item.badge}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
