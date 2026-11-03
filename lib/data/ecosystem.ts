import {
  BadgeCheck,
  Bike,
  Bot,
  Building2,
  Car,
  ChefHat,
  CreditCard,
  Headphones,
  Home,
  Leaf,
  RadioTower,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Truck,
  UserCheck,
  Wallet,
  Wrench
} from "lucide-react";

export type VerticalKey = "shop" | "eats" | "fresh" | "gigs" | "stay" | "drive" | "send" | "stream" | "wallet" | "aura";

export type VerticalStatus = "live" | "setup";

export type Vertical = {
  key: VerticalKey;
  name: string;
  href: string;
  icon: typeof ShoppingBag;
  label: string;
  description: string;
  image: string;
  accent: string;
  status: VerticalStatus;
  statusLabel: string;
  color: string;
  source: string;
};

export type Listing = {
  id: string;
  vertical: VerticalKey;
  title: string;
  subtitle: string;
  price: string;
  rating: string;
  location: string;
  badge: string;
  image: string;
};

export type InvestorSection = {
  title: string;
  eyebrow: string;
  body: string;
  proof: string;
};

export type VerticalDemo = {
  key: VerticalKey;
  headline: string;
  story: string;
  metrics: Array<[string, string]>;
  operators: string[];
};

export const verticals: Vertical[] = [
  {
    key: "shop",
    name: "NaijaShop",
    href: "/naijashop",
    icon: ShoppingBag,
    label: "Verified market deals",
    description: "Phones, fashion and home finds with escrow checkout.",
    image: "/real-photography/module-shop.jpg",
    accent: "#f59e0b",
    status: "live",
    statusLabel: "Live",
    color: "bg-primary",
    source: "naijashop_marketplace"
  },
  {
    key: "eats",
    name: "NaijaEats",
    href: "/naijaeats",
    icon: ChefHat,
    label: "Food and restaurant delivery",
    description: "Restaurant and buka meals delivered hot to your door.",
    image: "/brand-photography/eats-jollof-delivery.jpg", // Owner-supplied NaijaEats brand artwork (AI-generated, not a real restaurant or courier).
    accent: "#f97316",
    status: "setup",
    statusLabel: "Setup required",
    color: "bg-orange-500",
    source: "naijaeats_home_hub"
  },
  {
    key: "fresh",
    name: "NaijaFresh",
    href: "/naijafresh",
    icon: Leaf,
    label: "Groceries and market produce",
    description: "Fresh produce and staples picked for you.",
    image: "/brand-photography/fresh-market-groceries.jpg", // Owner-supplied NaijaFresh brand artwork (AI-generated, not a real market vendor).
    accent: "#84cc16",
    status: "setup",
    statusLabel: "Setup required",
    color: "bg-lime-600",
    source: "naijafresh_grocery"
  },
  {
    key: "drive",
    name: "NaijaDrive",
    href: "/naijadrive",
    icon: Car,
    label: "Rides, car sharing and business",
    description: "Cars, shared seats, bikes and company rides.",
    image: "/brand-photography/drive-suv-lagos.jpg", // Owner-supplied NaijaDrive brand artwork (AI-generated, not a real driver photo).
    accent: "#fbbf24",
    status: "live",
    statusLabel: "Live in Lagos",
    color: "bg-zinc-900",
    source: "naijadrive_book_a_ride"
  },
  {
    key: "send",
    name: "NaijaSend",
    href: "/naijasend",
    icon: Truck,
    label: "Courier and logistics",
    description: "Parcels across town with tracked delivery events.",
    image: "/brand-photography/send-airport-logistics.jpg", // Owner-supplied NaijaSend brand artwork (AI-generated, not a real shipment).
    accent: "#34d399",
    status: "live",
    statusLabel: "Live",
    color: "bg-emerald-700",
    source: "naijasend_logistics_dashboard"
  },
  {
    key: "gigs",
    name: "NaijaGigs",
    href: "/naijagigs",
    icon: Wrench,
    label: "Services with escrow",
    description: "Verified pros for repairs, solar and design.",
    image: "/real-photography/module-gigs.jpg",
    accent: "#38bdf8",
    status: "setup",
    statusLabel: "Setup required",
    color: "bg-blue-600",
    source: "naijagigs_marketplace"
  },
  {
    key: "stay",
    name: "NaijaStay",
    href: "/naijastay",
    icon: Building2,
    label: "Hotels, shortlets, apartments",
    description: "Shortlets and hotels scored for power and safety.",
    image: "/brand-photography/stay-waterfront-apartment.jpg", // Owner-supplied NaijaStay brand artwork (AI-generated interior, not a real listing).
    accent: "#c084fc",
    status: "setup",
    statusLabel: "Setup required",
    color: "bg-teal-600",
    source: "naijastay_search"
  },
  {
    key: "stream",
    name: "NaijaStream",
    href: "/naijastream",
    icon: Headphones,
    label: "Music, video, creators",
    description: "African charts, creator rooms and licensed audio.",
    image: "/brand-photography/stream-studio-lagos.jpg", // Owner-supplied NaijaStream brand artwork (AI-generated studio scene, not a real artist).
    accent: "#f472b6",
    status: "setup",
    statusLabel: "Setup required",
    color: "bg-fuchsia-700",
    source: "naijastream_home_hub"
  },
  {
    key: "wallet",
    name: "NaijaPay",
    href: "/naijapay",
    icon: Wallet,
    label: "Wallet, escrow, payouts",
    description: "One balance for payments, escrow and payouts.",
    image: "/real-photography/module-wallet.jpg",
    accent: "#34d399",
    status: "live",
    statusLabel: "Live",
    color: "bg-green-700",
    source: "naijapay_consumer_wallet_home"
  },
  {
    key: "aura",
    name: "Aura AI",
    href: "/aura-ai",
    icon: Bot,
    label: "Concierge and support",
    description: "Help across the ecosystem, only when configured.",
    image: "/brand-photography/aura-concierge-lagos.jpg", // Owner-supplied Aura brand artwork (AI-generated, not a real customer).
    accent: "#22d3ee",
    status: "setup",
    statusLabel: "Setup required",
    color: "bg-indigo-700",
    source: "aura_ai_concierge_hub"
  }
];

