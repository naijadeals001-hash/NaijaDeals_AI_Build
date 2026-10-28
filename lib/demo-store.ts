"use client";

import { useEffect, useMemo, useState } from "react";
import { listings, type Listing, type VerticalKey } from "@/lib/data/ecosystem";

export type DemoListing = Listing & {
  category: string;
  vendor: string;
  priceKobo: number;
  tags: string[];
  description: string;
};

export type CartLine = {
  itemId: string;
  quantity: number;
};

export type DemoAccount = {
  signedIn: boolean;
  name: string;
  email: string;
  phone: string;
  city: string;
  trustScore: number;
};

export type CheckoutInfo = {
  customerName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  paymentMethod: "wallet" | "card" | "transfer" | "pay-on-delivery";
  deliverySpeed: "standard" | "express" | "pickup";
  notes: string;
};

export type TrackingEvent = {
  label: string;
  detail: string;
  time: string;
  done: boolean;
};

export type DemoOrder = {
  id: string;
  items: Array<CartLine & { title: string; priceKobo: number; vertical: VerticalKey }>;
  totalKobo: number;
  status: "created" | "confirmed" | "dispatching" | "in-transit" | "delivered";
  createdAt: string;
  checkout: CheckoutInfo;
  tracking: TrackingEvent[];
};

export type WalletTransaction = {
  id: string;
  label: string;
  amountKobo: number;
  type: "credit" | "debit" | "hold" | "release";
  createdAt: string;
  detail: string;
};

export type EscrowHold = {
  id: string;
  orderId: string;
  amountKobo: number;
  status: "held" | "ready-for-release" | "released" | "disputed";
  reason: string;
};

export type OnboardingSubmission = {
  id: string;
  type: string;
  businessName: string;
  contactName: string;
  phone: string;
  city: string;
  category: string;
  notes: string;
  status: "submitted" | "reviewing" | "approved";
  createdAt: string;
};

export type DeliveryBooking = {
  id: string;
  pickup: string;
  dropoff: string;
  packageType: string;
  estimateKobo: number;
  courier: string;
  status: "quoted" | "assigned" | "picked-up" | "in-transit" | "delivered";
  createdAt: string;
};

type DemoStore = {
  cart: CartLine[];
  orders: DemoOrder[];
  walletBalanceKobo: number;
  transactions: WalletTransaction[];
  escrowHolds: EscrowHold[];
  account: DemoAccount;
  submissions: OnboardingSubmission[];
  savedItemIds: string[];
  deliveries: DeliveryBooking[];
};

const STORAGE_KEY = "naijadeals-functional-mvp-v1";

const seedAccount: DemoAccount = {
  signedIn: true,
  name: "Amina Okafor",
  email: "amina.okafor@example.com",
  phone: "0803 204 9988",
  city: "Lagos",
  trustScore: 94
};

const seedTracking: TrackingEvent[] = [
  { label: "Mission created", detail: "NaijaPay escrow hold confirmed and vendor notified.", time: "09:12", done: true },
  { label: "Dispatch assigned", detail: "NaijaSend rider selected from Yaba micro-hub.", time: "09:18", done: true },
  { label: "Pickup QR scanned", detail: "Vendor handoff verified with barcode proof.", time: "09:34", done: true },
  { label: "In transit", detail: "Route risk score updated for rain on Third Mainland corridor.", time: "09:52", done: true },
  { label: "Delivery barcode pending", detail: "Customer handoff and review still open.", time: "10:20", done: false }
];

