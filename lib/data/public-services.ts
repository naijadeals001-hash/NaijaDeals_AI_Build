import {
  BadgeDollarSign,
  Building2,
  Car,
  Headphones,
  Leaf,
  ShoppingBag,
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
 * upgrades a module's status by presenting everything as available. Imagery is
 * the project's own generated editorial photography; each asset is recorded in
 * `scripts/image-registry.json` with its prompt, model and date.
 */
export type PublicService = {
  key: string;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  status: VerticalStatus;
  /** Card visual. No stock imagery, third-party listing photo or baked-in text. */
  image: string;
  imageAlt: string;
  /** The obvious next step shown on the discovery card. */
  action: string;
};

function liveStatus(key: string): VerticalStatus {
  return verticals.find((vertical) => vertical.key === key)?.status ?? "live";
}

export const publicServices: PublicService[] = [
  {
    key: "shop",
    label: "Shop",
    description: "Sellers across Africa, escrow checkout.",
    href: "/naijashop",
    icon: ShoppingBag,
    status: liveStatus("shop"),
    image: "/generated/shop/hero-mobile.webp",
    imageAlt: "Shopper carrying paper bags at a lively outdoor market",
    action: "Shop now"
  },
  {
    key: "drive",
    label: "Drive",
    description: "Book a verified ride with the fare shown up front.",
    href: "/naijadrive",
    icon: Car,
    status: liveStatus("drive"),
    image: "/generated/home/home-card-drive.webp",
    imageAlt: "Green sedan parked on a sunny city street",
    action: "Book a ride"
  },
  {
    key: "eats",
    label: "Food",
    description: "Order meals from local restaurants and bukas.",
    href: "/naijaeats",
    icon: UtensilsCrossed,
    status: liveStatus("eats"),
    image: "/generated/home/home-card-eats.webp",
    imageAlt: "Bowl of jollof rice with grilled chicken and fried plantain",
    action: "Order food"
  },
  {
    key: "send",
    label: "Deliveries & Freight",
    description: "Tracked parcels and freight across town.",
    href: "/naijasend",
    icon: Truck,
    status: liveStatus("send"),
    image: "/generated/home/home-card-send.webp",
    imageAlt: "White and green box truck at a logistics depot with stacked pallets",
    action: "Send a parcel"
  },
  {
    key: "gigs",
    label: "Services",
    description: "Verified pros for home and business.",
    href: "/naijagigs",
    icon: Wrench,
    status: liveStatus("gigs"),
    image: "/generated/home/home-card-gigs.webp",
    imageAlt: "Electrician in a hard hat beside a distribution board",
    action: "Find a pro"
  },
  {
    key: "stay",
    label: "Stays",
    description: "Find hotels, shortlets and serviced apartments.",
    href: "/naijastay",
    icon: Building2,
    status: liveStatus("stay"),
    image: "/generated/home/home-card-stay.webp",
    imageAlt: "Modern hotel with lit balconies at dusk",
    action: "Find a stay"
  },
  {
    key: "fresh",
    label: "Groceries",
    description: "Fresh produce from supported markets.",
    href: "/naijafresh",
    icon: Leaf,
    status: liveStatus("fresh"),
    image: "/generated/home/home-card-fresh.webp",
    imageAlt: "Woven basket of tomatoes, peppers, yams and leafy greens",
    action: "Shop groceries"
  },
  {
    key: "stream",
    label: "Music",
    description: "African music, shows and creator rooms.",
    href: "/naijastream",
    icon: Headphones,
    status: liveStatus("stream"),
    image: "/generated/home/home-card-stream.webp",
    imageAlt: "Woman listening to music on purple headphones",
    action: "Listen now"
  },
  {
    key: "pay",
    label: "Wallet & Payments",
    description: "Pay, receive and manage money in one wallet.",
    href: "/pay",
    icon: Wallet,
    status: liveStatus("wallet"),
    image: "/generated/pay/pay-phone-bills.webp",
    imageAlt: "Woman in a green top checking her wallet on a phone",
    action: "Open wallet"
  },
  {
    key: "earn",
    label: "Earn & Affiliates",
    description: "Refer customers or sell and earn with NaijaDeals.",
    href: "/affiliate",
    icon: BadgeDollarSign,
    // The affiliate programme route is implemented; a customer still has to
    // qualify and sign in before a link is issued.
    status: "live",
    image: "/generated/shop/banner-sellers.webp",
    imageAlt: "Shop owner standing behind a stocked counter",
    action: "Explore earning"
  }
];