export const listings: Listing[] = [
  {
    id: "oraimo-watch-pro",
    vertical: "shop",
    title: "Oraimo Watch Pro, Lagos verified",
    subtitle: "Balogun direct, escrow eligible",
    price: "NGN 42,500",
    rating: "4.8",
    location: "Balogun Market",
    badge: "Market Mode",
    image: "/stitch/naijashop_marketplace.png"
  },
  {
    id: "mama-cass-jollof",
    vertical: "eats",
    title: "Mama Cass party jollof bowl",
    subtitle: "Hot meal, rider assigned in 6 min",
    price: "NGN 4,800",
    rating: "4.7",
    location: "Surulere",
    badge: "Fast Eats",
    image: "/stitch/naijaeats_home_hub.png"
  },
  {
    id: "solar-installer",
    vertical: "gigs",
    title: "Certified solar inverter installer",
    subtitle: "Escrow milestone, verified reviews",
    price: "From NGN 35,000",
    rating: "4.9",
    location: "Lekki",
    badge: "Pro Gig",
    image: "/stitch/naijagigs_marketplace.png"
  },
  {
    id: "lekki-shortlet",
    vertical: "stay",
    title: "Two-bedroom Lekki smart shortlet",
    subtitle: "Solar 92, security 98, fiber 88",
    price: "NGN 78,000/night",
    rating: "4.8",
    location: "Lekki Phase 1",
    badge: "Stay Verified",
    image: "/stitch/naijastay_search.png"
  },
  {
    id: "executive-ride",
    vertical: "drive",
    title: "Executive ride to VI",
    subtitle: "Driver vetted, route risk scored",
    price: "NGN 6,200",
    rating: "4.9",
    location: "Ikeja to Victoria Island",
    badge: "Live Ride",
    image: "/stitch/naijadrive_book_a_ride.png"
  },
  {
    id: "cold-chain-delivery",
    vertical: "send",
    title: "Cold-chain package delivery",
    subtitle: "QR proof, temperature ledger",
    price: "NGN 3,500",
    rating: "4.7",
    location: "Yaba to Ajah",
    badge: "Tracked",
    image: "/stitch/naijasend_logistics_dashboard.png"
  },
  {
    id: "afrobeats-live",
    vertical: "stream",
    title: "Afrobeats live creator room",
    subtitle: "Royalties tracked, fan tipping active",
    price: "NGN 1,000 access",
    rating: "4.8",
    location: "Lagos Live",
    badge: "Creator",
    image: "/stitch/naijastream_home_hub.png"
  }
];