const seedStore: DemoStore = {
  cart: [],
  orders: [
    {
      id: "ND-2843",
      items: [{ itemId: "oraimo-watch-pro", quantity: 1, title: "Oraimo Watch Pro, Lagos verified", priceKobo: 4250000, vertical: "shop" }],
      totalKobo: 4250000,
      status: "in-transit",
      createdAt: "2026-06-05T09:12:00.000Z",
      checkout: {
        customerName: "Amina Okafor",
        phone: "0803 204 9988",
        email: "amina.okafor@example.com",
        address: "12 Admiralty Way, Lekki Phase 1",
        city: "Lagos",
        paymentMethod: "wallet",
        deliverySpeed: "express",
        notes: "Call when rider reaches the estate gate."
      },
      tracking: seedTracking
    }
  ],
  walletBalanceKobo: 28490000,
  transactions: [
    { id: "TX-001", label: "Wallet funded", amountKobo: 15000000, type: "credit", createdAt: "2026-06-05T08:00:00.000Z", detail: "Demo bank transfer top-up" },
    { id: "TX-002", label: "Escrow hold", amountKobo: -4250000, type: "hold", createdAt: "2026-06-05T09:12:00.000Z", detail: "Oraimo Watch Pro order ND-2843" },
    { id: "TX-003", label: "Creator tip received", amountKobo: 100000, type: "credit", createdAt: "2026-06-05T10:05:00.000Z", detail: "Afrobeats live room wallet event" }
  ],
  escrowHolds: [
    { id: "ESC-2843", orderId: "ND-2843", amountKobo: 4250000, status: "held", reason: "Pending delivery barcode verification" }
  ],
  account: seedAccount,
  submissions: [],
  savedItemIds: ["oraimo-watch-pro"],
  deliveries: [
    {
      id: "SEND-1042",
      pickup: "Yaba Tech Hub",
      dropoff: "Lekki Phase 1",
      packageType: "Electronics",
      estimateKobo: 350000,
      courier: "Chidinma Rider",
      status: "in-transit",
      createdAt: "2026-06-05T09:30:00.000Z"
    }
  ],
  };

