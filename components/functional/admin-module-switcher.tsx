"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Grid,
  ShoppingBag,
  Utensils,
  Car,
  Package,
  Briefcase,
  Home,
  Music,
  CreditCard,
  Apple,
  Sparkles,
} from "lucide-react";

export interface ModuleConfig {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  href: string;
  roles?: string[];
}

export const ecosystemModules: ModuleConfig[] = [
  {
    id: "ecosystem",
    label: "Ecosystem Overview",
    shortLabel: "Ecosystem",
    description: "Unified view across all modules",
    icon: <Grid className="h-5 w-5" />,
    color: "text-[#00E676]",
    bgColor: "bg-[#00E676]/10 border-[#00E676]/30",
    href: "/admin",
  },
  {
    id: "shop",
    label: "NaijaShop Commerce",
    shortLabel: "Shop",
    description: "Marketplace, products & sellers",
    icon: <ShoppingBag className="h-5 w-5" />,
    color: "text-[#F97316]",
    bgColor: "bg-[#F97316]/10 border-[#F97316]/30",
    href: "/admin?module=shop",
  },
  {
    id: "eats",
    label: "NaijaEats Food & Delivery",
    shortLabel: "Eats",
    description: "Restaurant orders & logistics",
    icon: <Utensils className="h-5 w-5" />,
    color: "text-[#EF4444]",
    bgColor: "bg-[#EF4444]/10 border-[#EF4444]/30",
    href: "/admin?module=eats",
  },
  {
    id: "drive",
    label: "NaijaDrive Rides & Mobility",
    shortLabel: "Drive",
    description: "Ride-hailing, delivery & fleet",
    icon: <Car className="h-5 w-5" />,
    color: "text-[#3B82F6]",
    bgColor: "bg-[#3B82F6]/10 border-[#3B82F6]/30",
    href: "/admin?module=drive",
    roles: ["admin", "super_admin"],
  },
  {
    id: "send",
    label: "NaijaSend Logistics & Parcels",
    shortLabel: "Send",
    description: "Parcel delivery & courier network",
    icon: <Package className="h-5 w-5" />,
    color: "text-[#8B5CF6]",
    bgColor: "bg-[#8B5CF6]/10 border-[#8B5CF6]/30",
    href: "/admin?module=send",
  },
  {
    id: "gigs",
    label: "NaijaGigs Services & Freelance",
    shortLabel: "Gigs",
    description: "Service marketplace & bookings",
    icon: <Briefcase className="h-5 w-5" />,
    color: "text-[#EC4899]",
    bgColor: "bg-[#EC4899]/10 border-[#EC4899]/30",
    href: "/admin?module=gigs",
  },
  {
    id: "stay",
    label: "NaijaStay Hotels & Stays",
    shortLabel: "Stay",
    description: "Accommodation & booking engine",
    icon: <Home className="h-5 w-5" />,
    color: "text-[#06B6D4]",
    bgColor: "bg-[#06B6D4]/10 border-[#06B6D4]/30",
    href: "/admin?module=stay",
  },
  {
    id: "stream",
    label: "NaijaStream Music & Media",
    shortLabel: "Stream",
    description: "Content streaming & creators",
    icon: <Music className="h-5 w-5" />,
    color: "text-[#84CC16]",
    bgColor: "bg-[#84CC16]/10 border-[#84CC16]/30",
    href: "/admin?module=stream",
  },
  {
    id: "pay",
    label: "NaijaPay Wallet & Payments",
    shortLabel: "Pay",
    description: "Wallet, ledger & financial ops",
    icon: <CreditCard className="h-5 w-5" />,
    color: "text-[#F59E0B]",
    bgColor: "bg-[#F59E0B]/10 border-[#F59E0B]/30",
    href: "/admin?module=pay",
    roles: ["admin", "super_admin"],
  },
  {
    id: "fresh",
    label: "NaijaFresh Groceries",
    shortLabel: "Fresh",
    description: "Grocery delivery & quick commerce",
    icon: <Apple className="h-5 w-5" />,
    color: "text-[#22C55E]",
    bgColor: "bg-[#22C55E]/10 border-[#22C55E]/30",
    href: "/admin?module=fresh",
  },
  {
    id: "aura",
    label: "Aura AI Assistant",
    shortLabel: "Aura AI",
    description: "AI copilot & automation",
    icon: <Sparkles className="h-5 w-5" />,
    color: "text-[#A855F7]",
    bgColor: "bg-[#A855F7]/10 border-[#A855F7]/30",
    href: "/admin?module=aura",
    roles: ["super_admin"],
  },
];

interface ModuleSwitcherProps {
  userRoles: string[];
  userActorType?: string;
}

export function ModuleSwitcher({ userRoles, userActorType }: ModuleSwitcherProps) {
  const pathname = usePathname();
  const isSuperAdmin = userRoles.includes("super_admin") || userActorType === "SUPER_ADMIN";

  const getCurrentModule = () => {
    if (!pathname) return "ecosystem";
    const match = pathname.match(/[?&]module=([a-z]+)/);
    return match ? match[1] : "ecosystem";
  };

  const currentModule = getCurrentModule();
  const filteredModules = ecosystemModules.filter((m) => {
    if (!m.roles) return true;
    if (isSuperAdmin) return true;
    return m.roles.some((r) => userRoles.includes(r));
  });

  return (
    <nav
      className="sticky top-16 z-20 border-b border-[#21262D] bg-[#161B22]/95 backdrop-blur lg:ml-64"
      aria-label="Ecosystem module switcher"
    >
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="flex gap-3 overflow-x-auto pb-3 px-2" role="tablist" aria-label="Ecosystem modules">
          {filteredModules.map((module) => {
            const isActive = currentModule === module.id;
            return (
              <Link
                key={module.id}
                href={module.href}
                role="tab"
                aria-selected={isActive}
                aria-label={module.label}
                className={`flex-shrink-0 flex items-start gap-3 rounded-2xl p-4 w-56 transition-all duration-200 ${
                  isActive
                    ? `${module.bgColor} shadow-[0_0_0_1px_${module.color.replace("text-", "")}]`
                    : "bg-[#21262D]/50 border border-[#21262D] hover:bg-[#21262D] hover:border-[#30363D]"
                }`}
              >
                <div
                  className={`shrink-0 flex h-10 w-10 items-center justify-center rounded-xl ${module.color} ${
                    isActive ? "" : "bg-[#0B0E14]"
                  }`}
                  aria-hidden="true"
                >
                  {module.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`font-semibold text-sm truncate ${isActive ? module.color : "text-[#F0F6FC]"}`}>
                    {module.shortLabel}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#8B949E] truncate">{module.description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}