export const investorSections: InvestorSection[] = [
  {
    eyebrow: "Why NaijaDeals",
    title: "One trusted operating system for African commerce.",
    body: "NaijaDeals combines retail, meals, gigs, lodging, mobility, courier, media, wallet, and support into one identity and one trust graph.",
    proof: "Every order, ride, payout, review, and dispute improves the customer and merchant trust score."
  },
  {
    eyebrow: "Market opportunity",
    title: "Fragmented daily spend becomes one ecosystem wallet.",
    body: "Millions of African customers already shop, move, eat, send, book, and pay every week. NaijaDeals unifies those behaviors into one repeat-use super app.",
    proof: "Demo model: NGN 248M daily GMV across seven verticals with 42,900 verified partners."
  },
  {
    eyebrow: "Trust and escrow",
    title: "Escrow converts informal trade into accountable digital trade.",
    body: "Wallet holds, QR handoffs, video evidence, verified vendors, and rule-based refunds reduce fear for buyers and settlement risk for sellers.",
    proof: "Escrow lifecycle is represented from cart to delivery proof to refund or payout."
  },
  {
    eyebrow: "AI-powered commerce",
    title: "Aura makes the platform feel personal, local, and safer.",
    body: "Aura helps shoppers compare prices, assigns dispatch, detects fraud, prepares support cases, and surfaces local market intelligence.",
    proof: "Recommendation, dispatch, fraud scoring, and support assistant interfaces are ready for model/API integration."
  },
  {
    eyebrow: "African logistics advantage",
    title: "Local route intelligence becomes a competitive moat.",
    body: "NaijaSend and NaijaDrive share corridor data, weather/rainy-season events, pickup scans, driver compliance, and real-time mission tracking.",
    proof: "Tracking UI includes GPS state, QR pickup, route risk, and delivery proof."
  },
  {
    eyebrow: "Seller growth engine",
    title: "Vendors get more than listings: they get an operating console.",
    body: "Seller OS gives merchants analytics, AI CRM, inventory, payouts, promotions, escrow status, and support tools across every vertical.",
    proof: "Business pages and onboarding flows cover vendors, restaurants, drivers, creators, and hosts."
  },
  {
    eyebrow: "Super app roadmap",
    title: "Nigeria-first, Pan-African by architecture.",
    body: "The route, admin, wallet, AI, localization, and compliance structures are built to extend from Lagos to regional corridors and multi-currency settlement.",
    proof: "Super admin includes governance, regional expansion, infrastructure, security, analytics, and settings."
  }
];