export const demoListings: DemoListing[] = listings.map((item) => {
  const detail: Record<string, Omit<DemoListing, keyof Listing>> = {
    "oraimo-watch-pro": {
      category: "Electronics",
      vendor: "Balogun Gadgets Direct",
      priceKobo: 4250000,
      tags: ["watch", "electronics", "balogun", "escrow"],
      description: "Verified smartwatch from a Lagos market vendor with receipt upload, QR delivery proof, and escrow protection."
    },
    "mama-cass-jollof": {
      category: "Food",
      vendor: "Mama Cass Surulere",
      priceKobo: 480000,
      tags: ["jollof", "food", "restaurant", "surulere"],
      description: "Party-style jollof bowl with kitchen readiness, rider assignment, and hot-meal priority dispatch."
    },
    "solar-installer": {
      category: "Services",
      vendor: "Lekki Solar Pros",
      priceKobo: 3500000,
      tags: ["solar", "installer", "gig", "escrow"],
      description: "Certified inverter installer with milestone escrow, site checklist, and verified customer reviews."
    },
    "lekki-shortlet": {
      category: "Stays",
      vendor: "Lekki Smart Shortlets",
      priceKobo: 7800000,
      tags: ["shortlet", "lekki", "apartment", "solar"],
      description: "Two-bedroom apartment scored for power, internet, security, host reliability, and QR access."
    },
    "executive-ride": {
      category: "Rides",
      vendor: "VI Executive Rides",
      priceKobo: 620000,
      tags: ["ride", "driver", "ikeja", "vi"],
      description: "Vetted executive ride with route risk score, fare breakdown, and live driver mission state."
    },
    "cold-chain-delivery": {
      category: "Logistics",
      vendor: "ColdBox Dispatch",
      priceKobo: 350000,
      tags: ["delivery", "cold-chain", "courier", "qr"],
      description: "Temperature-sensitive courier mission with pickup scan, route tracking, and proof of delivery."
    },
    "afrobeats-live": {
      category: "Creators",
      vendor: "Afrobeats Live",
      priceKobo: 100000,
      tags: ["music", "creator", "stream", "ticket"],
      description: "Creator room access with wallet payment, fan tipping, rights tracking, and royalty-ready ledger event."
    }
  };

  return { ...item, ...detail[item.id] };
}).concat([
  {
    id: "iphone-13-uk-used",
    vertical: "shop",
    title: "iPhone 13 UK-used, 128GB",
    subtitle: "Computer Village seller, battery 88%, escrow eligible",
    price: "NGN 485,000",
    rating: "4.8",
    location: "Computer Village",
    badge: "Verified Seller",
    image: "/stitch/naijashop_marketplace.png",
    category: "Phones",
    vendor: "Ikeja Mobile Hub",
    priceKobo: 48500000,
    tags: ["iphone", "phone", "computer village", "uk used"],
    description: "Clean UK-used iPhone 13 with IMEI check, receipt upload, escrow hold, and same-day Lagos dispatch."
  },
  {
    id: "hp-elitebook-840",
    vertical: "shop",
    title: "HP EliteBook 840 G6",
    subtitle: "Core i5, 16GB RAM, 512GB SSD, warranty card",
    price: "NGN 315,000",
    rating: "4.7",
    location: "Yaba",
    badge: "Warranty",
    image: "/stitch/naijashop_marketplace.png",
    category: "Computers",
    vendor: "Yaba Laptop Square",
    priceKobo: 31500000,
    tags: ["laptop", "hp", "yaba", "computer"],
    description: "Business-grade laptop with local warranty, charger, pickup inspection, and NaijaSend delivery option."
  },
  {
    id: "ankara-bundle",
    vertical: "shop",
    title: "Premium Ankara bundle, 6 yards",
    subtitle: "Balogun fabric merchant, bulk discounts available",
    price: "NGN 28,500",
    rating: "4.6",
    location: "Balogun Market",
    badge: "Market Mode",
    image: "/stitch/naijashop_marketplace.png",
    category: "Fashion",
    vendor: "Balogun Fabrics Direct",
    priceKobo: 2850000,
    tags: ["ankara", "fabric", "balogun", "fashion"],
    description: "Bright premium Ankara with vendor verification, bargaining note, and optional bulk buyer invoice."
  },
  {
    id: "samsung-55-tv",
    vertical: "shop",
    title: "Samsung 55-inch Crystal UHD TV",
    subtitle: "Alaba electronics seller, sealed carton",
    price: "NGN 540,000",
    rating: "4.9",
    location: "Alaba International",
    badge: "Sealed",
    image: "/stitch/naijashop_marketplace.png",
    category: "Electronics",
    vendor: "Alaba Vision World",
    priceKobo: 54000000,
    tags: ["samsung", "tv", "alaba", "electronics"],
    description: "Sealed Samsung UHD TV with serial verification, escrow hold, and insured delivery to Lagos mainland/island."
  },
  {
    id: "thermocool-generator",
    vertical: "shop",
    title: "Thermocool 3.5KVA generator",
    subtitle: "Port Harcourt verified dealer, delivery included",
    price: "NGN 395,000",
    rating: "4.5",
    location: "Port Harcourt",
    badge: "Dealer",
    image: "/stitch/naijashop_marketplace.png",
    category: "Home Power",
    vendor: "PH Power Tools",
    priceKobo: 39500000,
    tags: ["generator", "power", "port harcourt", "home"],
    description: "3.5KVA generator with dealer receipt, delivery proof, and escrow release after customer confirmation."
  },
  {
    id: "kano-leather-bag",
    vertical: "shop",
    title: "Kano leather travel bag",
    subtitle: "Handmade, verified northern artisan seller",
    price: "NGN 46,000",
    rating: "4.7",
    location: "Kano",
    badge: "Artisan",
    image: "/stitch/naijashop_marketplace.png",
    category: "Fashion",
    vendor: "Kano Leather Guild",
    priceKobo: 4600000,
    tags: ["leather", "bag", "kano", "fashion"],
    description: "Durable handmade leather bag with seller profile, craft photos, and tracked interstate delivery."
  },
  {
    id: "amala-abula-pack",
    vertical: "eats",
    title: "Amala and abula lunch pack",
    subtitle: "Buka-ready meal, dispatch in 11 minutes",
    price: "NGN 3,900",
    rating: "4.8",
    location: "Yaba",
    badge: "Popular",
    image: "/stitch/naijaeats_home_hub.png",
    category: "Local Meals",
    vendor: "Amala Junction Yaba",
    priceKobo: 390000,
    tags: ["amala", "abula", "food", "yaba"],
    description: "Fresh amala, ewedu, gbegiri, stew, and assorted meat with rider priority."
  },
  {
    id: "sharwama-combo",
    vertical: "eats",
    title: "Chicken shawarma combo",
    subtitle: "Lekki cloud kitchen, chilled drink included",
    price: "NGN 5,600",
    rating: "4.6",
    location: "Lekki",
    badge: "Cloud Kitchen",
    image: "/stitch/naijaeats_home_hub.png",
    category: "Fast Food",
    vendor: "Lekki Cloud Grill",
    priceKobo: 560000,
    tags: ["shawarma", "fast food", "lekki"],
    description: "Chicken shawarma combo packed hot with live kitchen readiness and dispatch status."
  }
]).concat([
  ...([
    ["tecno-camon-30", "Tecno Camon 30 Pro", "Phones", "NGN 318,000", 31800000, "Slot Computer Village", "Computer Village", "4.6", "New stock, receipt, Lagos warranty"],
    ["infinix-hot-40", "Infinix Hot 40, 256GB", "Phones", "NGN 198,000", 19800000, "Ikeja Mobile Hub", "Computer Village", "4.5", "Budget phone with escrow and same-day dispatch"],
    ["samsung-a55", "Samsung Galaxy A55", "Phones", "NGN 446,000", 44600000, "Abuja Gadget Plaza", "Abuja", "4.7", "Sealed Samsung midrange with receipt verification"],
    ["dell-latitude-7490", "Dell Latitude 7490", "Computers", "NGN 285,000", 28500000, "Yaba Laptop Square", "Yaba", "4.6", "Office laptop, clean keyboard, charger included"],
    ["macbook-air-m1", "MacBook Air M1 2020", "Computers", "NGN 720,000", 72000000, "Lekki Apple Resale", "Lekki", "4.9", "Verified serial, battery health report, escrow eligible"],
    ["lenovo-thinkpad-t480", "Lenovo ThinkPad T480", "Computers", "NGN 265,000", 26500000, "Yaba Laptop Square", "Yaba", "4.5", "Durable ThinkPad with 8GB RAM and SSD"],
    ["lg-inverter-ac", "LG 1.5HP Inverter AC", "Electronics", "NGN 468,000", 46800000, "Alaba Cooling Centre", "Alaba International", "4.8", "Energy-saving AC with installation partner"],
    ["sony-soundbar", "Sony 400W Soundbar", "Electronics", "NGN 235,000", 23500000, "Alaba Audio World", "Alaba International", "4.6", "Original soundbar with serial verification"],
    ["binatone-blender", "Binatone blender and grinder", "Electronics", "NGN 42,000", 4200000, "Balogun Home Store", "Balogun Market", "4.4", "Kitchen appliance with vendor warranty"],
    ["aso-oke-premium", "Premium Aso Oke set", "Fashion", "NGN 82,000", 8200000, "Balogun Fabrics Direct", "Balogun Market", "4.8", "Ceremony-ready woven fabric set"],
    ["adire-kimono", "Adire kimono jacket", "Fashion", "NGN 38,500", 3850000, "Kano Leather Guild", "Kano", "4.6", "Handmade adire fashion piece with tracked delivery"],
    ["nike-air-max-lagos", "Nike Air Max sneakers", "Fashion", "NGN 118,000", 11800000, "Lekki Sneaker Room", "Lekki", "4.7", "Verified imported sneakers with box"],
    ["suya-grill-set", "Outdoor suya grill set", "Home Power", "NGN 96,000", 9600000, "Kano Home Tools", "Kano", "4.5", "Metal grill set for home and small business use"],
    ["solar-battery-200ah", "200AH solar battery", "Home Power", "NGN 275,000", 27500000, "PH Power Tools", "Port Harcourt", "4.7", "Deep-cycle battery with installer option"],
    ["stabilizer-5kva", "5KVA voltage stabilizer", "Home Power", "NGN 88,000", 8800000, "Alaba Power Mart", "Alaba International", "4.5", "Home appliance protection with receipt"],
    ["standing-fan-qasa", "Qasa rechargeable standing fan", "Home Power", "NGN 64,000", 6400000, "Balogun Home Store", "Balogun Market", "4.4", "Rechargeable fan for power-aware homes"],
    ["office-chair-ergonomic", "Ergonomic office chair", "Home Power", "NGN 115,000", 11500000, "Abuja Office Mart", "Abuja", "4.6", "Mesh office chair, delivery to Abuja/Lagos"],
    ["ring-light-kit", "Creator ring light kit", "Electronics", "NGN 52,000", 5200000, "Yaba Creator Gear", "Yaba", "4.7", "Ring light, tripod, phone clamp for creators"]
  ] satisfies Array<[string, string, string, string, number, string, string, string, string]>).map(([id, title, category, price, priceKobo, vendor, location, rating, subtitle]) => ({
    id,
    vertical: "shop" as const,
    title,
    subtitle,
    price,
    rating,
    location,
    badge: "Verified",
    image: "/stitch/naijashop_marketplace.png",
    category,
    vendor,
    priceKobo: Number(priceKobo),
    tags: [String(title).toLowerCase(), String(category).toLowerCase(), String(location).toLowerCase()],
    description: `${subtitle}. Seller is verified for NaijaPay escrow, QR delivery proof, and support window.`
  })),
  ...([
    ["jollof-max-bowl", "Smoky party jollof max bowl", "Rice", "NGN 5,200", 520000, "Jollof Republic VI", "Victoria Island", "4.8", "Party-style jollof, chicken, plantain, dispatch in 10 min"],
    ["ofada-stew-pack", "Ofada rice and ayamase", "Rice", "NGN 4,900", 490000, "Ofada House Surulere", "Surulere", "4.7", "Spicy ayamase, assorted meat, kitchen ready"],
    ["egusi-poundo", "Egusi soup with poundo", "Soup", "NGN 6,100", 610000, "Mama Put Lekki", "Lekki", "4.6", "Rich egusi, beef, stockfish, swallow included"],
    ["pepper-soup-catfish", "Catfish pepper soup", "Soup", "NGN 7,500", 750000, "PH Pepper Kitchen", "Port Harcourt", "4.8", "Fresh catfish, spicy broth, sealed hot bowl"],
    ["suya-platter", "Abuja suya platter", "Grills", "NGN 8,400", 840000, "Wuse Suya Spot", "Abuja", "4.9", "Beef suya, masa, onions, yaji, dispatch in 15 min"],
    ["grilled-chicken-family", "Grilled chicken family tray", "Grills", "NGN 18,500", 1850000, "Lekki Cloud Grill", "Lekki", "4.7", "Family tray with chips and sauces"],
    ["small-chops-box", "Small chops party box", "Fast Food", "NGN 12,000", 1200000, "Yaba Event Bites", "Yaba", "4.6", "Spring rolls, samosa, puff-puff, chicken bites"],
    ["burger-lagos", "Lagos beef burger combo", "Fast Food", "NGN 6,800", 680000, "Mainland Burger Co", "Yaba", "4.5", "Burger, fries, chilled drink"],
    ["banga-starch", "Banga soup and starch", "Local Meals", "NGN 6,700", 670000, "Delta Kitchen PH", "Port Harcourt", "4.8", "Banga soup, starch, catfish option"],
    ["tuwo-miyan-kuka", "Tuwo and miyan kuka", "Local Meals", "NGN 4,500", 450000, "Kano Native Bowls", "Kano", "4.7", "Northern meal bowl with beef garnish"]
  ] satisfies Array<[string, string, string, string, number, string, string, string, string]>).map(([id, title, category, price, priceKobo, vendor, location, rating, subtitle]) => ({
    id,
    vertical: "eats" as const,
    title,
    subtitle,
    price,
    rating,
    location,
    badge: "Kitchen Ready",
    image: "/stitch/naijaeats_home_hub.png",
    category,
    vendor,
    priceKobo: Number(priceKobo),
    tags: [String(title).toLowerCase(), String(category).toLowerCase(), String(vendor).toLowerCase(), String(location).toLowerCase()],
    description: `${subtitle}. Restaurant has prep-time tracking, dispatch priority, and customer support handoff.`
  }))
]);

