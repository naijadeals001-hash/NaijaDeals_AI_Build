import {
  BadgeDollarSign,
  Building2,
  Car,
  Headphones,
  Leaf,
  ShoppingBag,
  Sparkles,
  Truck,
  UtensilsCrossed,
  Wallet,
  Wrench,
  type LucideIcon
} from "lucide-react";
import { verticals, type VerticalStatus } from "@/lib/data/ecosystem";

/**
 * Public service directory used by the shared header, homepage discovery grid
 * and footer. Internal module names (NaijaShop, NaijaEats, …) stay in code and
 * URLs; customer-facing navigation uses the approved public labels.
 *
 * Availability is read from the verified vertical catalogue so the UI never
 * upgrades a module's status by presenting everything as available.
 */
export type PublicService = {
  key: string;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  status: VerticalStatus;
};

function liveStatus(key: string): VerticalStatus {
  return verticals.find((vertical) => vertical.key === key)?.status ?? "live";
}

export const publicServices: PublicService[] = [
  {
    key: "drive",
    label: "Ride",
    description: "Book a verified ride across Lagos.",
    href: "/naijadrive",
    icon: Car,
    status: liveStatus("drive")
  },
  {
    key: "eats",
    label: "Eat",
    description: "Order meals from local restaurants and bukas.",
    href: "/naijaeats",
    icon: UtensilsCrossed,
    status: liveStatus("eats")
  },
  {
    key: "shop",
    label: "Shop",
    description: "Buy from verified sellers with escrow checkout.",
    href: "/naijashop",
    icon: ShoppingBag,
    status: liveStatus("shop")
  },
  {
    key: "send",
    label: "Send",
    description: "Move parcels across town with tracked delivery.",
    href: "/naijasend",
    icon: Truck,
    status: liveStatus("send")
  },
  {
    key: "stay",
    label: "Stay",
    description: "Find hotels, shortlets and serviced apartments.",
    href: "/naijastay",
    icon: Building2,
    status: liveStatus("stay")
  },
  {
    key: "fresh",
    label: "Fresh",
    description: "Shop produce and groceries from supported markets.",
    href: "/naijafresh",
    icon: Leaf,
    status: liveStatus("fresh")
  },
  {
    key: "gigs",
    label: "Gigs",
    description: "Hire verified professionals for home and business.",
    href: "/naijagigs",
    icon: Wrench,
    status: liveStatus("gigs")
  },
  {
    key: "stream",
    label: "Stream",
    description: "African music, shows and creator rooms.",
    href: "/naijastream",
    icon: Headphones,
    status: liveStatus("stream")
  },
  {
    key: "pay",
    label: "Pay",
    description: "Pay, receive and manage money in one wallet.",
    href: "/pay",
    icon: Wallet,
    status: liveStatus("wallet")
  },
  {
    key: "aura",
    label: "Aura",
    description: "Ask the NaijaDeals assistant for help.",
    href: "/aura-ai",
    icon: Sparkles,
    status: liveStatus("aura")
  },
  {
    key: "earn",
    label: "Earn",
    description: "Refer customers or sell and earn with NaijaDeals.",
    href: "/affiliate",
    icon: BadgeDollarSign,
    // The affiliate programme route is implemented; a customer still has to
    // qualify and sign in before a link is issued.
    status: "live"
  }
];