export const verticalDemos: VerticalDemo[] = [
  {
    key: "shop",
    headline: "Balogun, Alaba, Computer Village, and trusted online brands in one cart.",
    story: "Market Mode gives customers local price confidence while escrow and verified vendor badges make informal market buying feel safe.",
    metrics: [["412", "live market deals"], ["8-15%", "commission model"], ["24h", "merchant response SLA"]],
    operators: ["Alaba Gadgets Hub", "Balogun Fabrics Direct", "Kariakor Leather Collective"]
  },
  {
    key: "eats",
    headline: "Restaurants, bukas, cloud kitchens, and riders coordinated by dispatch intelligence.",
    story: "NaijaEats combines kitchen readiness, rider proximity, food priority, and customer support into a fast ordering surface.",
    metrics: [["6 min", "rider assignment"], ["92%", "on-time kitchen score"], ["15-25%", "restaurant commission"]],
    operators: ["Mama Cass Surulere", "Amala Junction Yaba", "Lekki Cloud Grill"]
  },
  {
    key: "gigs",
    headline: "Verified service pros with milestone escrow.",
    story: "From solar installers to designers and repair technicians, NaijaGigs protects both customer and freelancer with agreement and proof workflows.",
    metrics: [["4.9", "top pro rating"], ["3", "milestone templates"], ["48h", "dispute review SLA"]],
    operators: ["Lekki Solar Pros", "Ikeja Phone Repair", "Abuja Brand Studio"]
  },
  {
    key: "stay",
    headline: "Shortlets scored for power, security, internet, and host reliability.",
    story: "NaijaStay adds African-specific property trust indicators to booking flows so guests can compare the things that really matter.",
    metrics: [["98", "security score"], ["92", "solar score"], ["88", "fiber score"]],
    operators: ["Lekki Smart Shortlets", "VI Business Suites", "Abuja Family Apartments"]
  },
  {
    key: "drive",
    headline: "Uber-style simplicity with route risk and driver-first economics.",
    story: "NaijaDrive supports everyday rides, executive bookings, fare breakdowns, driver missions, and surge controls.",
    metrics: [["4 min", "driver arrival"], ["92", "route safety score"], ["18%", "driver loyalty lift"]],
    operators: ["Ikeja Fleet Circle", "VI Executive Rides", "Airport Corridor Drivers"]
  },
  {
    key: "send",
    headline: "Courier, cold-chain, and cross-border logistics with proof built in.",
    story: "NaijaSend turns every package into a mission with pickup QR, delivery proof, route visibility, and escalation paths.",
    metrics: [["96%", "proof capture"], ["14", "active corridors"], ["3.5k", "daily courier jobs"]],
    operators: ["Yaba-Ajah Express", "Lagos-Accra Corridor", "ColdBox Dispatch"]
  },
  {
    key: "stream",
    headline: "Creators, live rooms, royalties, and fan payments tied to the wallet.",
    story: "NaijaStream gives artists and creators monetization, moderation, content rights, tipping, and audience intelligence.",
    metrics: [["22k", "live fans"], ["NGN 1k", "room access"], ["7d", "royalty cycle"]],
    operators: ["Afrobeats Live", "Nollywood Shorts", "Pidgin Podcast Network"]
  },
  {
    key: "wallet",
    headline: "One wallet for payments, refunds, escrow, and payouts.",
    story: "NaijaPay is the financial backbone for consumers, vendors, drivers, creators, restaurants, and hosts.",
    metrics: [["NGN 1.8B", "escrow protected"], ["1.42x", "reserve ratio"], ["4,188", "active holds"]],
    operators: ["Consumer wallet", "Merchant settlement", "Driver payout desk"]
  },
  {
    key: "aura",
    headline: "Aura is the concierge across shopping, logistics, support, and trust.",
    story: "Aura reduces friction by helping users search, compare, dispatch, resolve issues, and understand local markets.",
    metrics: [["42 sec", "support response"], ["18%", "conversion lift"], ["1,248", "risk alerts blocked"]],
    operators: ["Customer AI", "Merchant AI", "Risk AI"]
  }
];

export const adminModules = [
  "Users",
  "Vendors",
  "Orders",
  "Deliveries",
  "Rides",
  "Restaurants",
  "Properties",
  "Gigs",
  "Creators",
  "Wallet",
  "Escrow",
  "Disputes",
  "Payouts",
  "Reviews",
  "Ads",
  "Promotions",
  "AI monitoring",
  "Fraud/risk alerts",
  "Analytics",
  "Settings"
];