function formatNairaFromKobo(kobo: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(kobo / 100);
}

function readStore(): DemoStore {
  if (typeof window === "undefined") return seedStore;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return seedStore;
  try {
    return { ...seedStore, ...JSON.parse(raw) } as DemoStore;
  } catch {
    return seedStore;
  }
}

export function useDemoStore() {
  const [store, setStore] = useState<DemoStore>(seedStore);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setStore(readStore());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }, [loaded, store]);

  const api = useMemo(() => {
    const updateCart = (cart: CartLine[]) => setStore((current) => ({ ...current, cart }));
    const findItem = (id: string) => demoListings.find((item) => item.id === id);

    return {
      ...store,
      loaded,
      listings: demoListings,
      formatMoney: formatNairaFromKobo,
      findItem,
      cartLines: store.cart.map((line) => ({ ...line, item: findItem(line.itemId) })).filter((line) => line.item),
      cartTotalKobo: store.cart.reduce((total, line) => total + (findItem(line.itemId)?.priceKobo ?? 0) * line.quantity, 0),
      addToCart: (itemId: string, quantity = 1) => {
        setStore((current) => {
          const existing = current.cart.find((line) => line.itemId === itemId);
          const cart = existing
            ? current.cart.map((line) => (line.itemId === itemId ? { ...line, quantity: Math.min(12, line.quantity + quantity) } : line))
            : [...current.cart, { itemId, quantity }];
          return { ...current, cart };
        });
      },
      setQuantity: (itemId: string, quantity: number) => {
        updateCart(quantity <= 0 ? store.cart.filter((line) => line.itemId !== itemId) : store.cart.map((line) => (line.itemId === itemId ? { ...line, quantity } : line)));
      },
      removeFromCart: (itemId: string) => updateCart(store.cart.filter((line) => line.itemId !== itemId)),
      clearCart: () => updateCart([]),
      toggleSaved: (itemId: string) => {
        setStore((current) => ({
          ...current,
          savedItemIds: current.savedItemIds.includes(itemId)
            ? current.savedItemIds.filter((id) => id !== itemId)
            : [...current.savedItemIds, itemId]
        }));
      },
      saveAccount: (account: DemoAccount) => setStore((current) => ({ ...current, account: { ...account, signedIn: true } })),
      signOut: () => setStore((current) => ({ ...current, account: { ...current.account, signedIn: false } })),
      createOrder: (checkout: CheckoutInfo) => {
        const orderId = `ND-${Math.floor(1000 + Math.random() * 9000)}`;
        setStore((current) => {
          const orderItems = current.cart
            .map((line) => {
              const item = findItem(line.itemId);
              return item ? { ...line, title: item.title, priceKobo: item.priceKobo, vertical: item.vertical } : null;
            })
            .filter((item): item is DemoOrder["items"][number] => Boolean(item));
          const totalKobo = orderItems.reduce((total, line) => total + line.priceKobo * line.quantity, 0);
          const order: DemoOrder = {
            id: orderId,
            items: orderItems,
            totalKobo,
            status: "confirmed",
            createdAt: new Date().toISOString(),
            checkout,
            tracking: seedTracking.map((event, index) => ({ ...event, done: index < 2 }))
          };
          return {
            ...current,
            cart: [],
            orders: [order, ...current.orders],
            walletBalanceKobo: checkout.paymentMethod === "wallet" ? current.walletBalanceKobo - totalKobo : current.walletBalanceKobo,
            transactions: [
              {
                id: `TX-${Date.now()}`,
                label: checkout.paymentMethod === "wallet" ? "Checkout escrow hold" : "Checkout registered",
                amountKobo: checkout.paymentMethod === "wallet" ? -totalKobo : 0,
                type: "hold",
                createdAt: new Date().toISOString(),
                detail: `${orderId} paid by ${checkout.paymentMethod}`
              },
              ...current.transactions
            ],
            escrowHolds: [
              { id: `ESC-${orderId}`, orderId, amountKobo: totalKobo, status: "held", reason: "Awaiting QR pickup and delivery proof" },
              ...current.escrowHolds
            ]
          };
        });
        return orderId;
      },
      updateOrderStatus: (orderId: string, status: DemoOrder["status"]) => {
        setStore((current) => ({
          ...current,
          orders: current.orders.map((order) =>
            order.id === orderId
              ? {
                  ...order,
                  status,
                  tracking: order.tracking.map((event, index) => ({
                    ...event,
                    ...(status === "delivered" && index === order.tracking.length - 1
                      ? {
                          label: "Delivered",
                          detail: "Customer QR proof captured and escrow release queue opened.",
                          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        }
                      : {}),
                    done:
                      status === "delivered" ||
                      (status === "in-transit" && index <= 3) ||
                      (status === "dispatching" && index <= 2) ||
                      (status === "confirmed" && index <= 1) ||
                      (status === "created" && index === 0)
                  }))
                }
              : order
          )
        }));
      },
      saveSubmission: (submission: Omit<OnboardingSubmission, "id" | "createdAt" | "status">) => {
        setStore((current) => ({
          ...current,
          submissions: [
            { ...submission, id: `ONB-${Date.now()}`, createdAt: new Date().toISOString(), status: "submitted" },
            ...current.submissions
          ]
        }));
      },
      createDelivery: (delivery: Omit<DeliveryBooking, "id" | "createdAt" | "status">) => {
        const id = `SEND-${Math.floor(1000 + Math.random() * 9000)}`;
        setStore((current) => ({
          ...current,
          deliveries: [
            { ...delivery, id, createdAt: new Date().toISOString(), status: "assigned" },
            ...current.deliveries
          ],
          transactions: [
            {
              id: `TX-${Date.now()}`,
              label: "NaijaSend delivery booked",
              amountKobo: -delivery.estimateKobo,
              type: "debit",
              createdAt: new Date().toISOString(),
              detail: `${id} assigned to ${delivery.courier}`
            },
            ...current.transactions
          ]
        }));
        return id;
      }
    };
  }, [loaded, store]);

  return api;
}