export const adminQueues = [
  { area: "Users", item: "KYC backlog", owner: "Identity Ops", count: "1,284", status: "Reviewing" },
  { area: "Vendors", item: "Balogun electronics verification", owner: "Merchant Trust", count: "86", status: "Priority" },
  { area: "Orders", item: "Escrow release pending proof", owner: "Commerce Ops", count: "4,188", status: "Live" },
  { area: "Deliveries", item: "Rain delay reroutes", owner: "NaijaSend", count: "312", status: "Dispatching" },
  { area: "Rides", item: "Airport corridor supply gap", owner: "NaijaDrive", count: "54", status: "Surge guarded" },
  { area: "Restaurants", item: "Kitchen readiness misses", owner: "NaijaEats", count: "29", status: "Coaching" },
  { area: "Properties", item: "Solar/internet audit", owner: "NaijaStay", count: "74", status: "Field check" },
  { area: "Creators", item: "Rights claim review", owner: "NaijaStream", count: "18", status: "Legal queue" }
];

export const riskAlerts = [
  { severity: "High", signal: "Wallet velocity spike", subject: "New account cluster in Lekki", action: "Freeze high-value transfers" },
  { severity: "Medium", signal: "Vendor refund ratio", subject: "Alaba accessories seller", action: "Escrow release delay" },
  { severity: "Medium", signal: "Route anomaly", subject: "Mile 2 rainy-season corridor", action: "Dispatch reroute" },
  { severity: "Low", signal: "Creator rights claim", subject: "Afrobeats remix room", action: "Manual review" }
];

export const aiSystems = [
  { title: "AI recommendation engine", status: "Learning from search, orders, wallet behavior", icon: Sparkles },
  { title: "AI dispatch engine", status: "Optimizing riders, drivers, couriers, and cold-chain jobs", icon: RadioTower },
  { title: "AI fraud/risk scoring", status: "Scoring merchants, listings, payments, routes, and disputes", icon: ShieldCheck },
  { title: "AI customer support assistant", status: "Aura handles triage, refunds, handoff, and language", icon: Bot }
];

export const trustFlows = [
  { title: "Wallet funded", detail: "Ledger reserve confirms NGN balance before checkout.", icon: CreditCard },
  { title: "Escrow hold", detail: "Funds stay protected until delivery, ride, booking, or gig milestone is verified.", icon: ShieldCheck },
  { title: "QR verification", detail: "Pickup and delivery scans create proof events for support and disputes.", icon: BadgeCheck },
  { title: "Refund or payout", detail: "Rules engine routes completed orders to vendor payout or customer refund.", icon: Wallet }
];

export const onboardingFlows = [
  { slug: "vendor", title: "Vendor onboarding", steps: ["Identity KYC", "Business profile", "Service pillars", "Payout account", "Verification welcome"], icon: UserCheck },
  { slug: "driver", title: "Driver onboarding", steps: ["License check", "Vehicle profile", "Route training", "Wallet setup", "Mission readiness"], icon: Bike },
  { slug: "restaurant", title: "Restaurant onboarding", steps: ["CAC or owner ID", "Menu import", "Kitchen hours", "Dispatch zone", "Go live"], icon: ChefHat },
  { slug: "creator", title: "Creator onboarding", steps: ["Identity check", "Channel profile", "Rights declaration", "Royalties wallet", "Publish studio"], icon: RadioTower },
  { slug: "host", title: "Property host onboarding", steps: ["Host KYC", "Property basics", "Photos", "Infrastructure scores", "Pricing and review"], icon: Home }
];

export const pageCopy: Record<string, { title: string; eyebrow: string; description: string; cta: string }> = {
  "ecosystem-hub": {
    title: "One account for African digital life.",
    eyebrow: "Ecosystem Hub",
    description: "Shop, eat, book, ride, send, stream, pay, and resolve support from a single NaijaDeals identity.",
    cta: "Explore verticals"
  },
  categories: {
    title: "Categories built for local markets and modern commerce.",
    eyebrow: "Categories",
    description: "Browse products, meals, gigs, properties, rides, logistics lanes, creators, and wallet services.",
    cta: "Browse categories"
  },
  search: {
    title: "Universal search with Aura AI discovery.",
    eyebrow: "Search",
    description: "Find Toyota parts, Mama Cass, a plumber, Lekki shortlets, delivery lanes, or Afrobeats live rooms.",
    cta: "Search now"
  },
  "product-listing": {
    title: "Verified marketplace listings.",
    eyebrow: "Product Listing",
    description: "Market-mode deals with ratings, vendor verification, escrow eligibility, and AI price comparison.",
    cta: "View listings"
  },
  "product-detail": {
    title: "Product detail with escrow, reviews, and QR delivery.",
    eyebrow: "Product Detail",
    description: "A detail surface for images, vendor trust, ratings, saved items, AI price confidence, cart actions, escrow, and fulfillment proof.",
    cta: "View detail"
  },
  cart: {
    title: "Unified cart across the ecosystem.",
    eyebrow: "Cart",
    description: "Mix marketplace items, meals, bookings, gigs, delivery jobs, and stream access in one checkout-ready cart.",
    cta: "Review cart"
  },
  checkout: {
    title: "Checkout protected by wallet and escrow.",
    eyebrow: "Checkout",
    description: "Pay with NaijaPay, card, transfer, or wallet balance while escrow protects high-trust transactions.",
    cta: "Continue payment"
  },
  account: {
    title: "Your NaijaDeals identity.",
    eyebrow: "Account",
    description: "Manage profile, KYC, saved vendors, language, low-data mode, family wallet, and trust score.",
    cta: "Manage account"
  },
  orders: {
    title: "Orders, rides, stays, gigs, and deliveries in one timeline.",
    eyebrow: "Orders",
    description: "Track every mission from purchase to QR proof, review, dispute, refund, or payout.",
    cta: "Track activity"
  },
  wallet: {
    title: "NaijaPay wallet for payments, escrow, refunds, and payouts.",
    eyebrow: "Wallet",
    description: "Ledger-ready wallet structure for consumers, vendors, drivers, creators, hosts, and restaurants.",
    cta: "Open wallet"
  },
  help: {
    title: "AI-first help with human handoff.",
    eyebrow: "Help",
    description: "Aura answers support questions, prepares refund cases, translates issues, and routes urgent cases.",
    cta: "Ask Aura"
  },
  returns: {
    title: "Returns and refunds with clear evidence.",
    eyebrow: "Returns",
    description: "Video unboxing, QR proof, merchant response windows, escrow release rules, and dispute escalation.",
    cta: "Start return"
  },
  safety: {
    title: "Safety, verification, and fraud prevention.",
    eyebrow: "Safety",
    description: "Risk scoring for vendors, drivers, listings, rides, routes, payouts, and suspicious wallet activity.",
    cta: "View safety"
  },
  shipping: {
    title: "Shipping, courier, and logistics tracking.",
    eyebrow: "Shipping",
    description: "Real-time delivery lanes, cold-chain transparency, route events, QR pickup, and proof of delivery.",
    cta: "Track parcel"
  },
  payments: {
    title: "Payments, escrow, payouts, and reserves.",
    eyebrow: "Payments",
    description: "Multi-method payment-ready UI with wallet ledger, escrow holds, refunds, commissions, and payouts.",
    cta: "View payments"
  },
  "aura-ai": {
    title: "Aura AI concierge across the full platform.",
    eyebrow: "Aura AI",
    description: "Personal shopping, support, dispatch recommendations, local market intelligence, and language-ready help.",
    cta: "Chat with Aura"
  }
};
