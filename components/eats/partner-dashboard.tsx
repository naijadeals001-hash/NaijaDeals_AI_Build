"use client";

import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Circle as LeafletCircle, LayerGroup, Map as LeafletMap, Marker as LeafletMarker } from "leaflet";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Bell,
  Bike,
  Car,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock,
  CreditCard,
  ExternalLink,
  FileText,
  Footprints,
  Headphones,
  Info,
  LayoutDashboard,
  Loader2,
  LocateFixed,
  LogOut,
  MapPin,
  Menu,
  Navigation,
  PackageCheck,
  Phone,
  ReceiptText,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Timer,
  Truck,
  User,
  Utensils,
  WalletCards,
  X,
  Zap
} from "lucide-react";

/* ------------------------------------------------------------------------- */
/* Shared types — imported by the server page.                               */
/* ------------------------------------------------------------------------- */

export type PartnerTransportKind = "courier" | "driver";

export type PartnerTransportStatus = "approved" | "pending" | "suspended" | "inactive" | "not_enabled";

export type PartnerTransport = {
  kind: PartnerTransportKind;
  id: string;
  label: string;
  rawVehicle: string;
  online: boolean;
  approved: boolean;
  status: PartnerTransportStatus;
  statusLabel: string;
  serviceZone: string | null;
  cityActive: boolean;
  plate: string | null;
  makeModel: string | null;
  insulatedBag: boolean | null;
  licenceMasked: string | null;
  note: string;
};

export type PartnerDelivery = {
  id: string;
  deliveredAt: string | null;
  orderNumber: string;
  deliveryAddress: string;
  paymentStatus: string;
  totalKobo: string;
  restaurantName: string;
  market: string;
};

export type ActiveDelivery = {
  dispatchId: string;
  status: string;
  pickedUpAt: string | null;
  updatedAt: string;
  order: {
    id: string;
    orderNumber: string;
    status: string;
    deliveryAddress: string;
    contactName: string;
    contactPhone: string;
    paymentStatus: string;
    totalKobo: string;
    restaurant: { name: string; address: string; phone: string; market: string };
  };
};

export type PartnerLedgerRow = {
  id: string;
  amountKobo: string;
  memo: string;
  createdAt: string;
  reference: string;
  description: string;
};

export type PartnerDashboardData = {
  partner: {
    name: string;
    email: string;
    phone: string | null;
    greeting: string;
    city: string | null;
    cityActive: boolean;
    online: boolean;
    activeTransportKind: PartnerTransportKind | null;
    ready: boolean;
  };
  transports: PartnerTransport[];
  stats: {
    earningsTodayKobo: string;
    earningsWeekKobo: string;
    earningsAllKobo: string;
    completedToday: number;
    currency: string;
  };
  activeDelivery: ActiveDelivery | null;
  recentDeliveries: PartnerDelivery[];
  wallet: {
    availableKobo: string;
    heldKobo: string;
    currency: string;
    rows: Array<{ id: string; ownerType: string; availableKobo: string; heldKobo: string }>;
    recent: PartnerLedgerRow[];
  };
};

export type GeoPositionPayload = {
  latitude: number;
  longitude: number;
  accuracyM: number;
  capturedAt: string;
};

export type AvailabilityInput = {
  transport: PartnerTransportKind;
  online: boolean;
  position?: GeoPositionPayload | null;
};

export type SelectTransportInput = {
  transport: PartnerTransportKind;
  position?: GeoPositionPayload | null;
};

export type AvailabilityResult = {
  ok: boolean;
  code?: string;
  message: string;
  online?: boolean;
};

export type OfferMeta = {
  orderNumber: string;
  paymentStatus: string;
  paymentLabel: string;
  itemCount: number;
  itemQuantity: number;
  vehicleNeed: string;
  orderStatus: string;
};

export type PartnerActions = {
  updateAvailability: (input: AvailabilityInput) => Promise<AvailabilityResult>;
  selectTransport: (input: SelectTransportInput) => Promise<AvailabilityResult>;
  loadOfferMeta: (offerId: string) => Promise<OfferMeta | null>;
};

/* ------------------------------------------------------------------------- */
/* Local types and constants                                                 */
/* ------------------------------------------------------------------------- */

export type PartnerViewId = "overview" | "deliveries" | "earnings" | "wallet" | "transport" | "support" | "settings";
type ViewId = PartnerViewId;

type Offer = {
  offerId: string;
  dispatchId: string;
  orderNumber: string;
  restaurant: { name: string; market: string; address?: string } | null;
  area: string | null;
  earningsKobo: string;
  expiresAt: string;
  vehicleNeed: string;
  queue: PartnerTransportKind;
};

type GeoFix = GeoPositionPayload;
type GeoState = "idle" | "requesting" | "granted" | "denied" | "unavailable" | "timeout" | "unsupported";
type Notice = { tone: "ok" | "error" | "info"; text: string } | null;
type PendingIntent = { type: "go-online" } | { type: "switch"; transport: PartnerTransportKind };

const NAV_ITEMS: Array<{ id: ViewId; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "deliveries", label: "Deliveries", icon: PackageCheck },
  { id: "earnings", label: "Earnings", icon: CircleDollarSign },
  { id: "wallet", label: "Wallet & payouts", icon: WalletCards },
  { id: "transport", label: "Transport & documents", icon: FileText },
  { id: "support", label: "Support", icon: Headphones },
  { id: "settings", label: "Settings", icon: Settings }
];

const CITY_CENTRES: Record<string, { centre: [number, number]; zoom: number }> = {
  lagos: { centre: [6.5244, 3.3792], zoom: 12 },
  abuja: { centre: [9.0765, 7.3986], zoom: 12 },
  "port harcourt": { centre: [4.8156, 7.0498], zoom: 12 },
  ibadan: { centre: [7.3775, 3.947], zoom: 12 },
  kano: { centre: [12.0022, 8.592], zoom: 12 },
  enugu: { centre: [6.4584, 7.5464], zoom: 12 },
  "benin city": { centre: [6.335, 5.6037], zoom: 12 },
  kaduna: { centre: [10.5222, 7.4383], zoom: 12 },
  accra: { centre: [5.6037, -0.187], zoom: 12 },
  kumasi: { centre: [6.6885, -1.6244], zoom: 12 },
  nairobi: { centre: [-1.2921, 36.8219], zoom: 12 },
  mombasa: { centre: [-4.0435, 39.6682], zoom: 12 },
  johannesburg: { centre: [-26.2041, 28.0473], zoom: 11 },
  "cape town": { centre: [-33.9249, 18.4241], zoom: 11 },
  durban: { centre: [-29.8587, 31.0218], zoom: 11 },
  london: { centre: [51.5072, -0.1276], zoom: 11 },
  manchester: { centre: [53.4808, -2.2426], zoom: 11 },
  birmingham: { centre: [52.4862, -1.8904], zoom: 11 },
  "new york": { centre: [40.7128, -74.006], zoom: 11 },
  atlanta: { centre: [33.749, -84.388], zoom: 11 },
  houston: { centre: [29.7604, -95.3698], zoom: 11 }
};

const NIGERIA_CENTRE: { centre: [number, number]; zoom: number } = { centre: [9.082, 8.6753], zoom: 6 };
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const STALE_LOCATION_MS = 90_000;

function formatMoney(value: string | number | bigint, currency = "NGN") {
  const minor = typeof value === "bigint" ? value : BigInt(String(value || "0"));
  const negative = minor < BigInt(0);
  const absolute = negative ? -minor : minor;
  const major = absolute / BigInt(100);
  const fraction = absolute % BigInt(100);
  const amount = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(Number(major));
  const symbol = currency === "NGN" ? "₦" : `${currency} `;
  return `${negative ? "-" : ""}${symbol}${amount}${fraction ? `.${fraction.toString().padStart(2, "0")}` : ""}`;
}

function formatDateTime(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-NG", {
    timeZone: "Africa/Lagos",
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatTimeAgoSeconds(seconds: number | null) {
  if (seconds === null) return "no reading yet";
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function vehicleIcon(rawVehicle: string) {
  const value = rawVehicle.toLowerCase();
  if (value.includes("bicycle") || value.includes("bike") || value.includes("motor") || value.includes("scooter") || value.includes("moped")) return Bike;
  if (value.includes("car")) return Car;
  if (value.includes("van") || value.includes("truck")) return Truck;
  if (value.includes("walk") || value.includes("foot") || value.includes("pedestrian")) return Footprints;
  if (value.includes("tricycle") || value.includes("keke")) return Truck;
  if (value.includes("electric")) return Zap;
  return Bike;
}

function vehicleNeedLabel(value: string) {
  if (value === "car") return "Car or van";
  if (value === "motorcycle") return "Motorbike";
  return value || "Not specified";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "NA";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function cityMap(city: string | null) {
  if (!city) return NIGERIA_CENTRE;
  const clean = city.trim().toLowerCase();
  if (CITY_CENTRES[clean]) return CITY_CENTRES[clean];
  const match = Object.keys(CITY_CENTRES).find((key) => clean.includes(key));
  return match ? CITY_CENTRES[match] : NIGERIA_CENTRE;
}

function statusTone(status: PartnerTransportStatus) {
  switch (status) {
    case "approved":
      return "bg-[#e4f7e9] text-[#086536]";
    case "pending":
      return "bg-[#fff0d9] text-[#9a4a08]";
    case "suspended":
      return "bg-[#fde8e8] text-[#a31818]";
    case "inactive":
      return "bg-[#eef1ef] text-[#4a5a50]";
    default:
      return "bg-[#eef1ef] text-[#4a5a50]";
  }
}

function walletOwnerLabel(ownerType: string) {
  switch (ownerType) {
    case "COURIER":
      return "Courier partner wallet";
    case "DRIVER":
      return "Driver partner wallet";
    case "VENDOR":
      return "Vendor wallet";
    case "CUSTOMER":
      return "Customer wallet";
    case "SYSTEM":
      return "Platform wallet";
    default:
      return ownerType;
  }
}

function paymentLabel(status: string) {
  const value = status.toLowerCase();
  if (value === "paid") return "Paid online";
  if (value === "pending") return "Payment pending";
  if (value === "refunded") return "Refunded";
  return status;
}

/* ------------------------------------------------------------------------- */
/* Dashboard                                                                 */
/* ------------------------------------------------------------------------- */

export function PartnerDashboard({
  data,
  actions,
  initialView = "overview"
}: {
  data: PartnerDashboardData;
  actions: PartnerActions;
  initialView?: PartnerViewId;
}) {
  const router = useRouter();
  const [view, setView] = useState<ViewId>(initialView);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [online, setOnline] = useState(data.partner.online);
  const [selectedKind, setSelectedKind] = useState<PartnerTransportKind>(
    data.partner.activeTransportKind ?? data.transports[0]?.kind ?? "courier"
  );
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [intent, setIntent] = useState<PendingIntent | null>(null);
  const [geoState, setGeoState] = useState<GeoState>("idle");
  const [position, setPosition] = useState<GeoFix | null>(null);
  const [followLocation, setFollowLocation] = useState(true);
  const [recenterNonce, setRecenterNonce] = useState(0);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offersStatus, setOffersStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [offersError, setOffersError] = useState("");
  const [clockOffset, setClockOffset] = useState(0);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [offerMeta, setOfferMeta] = useState<OfferMeta | null>(null);
  const [offerMetaStatus, setOfferMetaStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [offerBusy, setOfferBusy] = useState<"accept" | "decline" | null>(null);
  const [offerAnnouncement, setOfferAnnouncement] = useState("");
  const watchIdRef = useRef<number | null>(null);
  const expiredRef = useRef<string | null>(null);

  const activeTransport = useMemo(
    () => data.transports.find((transport) => transport.kind === selectedKind) ?? data.transports[0] ?? null,
    [data.transports, selectedKind]
  );

  useEffect(() => {
    setOnline(data.partner.online);
    if (data.partner.activeTransportKind) setSelectedKind(data.partner.activeTransportKind);
  }, [data.partner.online, data.partner.activeTransportKind]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 8000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
  }, []);

  const applyWatchError = useCallback(
    (code: number) => {
      if (code === 1) {
        setGeoState("denied");
        stopWatch();
      } else if (code === 2) {
        setGeoState("unavailable");
      } else if (code === 3) {
        setGeoState("timeout");
      } else {
        setGeoState("unavailable");
      }
    },
    [stopWatch]
  );

  const startWatch = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGeoState("unsupported");
      return;
    }
    stopWatch();
    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (fix) => {
          setPosition({
            latitude: fix.coords.latitude,
            longitude: fix.coords.longitude,
            accuracyM: fix.coords.accuracy,
            capturedAt: new Date(fix.timestamp).toISOString()
          });
          setGeoState("granted");
        },
        (error) => applyWatchError(error.code),
        { enableHighAccuracy: true, timeout: 20_000, maximumAge: 10_000 }
      );
    } catch {
      setGeoState("unsupported");
    }
  }, [applyWatchError, stopWatch]);

  // If the partner arrives already online, only resume a watcher when the
  // browser has already been granted permission. Never prompt without a click.
  useEffect(() => {
    if (!data.partner.online) return;
    let cancelled = false;
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGeoState("unsupported");
      return;
    }
    if (!navigator.permissions?.query) return;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (cancelled) return;
        if (status.state === "granted") startWatch();
        else if (status.state === "denied") setGeoState("denied");
        else setGeoState("idle");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [data.partner.online, startWatch]);

  useEffect(() => {
    return () => {
      stopWatch();
    };
  }, [stopWatch]);

  const readDevicePosition = useCallback((): Promise<GeoFix> => {
    return new Promise((resolve, reject) => {
      if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
        setGeoState("unsupported");
        reject(new Error("unsupported"));
        return;
      }
      setGeoState("requesting");
      navigator.geolocation.getCurrentPosition(
        (fix) =>
          resolve({
            latitude: fix.coords.latitude,
            longitude: fix.coords.longitude,
            accuracyM: fix.coords.accuracy,
            capturedAt: new Date(fix.timestamp).toISOString()
          }),
        (error) => {
          applyWatchError(error.code);
          reject(new Error(error.code === 1 ? "denied" : error.code === 2 ? "unavailable" : "timeout"));
        },
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 }
      );
    });
  }, [applyWatchError]);

  const requestEnableLocation = useCallback(
    (nextIntent: PendingIntent) => {
      setIntent(nextIntent);
    },
    []
  );

  async function confirmLocationIntent() {
    if (!intent || !activeTransport) return;
    const target = intent.type === "switch" ? intent.transport : selectedKind;
    setIntent(null);
    setAvailabilityBusy(true);
    try {
      const fix = await readDevicePosition();
      setPosition(fix);
      setFollowLocation(true);
      const result =
        intent.type === "switch"
          ? await actions.selectTransport({ transport: target, position: fix })
          : await actions.updateAvailability({ transport: target, online: true, position: fix });
      if (!result.ok) {
        setNotice({ tone: "error", text: result.message });
        return;
      }
      setSelectedKind(target);
      setOnline(Boolean(result.online));
      if (result.online) startWatch();
      setNotice({ tone: "ok", text: result.message });
      router.refresh();
    } catch (error) {
      const code = error instanceof Error ? error.message : "unavailable";
      setNotice({
        tone: "error",
        text:
          code === "denied"
            ? "Location permission was denied. Allow location for this site in your browser settings, then try again."
            : code === "timeout"
              ? "The location request timed out. Move to an open area and try again."
              : code === "unsupported"
                ? "This browser does not support device location, so you cannot go online from it."
                : "Your device could not provide a location. Check that location services are on and try again."
      });
    } finally {
      setAvailabilityBusy(false);
    }
  }

  async function goOffline() {
    if (!activeTransport) return;
    setAvailabilityBusy(true);
    stopWatch();
    try {
      const result = await actions.updateAvailability({ transport: activeTransport.kind, online: false });
      if (!result.ok) {
        setNotice({ tone: "error", text: result.message });
        if (online) startWatch();
        return;
      }
      setOnline(false);
      setNotice({ tone: "ok", text: result.message });
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: "Could not go offline. Try again." });
      if (online) startWatch();
    } finally {
      setAvailabilityBusy(false);
    }
  }

  function selectTransport(kind: PartnerTransportKind) {
    const transport = data.transports.find((row) => row.kind === kind);
    if (!transport) return;
    if (!transport.approved) {
      setNotice({ tone: "error", text: `${transport.label}: ${transport.note}` });
      return;
    }
    if (!online) {
      setSelectedKind(kind);
      setNotice({ tone: "info", text: `${transport.label} will be used when you go online.` });
      return;
    }
    requestEnableLocation({ type: "switch", transport: kind });
  }

  async function signOut() {
    stopWatch();
    try {
      if (online && activeTransport) {
        await actions.updateAvailability({ transport: activeTransport.kind, online: false });
      }
    } catch {
      // A failed presence update must never trap the partner in the account.
    }
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
    router.push("/login");
    router.refresh();
  }

  const loadOffers = useCallback(async () => {
    if (!online || data.activeDelivery) {
      setOffers([]);
      setOffersStatus("idle");
      return;
    }
    setOffersStatus((current) => (current === "ready" ? current : "loading"));
    try {
      const response = await fetch("/api/eats/dispatch/offers", { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 401 ? "Sign in again to load delivery requests." : "Delivery requests could not be loaded.");
      const body = (await response.json()) as { courier?: Omit<Offer, "queue">[]; driver?: Omit<Offer, "queue">[] };
      const serverDate = response.headers.get("date");
      if (serverDate) {
        const parsed = Date.parse(serverDate);
        if (Number.isFinite(parsed)) setClockOffset(parsed - Date.now());
      }
      const next = [
        ...(body.courier ?? []).map((offer) => ({ ...offer, queue: "courier" as const })),
        ...(body.driver ?? []).map((offer) => ({ ...offer, queue: "driver" as const }))
      ]
        .filter((offer) => offer.queue === selectedKind)
        .sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt));
      setOffers(next);
      setOffersError("");
      setOffersStatus("ready");
    } catch (error) {
      setOffersError(error instanceof Error ? error.message : "Delivery requests could not be loaded.");
      setOffersStatus("error");
    }
  }, [online, data.activeDelivery, selectedKind]);

  useEffect(() => {
    if (!online || data.activeDelivery) {
      setOffers([]);
      setOffersStatus("idle");
      return;
    }
    void loadOffers();
    const timer = window.setInterval(() => void loadOffers(), 10_000);
    return () => window.clearInterval(timer);
  }, [online, data.activeDelivery, loadOffers]);

  const primaryOffer = offers[0] ?? null;
  const secondsLeft = primaryOffer
    ? Math.max(0, Math.ceil((Date.parse(primaryOffer.expiresAt) - (nowTick + clockOffset)) / 1000))
    : 0;
  const offerExpired = Boolean(primaryOffer && secondsLeft <= 0);

  useEffect(() => {
    if (!primaryOffer) {
      setOfferMeta(null);
      setOfferMetaStatus("idle");
      setOfferAnnouncement("");
      return;
    }
    let cancelled = false;
    setOfferMetaStatus("loading");
    setOfferMeta(null);
    setOfferAnnouncement(
      `New delivery request from ${primaryOffer.restaurant?.name ?? "the kitchen"} in ${primaryOffer.area ?? "your area"}. Check the expiry timer before accepting.`
    );
    void actions
      .loadOfferMeta(primaryOffer.offerId)
      .then((meta) => {
        if (cancelled) return;
        if (!meta) {
          setOfferMetaStatus("error");
          return;
        }
        setOfferMeta(meta);
        setOfferMetaStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setOfferMetaStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [primaryOffer?.offerId, actions]);

  useEffect(() => {
    if (!primaryOffer || !offerExpired) return;
    if (expiredRef.current === primaryOffer.offerId) return;
    expiredRef.current = primaryOffer.offerId;
    setOfferAnnouncement("That delivery request has expired. Checking for the next request.");
    const timer = window.setTimeout(() => void loadOffers(), 1200);
    return () => window.clearTimeout(timer);
  }, [primaryOffer, offerExpired, loadOffers]);

  async function actOnOffer(offer: Offer, action: "accept" | "decline") {
    if (offerBusy) return;
    setOfferBusy(action);
    try {
      const response = await fetch(`/api/eats/dispatch/offers/${encodeURIComponent(offer.offerId)}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setNotice({ tone: "error", text: body.error ?? "That delivery request could not be taken." });
        await loadOffers();
        router.refresh();
        return;
      }
      setOffers([]);
      if (action === "accept") {
        setView("deliveries");
        setNotice({ tone: "ok", text: "Delivery accepted. Confirm the pickup PIN when the kitchen hands over the food." });
      } else {
        setNotice({ tone: "info", text: "Delivery request declined." });
        await loadOffers();
      }
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: "The request could not be completed. Check your connection and try again." });
    } finally {
      setOfferBusy(null);
    }
  }

  const livePositionAgeSeconds = position
    ? Math.max(0, Math.floor((nowTick - Date.parse(position.capturedAt)) / 1000))
    : null;
  const stale = livePositionAgeSeconds !== null && livePositionAgeSeconds > STALE_LOCATION_MS / 1000;

  const activeDelivery = data.activeDelivery;

  function openView(next: ViewId) {
    setView(next);
    setDrawerOpen(false);
  }

  return (
    <div className="min-h-screen bg-[#f7f9f8] text-[#14241b]">
      <a
        href="#partner-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[80] focus:rounded-lg focus:bg-[#0b5c33] focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to dashboard
      </a>

      <div className="lg:flex">
        <aside className="hidden w-[256px] shrink-0 border-r border-[#e8ede9] bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
          <div className="px-5 pb-5 pt-5">
            <BrandMark />
          </div>
          <SidebarNav view={view} onSelect={openView} />
          <div className="mt-auto border-t border-[#eef1ef] p-4">
            <Link href="/account" className="flex items-center gap-2.5 rounded-xl p-2 transition hover:bg-[#f4f8f5]">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[#0b5c33] text-[12px] font-extrabold text-white">{initials(data.partner.name)}</span>
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-extrabold text-[#14241b]">NaijaDeals</span>
                <span className="block truncate text-[11px] text-[#6b7a70]">partner account</span>
              </span>
            </Link>
            <Link href="/" className="mt-1 flex items-center gap-2 rounded-xl px-2 py-2 text-[12px] font-bold text-[#4a5a50] transition hover:bg-[#f4f8f5] hover:text-[#0b5c33]">
              <ArrowLeftRight className="h-4 w-4" aria-hidden="true" /> Switch service
            </Link>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <DashboardHeader
            data={data}
            onOpenMenu={() => setDrawerOpen(true)}
            onOpenSettings={() => openView("settings")}
            onSignOut={() => void signOut()}
          />

          <div aria-live="polite" className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8">
            {notice ? (
              <div
                role={notice.tone === "error" ? "alert" : "status"}
                className={`mt-3 flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-[12px] font-semibold ${
                  notice.tone === "error"
                    ? "border-[#f3c6c2] bg-[#fdf0ef] text-[#8f1d18]"
                    : notice.tone === "ok"
                      ? "border-[#cfe8d4] bg-[#eef9f1] text-[#0b5c33]"
                      : "border-[#d7e4da] bg-white text-[#40564a]"
                }`}
              >
                <span>{notice.text}</span>
                <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message" className="shrink-0 rounded p-0.5 hover:bg-black/5">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </div>

          <main id="partner-main" className="mx-auto w-full max-w-[1400px] px-4 pb-16 pt-3 sm:px-6 lg:px-8 lg:pt-4">
            {view === "overview" ? (
              <OverviewView
                data={data}
                online={online}
                activeTransport={activeTransport}
                activeDelivery={activeDelivery}
                availabilityBusy={availabilityBusy}
                position={position}
                positionAgeSeconds={livePositionAgeSeconds}
                stale={stale}
                geoState={geoState}
                followLocation={followLocation}
                recenterNonce={recenterNonce}
                offer={primaryOffer}
                offerMeta={offerMeta}
                offerMetaStatus={offerMetaStatus}
                offerBusy={offerBusy}
                offerExpired={offerExpired}
                secondsLeft={secondsLeft}
                offersStatus={offersStatus}
                offersError={offersError}
                offerAnnouncement={offerAnnouncement}
                onGoOnline={() => requestEnableLocation({ type: "go-online" })}
                onGoOffline={() => void goOffline()}
                onSelectTransport={selectTransport}
                onRequestLocation={() => {
                  setGeoState("idle");
                  setIntent({ type: "go-online" });
                }}
                onFollowChange={setFollowLocation}
                onRecenter={() => {
                  if (position) {
                    setFollowLocation(true);
                    setRecenterNonce((value) => value + 1);
                  } else {
                    setIntent({ type: "go-online" });
                  }
                }}
                onAccept={(offer) => void actOnOffer(offer, "accept")}
                onDecline={(offer) => void actOnOffer(offer, "decline")}
                onReloadOffers={() => void loadOffers()}
                onOpenDeliveries={() => openView("deliveries")}
                onOpenTransport={() => openView("transport")}
                onOpenSupport={() => openView("support")}
              />
            ) : null}
            {view === "deliveries" ? (
              <DeliveriesView data={data} online={online} onGoOnline={() => requestEnableLocation({ type: "go-online" })} />
            ) : null}
            {view === "earnings" ? <EarningsView data={data} /> : null}
            {view === "wallet" ? <WalletView data={data} /> : null}
            {view === "transport" ? (
              <TransportView
                data={data}
                online={online}
                selectedKind={selectedKind}
                onSelect={selectTransport}
                onGoOnline={() => requestEnableLocation({ type: "go-online" })}
              />
            ) : null}
            {view === "support" ? <SupportView data={data} /> : null}
            {view === "settings" ? (
              <SettingsView
                data={data}
                onNotice={setNotice}
                onRefresh={() => router.refresh()}
              />
            ) : null}
          </main>
        </div>
      </div>

      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        view={view}
        onSelect={openView}
        partnerName={data.partner.name}
      />

      {intent ? (
        <LocationDialog
          intent={intent}
          transportLabel={
            intent.type === "switch"
              ? data.transports.find((transport) => transport.kind === intent.transport)?.label ?? "transport"
              : activeTransport?.label ?? "transport"
          }
          city={data.partner.city}
          geoState={geoState}
          busy={availabilityBusy}
          onCancel={() => setIntent(null)}
          onConfirm={() => void confirmLocationIntent()}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Shell pieces                                                              */
/* ------------------------------------------------------------------------- */

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/naijaeats" className="flex min-w-0 items-center gap-2.5" aria-label="NaijaEats Partner — delivery workspace">
      <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#eaf7ee] text-[#0b5c33]">
        <Bike className="h-[22px] w-[22px]" aria-hidden="true" />
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#f26b21]" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-display text-[18px] font-extrabold leading-5 tracking-tight text-[#0b5c33]">
          NaijaEats <span className="text-[#f26b21]">Partner</span>
        </span>
        {!compact ? <span className="block truncate text-[10.5px] font-medium text-[#6b7a70]">Delivery workspace</span> : null}
      </span>
    </Link>
  );
}

function SidebarNav({ view, onSelect }: { view: ViewId; onSelect: (view: ViewId) => void }) {
  return (
    <nav aria-label="Partner dashboard" className="px-3">
      <ul className="space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[13px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b5c33] ${
                  active ? "bg-[#eaf7ee] font-extrabold text-[#0b5c33]" : "font-semibold text-[#40564a] hover:bg-[#f4f8f5] hover:text-[#0b5c33]"
                }`}
              >
                <Icon className={`h-[19px] w-[19px] shrink-0 ${active ? "text-[#0b8f47]" : "text-[#6b7a70]"}`} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function MobileDrawer({
  open,
  onClose,
  view,
  onSelect,
  partnerName
}: {
  open: boolean;
  onClose: () => void;
  view: ViewId;
  onSelect: (view: ViewId) => void;
  partnerName: string;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []
      );
    focusable()[0]?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] lg:hidden">
      <button type="button" aria-label="Close menu" onClick={onClose} className="absolute inset-0 bg-[#0d1b13]/45" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Partner dashboard navigation" className="absolute inset-y-0 left-0 flex w-[286px] max-w-[86vw] flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between px-4 py-4">
          <BrandMark />
          <button type="button" onClick={onClose} aria-label="Close navigation menu" className="grid h-9 w-9 place-items-center rounded-full text-[#40564a] hover:bg-[#f4f8f5]">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <nav aria-label="Partner dashboard" className="flex-1 overflow-y-auto px-3 py-2">
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[13px] ${
                      active ? "bg-[#eaf7ee] font-extrabold text-[#0b5c33]" : "font-semibold text-[#40564a]"
                    }`}
                  >
                    <Icon className="h-[19px] w-[19px] shrink-0" aria-hidden="true" />
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-[#eef1ef] p-4">
          <Link href="/account" onClick={onClose} className="flex items-center gap-2.5 rounded-xl p-2 hover:bg-[#f4f8f5]">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#0b5c33] text-[12px] font-extrabold text-white">{initials(partnerName)}</span>
            <span>
              <span className="block text-[12.5px] font-extrabold text-[#14241b]">NaijaDeals</span>
              <span className="block text-[11px] text-[#6b7a70]">partner account</span>
            </span>
          </Link>
          <Link href="/" onClick={onClose} className="mt-1 flex items-center gap-2 rounded-xl px-2 py-2 text-[12px] font-bold text-[#4a5a50] hover:bg-[#f4f8f5]">
            <ArrowLeftRight className="h-4 w-4" aria-hidden="true" /> Switch service
          </Link>
        </div>
      </div>
    </div>
  );
}

function DashboardHeader({
  data,
  onOpenMenu,
  onOpenSettings,
  onSignOut
}: {
  data: PartnerDashboardData;
  onOpenMenu: () => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
}) {
  const firstName = data.partner.name.trim().split(/\s+/)[0] || data.partner.name;
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement | null>(null);
  useDismiss(accountOpen, accountRef, () => setAccountOpen(false));

  return (
    <header className="border-b border-[#e8ede9] bg-white lg:border-0 lg:bg-transparent">
      <div className="flex items-center gap-2 px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open partner navigation"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#e2e8e3] bg-white text-[#0b5c33]"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <BrandMark compact />
        <div className="ml-auto flex items-center gap-1">
          <NotificationMenu />
          <AccountMenu
            open={accountOpen}
            setOpen={setAccountOpen}
            refEl={accountRef}
            data={data}
            onOpenSettings={onOpenSettings}
            onSignOut={onSignOut}
            compact
          />
        </div>
      </div>

      <div className="px-4 pb-3 pt-2 sm:px-6 lg:px-8 lg:pb-4 lg:pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-[#0f2417] sm:text-[27px]">
              {data.partner.greeting}, {firstName}
            </h1>
            <p className="mt-0.5 text-[12px] font-medium text-[#5d6d64]">Your delivery workspace</p>
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            <CityPill data={data} />
            <NotificationMenu />
            <AccountMenu
              open={accountOpen}
              setOpen={setAccountOpen}
              refEl={accountRef}
              data={data}
              onOpenSettings={onOpenSettings}
              onSignOut={onSignOut}
            />
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 lg:hidden">
          <CityPill data={data} compact />
        </div>
      </div>
    </header>
  );
}

function useDismiss(open: boolean, ref: React.RefObject<HTMLElement>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, ref, close]);
}

function CityPill({ data, compact = false }: { data: PartnerDashboardData; compact?: boolean }) {
  return (
    <span
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#e2e8e3] bg-white px-3 text-[12px] font-bold text-[#33443a] ${
        compact ? "w-fit" : ""
      }`}
      title="Operating city is read from your registered delivery transport."
    >
      <MapPin className="h-4 w-4 shrink-0 text-[#0b8f47]" aria-hidden="true" />
      <span className="min-w-0 truncate">{data.partner.city ?? "Operating city not set"}</span>
      {!data.partner.city ? (
        <span className="rounded-full bg-[#fff0d9] px-1.5 py-0.5 text-[9.5px] font-extrabold text-[#8a4308]">Not set</span>
      ) : data.partner.cityActive ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#0b8f47]" aria-label="Food delivery active in this city" />
      ) : (
        <span className="rounded-full bg-[#fff0d9] px-1.5 py-0.5 text-[9.5px] font-extrabold text-[#8a4308]">Not active</span>
      )}
    </span>
  );
}

function NotificationMenu() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Array<{ id: string; kind: string; title: string; body: string | null; href: string | null; readAt: string | null; createdAt: string }>>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);
  useDismiss(open, ref, () => setOpen(false));

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/partner/notifications", { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("Updates could not be loaded.");
      const body = (await response.json()) as { notifications?: typeof rows; unread?: number };
      setRows(Array.isArray(body.notifications) ? body.notifications : []);
      setUnread(Number(body.unread ?? 0));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Updates could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function markAllRead() {
    await fetch("/api/partner/notifications", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true })
    }).catch(() => undefined);
    await load();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-[#e2e8e3] bg-white text-[#40564a] transition hover:border-[#c9d8cd] hover:text-[#0b5c33]"
      >
        <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#f26b21] px-1 text-[9px] font-black text-white">{unread}</span>
        ) : null}
      </button>
      {open ? (
        <div role="dialog" aria-label="Partner updates" className="absolute right-0 top-full z-[60] mt-2 w-[330px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-[#e2e8e3] bg-white shadow-xl">
          <div className="flex items-center justify-between gap-2 border-b border-[#eef1ef] px-4 py-3">
            <p className="text-[13px] font-extrabold text-[#14241b]">Updates</p>
            {unread > 0 ? (
              <button type="button" onClick={() => void markAllRead()} className="text-[11px] font-bold text-[#0b5c33] underline">
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="max-h-[340px] overflow-y-auto">
            {loading ? <p className="px-4 py-5 text-[12px] text-[#6b7a70]">Loading updates…</p> : null}
            {error ? <p role="alert" className="px-4 py-4 text-[12px] font-bold text-[#8f1d18]">{error}</p> : null}
            {!loading && !error && rows.length === 0 ? (
              <p className="px-4 py-5 text-[12px] leading-5 text-[#6b7a70]">No partner updates yet. Dispatch, approval and account events appear here.</p>
            ) : null}
            {rows.length > 0 ? (
              <ul className="divide-y divide-[#eef1ef]">
                {rows.slice(0, 8).map((row) => (
                  <li key={row.id} className={`px-4 py-3 ${row.readAt ? "" : "bg-[#f4fbf6]"}`}>
                    <p className="text-[12.5px] font-extrabold text-[#14241b]">{row.title}</p>
                    {row.body ? <p className="mt-0.5 text-[11px] leading-5 text-[#5d6d64]">{row.body}</p> : null}
                    <p className="mt-1 text-[10px] font-semibold text-[#8a938d]">{formatDateTime(row.createdAt)}</p>
                    {row.href ? (
                      <Link href={row.href} onClick={() => setOpen(false)} className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-[#0b5c33] underline">
                        Open <ArrowRight className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AccountMenu({
  open,
  setOpen,
  refEl,
  data,
  onOpenSettings,
  onSignOut,
  compact = false
}: {
  open: boolean;
  setOpen: (value: boolean) => void;
  refEl: React.RefObject<HTMLDivElement>;
  data: PartnerDashboardData;
  onOpenSettings: () => void;
  onSignOut: () => void;
  compact?: boolean;
}) {
  function onMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items[items.length - 1]?.focus();
    }
  }

  return (
    <div ref={refEl} className="relative" onKeyDown={onMenuKeyDown}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex min-h-10 items-center gap-2 rounded-xl border border-[#e2e8e3] bg-white p-1.5 text-left transition hover:border-[#c9d8cd] ${
          compact ? "w-10 justify-center" : "pr-2.5"
        }`}
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[#0b5c33] text-[10.5px] font-extrabold text-white">{initials(data.partner.name)}</span>
        {!compact ? (
          <>
            <span className="min-w-0">
              <span className="block max-w-[120px] truncate text-[11.5px] font-extrabold text-[#14241b]">{data.partner.name}</span>
              <span className="block text-[9.5px] text-[#6b7a70]">Delivery partner</span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-[#6b7a70]" aria-hidden="true" />
          </>
        ) : null}
      </button>
      {open ? (
        <div role="menu" aria-label="Account" className="absolute right-0 top-full z-[60] mt-2 w-[260px] overflow-hidden rounded-2xl border border-[#e2e8e3] bg-white py-1.5 shadow-xl">
          <div className="px-3.5 py-2.5">
            <p className="truncate text-[12.5px] font-extrabold text-[#14241b]">{data.partner.name}</p>
            <p className="truncate text-[10.5px] text-[#6b7a70]">{data.partner.email}</p>
          </div>
          <div className="h-px bg-[#eef1ef]" />
          <Link role="menuitem" href="/account" className="flex items-center gap-2 px-3.5 py-2.5 text-[12px] font-semibold text-[#33443a] hover:bg-[#f4f8f5]">
            <User className="h-4 w-4 text-[#6b7a70]" aria-hidden="true" /> NaijaDeals account
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[12px] font-semibold text-[#33443a] hover:bg-[#f4f8f5]"
          >
            <Settings className="h-4 w-4 text-[#6b7a70]" aria-hidden="true" /> Partner settings
          </button>
          <div className="h-px bg-[#eef1ef]" />
          <button role="menuitem" type="button" onClick={onSignOut} className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[12px] font-bold text-[#a31818] hover:bg-[#fdf3f2]">
            <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Overview                                                                  */
/* ------------------------------------------------------------------------- */

function OverviewView({
  data,
  online,
  activeTransport,
  activeDelivery,
  availabilityBusy,
  position,
  positionAgeSeconds,
  stale,
  geoState,
  followLocation,
  recenterNonce,
  offer,
  offerMeta,
  offerMetaStatus,
  offerBusy,
  offerExpired,
  secondsLeft,
  offersStatus,
  offersError,
  offerAnnouncement,
  onGoOnline,
  onGoOffline,
  onSelectTransport,
  onRequestLocation,
  onFollowChange,
  onRecenter,
  onAccept,
  onDecline,
  onReloadOffers,
  onOpenDeliveries,
  onOpenTransport,
  onOpenSupport
}: {
  data: PartnerDashboardData;
  online: boolean;
  activeTransport: PartnerTransport | null;
  activeDelivery: ActiveDelivery | null;
  availabilityBusy: boolean;
  position: GeoFix | null;
  positionAgeSeconds: number | null;
  stale: boolean;
  geoState: GeoState;
  followLocation: boolean;
  recenterNonce: number;
  offer: Offer | null;
  offerMeta: OfferMeta | null;
  offerMetaStatus: "idle" | "loading" | "ready" | "error";
  offerBusy: "accept" | "decline" | null;
  offerExpired: boolean;
  secondsLeft: number;
  offersStatus: "idle" | "loading" | "ready" | "error";
  offersError: string;
  offerAnnouncement: string;
  onGoOnline: () => void;
  onGoOffline: () => void;
  onSelectTransport: (kind: PartnerTransportKind) => void;
  onRequestLocation: () => void;
  onFollowChange: (value: boolean) => void;
  onRecenter: () => void;
  onAccept: (offer: Offer) => void;
  onDecline: (offer: Offer) => void;
  onReloadOffers: () => void;
  onOpenDeliveries: () => void;
  onOpenTransport: () => void;
  onOpenSupport: () => void;
}) {
  return (
    <div className="space-y-4">
      <StatusStrip
        data={data}
        online={online}
        activeTransport={activeTransport}
        activeDelivery={activeDelivery}
        busy={availabilityBusy}
        onGoOnline={onGoOnline}
        onGoOffline={onGoOffline}
        onSelectTransport={onSelectTransport}
      />
      <SummaryCards data={data} />

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_370px]">
        {/* DOM order on small screens: map, offer, how-it-works, transport,
            support. That keeps Accept/Decline close to the map rather than
            burying the request under secondary panels. */}
        <div className="min-w-0 xl:col-start-1 xl:row-start-1">
          <MapCard
            data={data}
            position={position}
            positionAgeSeconds={positionAgeSeconds}
            stale={stale}
            geoState={geoState}
            online={online}
            followLocation={followLocation}
            recenterNonce={recenterNonce}
            offerLabel={offer ? `${offer.restaurant?.name ?? "Restaurant pickup"}${offer.area ? ` · ${offer.area}` : ""}` : null}
            onFollowChange={onFollowChange}
            onRecenter={onRecenter}
            onRequestLocation={onRequestLocation}
          />
        </div>

        <div className="min-w-0 xl:col-start-2 xl:row-start-1">
          <div aria-live="polite" className="sr-only">{offerAnnouncement}</div>
          {activeDelivery ? (
            <ActiveDeliverySummary data={data} onOpenDeliveries={onOpenDeliveries} />
          ) : (
            <OfferPanel
              online={online}
              offer={offer}
              offerMeta={offerMeta}
              offerMetaStatus={offerMetaStatus}
              offerBusy={offerBusy}
              offerExpired={offerExpired}
              secondsLeft={secondsLeft}
              offersStatus={offersStatus}
              offersError={offersError}
              onAccept={onAccept}
              onDecline={onDecline}
              onReload={onReloadOffers}
              onGoOnline={onGoOnline}
            />
          )}
        </div>

        <div className="min-w-0 space-y-4 xl:col-start-1 xl:row-start-2">
          <HowItWorks data={data} activeDelivery={activeDelivery} />
          <TransportPanel data={data} activeTransport={activeTransport} onOpenTransport={onOpenTransport} />
        </div>

        <div className="min-w-0 xl:col-start-2 xl:row-start-2">
          <SupportCard onClick={onOpenSupport} />
        </div>
      </div>
    </div>
  );
}

function StatusStrip({
  data,
  online,
  activeTransport,
  activeDelivery,
  busy,
  onGoOnline,
  onGoOffline,
  onSelectTransport
}: {
  data: PartnerDashboardData;
  online: boolean;
  activeTransport: PartnerTransport | null;
  activeDelivery: ActiveDelivery | null;
  busy: boolean;
  onGoOnline: () => void;
  onGoOffline: () => void;
  onSelectTransport: (kind: PartnerTransportKind) => void;
}) {
  const approvedTransports = data.transports.filter((transport) => transport.approved);
  const readiness =
    online && activeDelivery
      ? "On a delivery"
      : online && activeTransport?.approved
        ? "Ready for requests"
        : online
          ? "Completing setup"
          : activeTransport && !activeTransport.approved
            ? "Awaiting approval"
            : "Offline";

  return (
    <section aria-label="Availability" className="rounded-2xl border border-[#d6ebda] bg-[#eaf7ee] px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${online ? "bg-[#0b8f47]" : "bg-[#9aa59e]"}`} aria-hidden="true" />
          <span className="text-[13px] font-extrabold text-[#0f2417]">{online ? "Online" : "Offline"}</span>
        </div>
        <span className="hidden h-5 w-px bg-[#cfe3d4] sm:block" aria-hidden="true" />
        <div className="flex items-center gap-1.5 text-[12px] font-bold text-[#33443a]">
          <Utensils className="h-4 w-4 text-[#0b8f47]" aria-hidden="true" />
          Food delivery
        </div>
        <span className="hidden h-5 w-px bg-[#cfe3d4] sm:block" aria-hidden="true" />
        <div className="relative flex min-h-9 items-center">
          {activeTransport ? (
            (() => {
              const Icon = vehicleIcon(activeTransport.rawVehicle);
              return <Icon className="pointer-events-none absolute left-2.5 h-4 w-4 text-[#0b5c33]" aria-hidden="true" />;
            })()
          ) : null}
          <label htmlFor="active-transport" className="sr-only">
            Active transport
          </label>
          <select
            id="active-transport"
            value={activeTransport?.kind ?? ""}
            onChange={(event) => onSelectTransport(event.target.value as PartnerTransportKind)}
            disabled={busy || data.transports.length === 0}
            className="min-h-9 w-full appearance-none rounded-lg border border-[#cfe3d4] bg-white py-1.5 pl-8 pr-8 text-[12px] font-bold text-[#14241b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b5c33] disabled:opacity-60"
          >
            {data.transports.length === 0 ? <option value="">No transport registered</option> : null}
            {data.transports.map((transport) => (
              <option key={transport.kind} value={transport.kind} disabled={!transport.approved}>
                {transport.label}
                {transport.approved ? "" : ` — ${transport.statusLabel}`}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-[#5d6d64]" aria-hidden="true" />
        </div>
        <span className="hidden h-5 w-px bg-[#cfe3d4] sm:block" aria-hidden="true" />
        <div className="flex items-center gap-1.5 text-[12px] font-bold text-[#33443a]">
          {readiness === "Ready for requests" ? (
            <CheckCircle2 className="h-4 w-4 text-[#0b8f47]" aria-hidden="true" />
          ) : readiness === "On a delivery" ? (
            <PackageCheck className="h-4 w-4 text-[#b45309]" aria-hidden="true" />
          ) : readiness === "Awaiting approval" ? (
            <AlertCircle className="h-4 w-4 text-[#b45309]" aria-hidden="true" />
          ) : (
            <Clock className="h-4 w-4 text-[#6b7a70]" aria-hidden="true" />
          )}
          {readiness}
        </div>
        <button
          type="button"
          onClick={online ? onGoOffline : onGoOnline}
          disabled={
            busy ||
            (online && Boolean(activeDelivery)) ||
            (!online && (approvedTransports.length === 0 || !data.partner.city))
          }
          aria-describedby={online && activeDelivery ? "offline-blocked-reason" : undefined}
          className={`ml-auto inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border px-4 text-[12.5px] font-extrabold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b5c33] sm:w-auto ${
            online
              ? "border-[#0b5c33] bg-white text-[#0b5c33] hover:bg-[#f3fbf5]"
              : "border-[#0b7a3b] bg-[#0b7a3b] text-white hover:bg-[#09622f]"
          } disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {online ? "Go offline" : "Go online"}
        </button>
      </div>
      {online && activeDelivery ? (
        <p id="offline-blocked-reason" className="mt-2 text-[10.5px] font-semibold text-[#7a4a0c]">
          Finish or hand over your active delivery before going offline.
        </p>
      ) : null}
      {!online && approvedTransports.length === 0 ? (
        <p className="mt-2 text-[10.5px] font-semibold text-[#7a4a0c]">An approved transport is required before you can go online.</p>
      ) : !online && !data.partner.city ? (
        <p className="mt-2 text-[10.5px] font-semibold text-[#7a4a0c]">
          An operating city is required before you can go online. Contact partner support to set your city.
        </p>
      ) : null}
    </section>
  );
}

function SummaryCards({ data }: { data: PartnerDashboardData }) {
  return (
    <section aria-label="Today's summary" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <SummaryCard
        icon={WalletCards}
        label="Today's earnings"
        value={formatMoney(data.stats.earningsTodayKobo, data.stats.currency)}
        sub="Settled credits · NGN"
        title="Credits posted to your partner wallet by NaijaEats settlement today (Africa/Lagos). Tips and adjustments are not modelled."
      />
      <SummaryCard
        icon={PackageCheck}
        label="Completed deliveries"
        value={String(data.stats.completedToday)}
        sub="Today · Africa/Lagos"
        title="Food deliveries assigned to you and marked completed by the delivery PIN today."
      />
      <SummaryCard
        icon={Clock}
        label="Online time"
        value="Not tracked"
        sub="No session log in the backend"
        title="The backend stores an online/offline flag but does not record session timestamps, so online time cannot be calculated."
        mutedValue
      />
    </section>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  title,
  mutedValue = false
}: {
  icon: typeof WalletCards;
  label: string;
  value: string;
  sub: string;
  title: string;
  mutedValue?: boolean;
}) {
  return (
    <article className="flex min-w-0 items-center gap-3 rounded-2xl border border-[#e5ebe6] bg-white p-4" title={title}>
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#eaf7ee] text-[#0b8f47]">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[11.5px] font-semibold text-[#40564a]">{label}</p>
        <p className={`mt-0.5 truncate font-display font-extrabold tracking-[-0.02em] ${mutedValue ? "text-[17px] text-[#6b7a70]" : "text-[25px] text-[#0f2417]"}`}>{value}</p>
        <p className="mt-0.5 text-[10px] leading-4 text-[#7c8b81]">{sub}</p>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------------- */
/* Map                                                                       */
/* ------------------------------------------------------------------------- */

function MapCard({
  data,
  position,
  positionAgeSeconds,
  stale,
  geoState,
  online,
  followLocation,
  recenterNonce,
  offerLabel,
  onFollowChange,
  onRecenter,
  onRequestLocation
}: {
  data: PartnerDashboardData;
  position: GeoFix | null;
  positionAgeSeconds: number | null;
  stale: boolean;
  geoState: GeoState;
  online: boolean;
  followLocation: boolean;
  recenterNonce: number;
  offerLabel: string | null;
  onFollowChange: (value: boolean) => void;
  onRecenter: () => void;
  onRequestLocation: () => void;
}) {
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [rebuildKey, setRebuildKey] = useState(0);
  const [zoomTargets, setZoomTargets] = useState<{ zoomIn: () => void; zoomOut: () => void } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const positionLayerRef = useRef<LayerGroup | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const circleRef = useRef<LeafletCircle | null>(null);
  const aliveRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let map: LeafletMap | null = null;
    let tileErrors = 0;
    let tileLoads = 0;
    setMapStatus("loading");

    void (async () => {
      try {
        const L = (await import("leaflet")).default;
        if (cancelled || !containerRef.current) return;
        const view = cityMap(data.partner.city);
        map = L.map(container, {
          center: view.centre,
          zoom: view.zoom,
          zoomControl: false,
          scrollWheelZoom: false,
          attributionControl: true,
          keyboard: true,
          // Instant zoom avoids Leaflet's zoom-transition callback firing after
          // the card has been unmounted (a teardown race in the map library).
          zoomAnimation: false,
          fadeAnimation: false,
          markerZoomAnimation: false
        });
        const tiles = L.tileLayer(TILE_URL, {
          attribution: TILE_ATTRIBUTION,
          maxZoom: 19,
          minZoom: 5
        });
        tiles.on("tileload", () => {
          tileLoads += 1;
          if (!cancelled) setMapStatus("ready");
        });
        tiles.on("tileerror", () => {
          tileErrors += 1;
          if (!cancelled && tileLoads === 0 && tileErrors >= 3) setMapStatus("failed");
        });
        tiles.on("load", () => {
          if (!cancelled) setMapStatus("ready");
        });
        tiles.addTo(map);
        layerRef.current = L.layerGroup().addTo(map);
        positionLayerRef.current = L.layerGroup().addTo(map);
        map.on("dragstart", () => onFollowChange(false));
        mapRef.current = map;
        aliveRef.current = true;
        setZoomTargets({
          zoomIn: () => {
            if (aliveRef.current) mapRef.current?.zoomIn();
          },
          zoomOut: () => {
            if (aliveRef.current) mapRef.current?.zoomOut();
          }
        });
        // Blocked or unreachable tiles never fire "load". If nothing has
        // rendered after five seconds, say so instead of leaving a blank map
        // that claims to be ready.
        window.setTimeout(() => {
          if (!cancelled && tileLoads === 0) setMapStatus("failed");
        }, 5000);
      } catch {
        if (!cancelled) setMapStatus("failed");
      }
    })();

    return () => {
      cancelled = true;
      aliveRef.current = false;
      layerRef.current = null;
      positionLayerRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
      mapRef.current = null;
      setZoomTargets(null);
      try {
        map?.stop();
        map?.off();
        map?.remove();
      } catch {
        // The container may already be detached during a route change.
      }
      map = null;
    };
  }, [data.partner.city, rebuildKey, onFollowChange]);

  // Leaflet needs an explicit size recalculation when the responsive card
  // changes width. Guard every callback against a map that has been removed.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapStatus !== "ready") return;
    const observer = new ResizeObserver(() => {
      if (!aliveRef.current) return;
      const map = mapRef.current;
      if (!map || !map.getContainer().isConnected) return;
      try {
        map.invalidateSize();
      } catch {
        // The map was removed between the guard and the call.
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [mapStatus, rebuildKey]);

  useEffect(() => {
    if (mapStatus !== "ready") return;
    const map = mapRef.current;
    const layer = positionLayerRef.current;
    if (!map || !layer) return;
    let cancelled = false;
    void (async () => {
      try {
        const L = (await import("leaflet")).default;
        if (cancelled || !aliveRef.current || !mapRef.current || !map.getContainer().isConnected) return;
        layer.clearLayers();
        markerRef.current = null;
        circleRef.current = null;
        if (!position) return;
        const icon = L.divIcon({
          className: "nd-partner-location",
          html: '<span style="display:grid;place-items:center;width:34px;height:34px;border-radius:999px;background:#0b5c33;border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.35)"><span style="width:9px;height:9px;border-radius:999px;background:#fff"></span></span>',
          iconSize: [34, 34],
          iconAnchor: [17, 17]
        });
        const marker = L.marker([position.latitude, position.longitude], { icon, title: "Your current location" });
        marker.bindTooltip(stale ? "Your last position (stale)" : "Your current position", {
          permanent: true,
          direction: "top",
          offset: [0, -18],
          className: "nd-map-tooltip",
          opacity: 1
        });
        marker.addTo(layer);
        markerRef.current = marker;
        const circle = L.circle([position.latitude, position.longitude], {
          radius: Math.max(5, position.accuracyM),
          color: stale ? "#b45309" : "#0b7a3b",
          weight: 1,
          fillColor: stale ? "#b45309" : "#0b7a3b",
          fillOpacity: 0.08
        });
        circle.addTo(layer);
        circleRef.current = circle;
        if (followLocation && aliveRef.current && map.getContainer().isConnected) {
          map.setView([position.latitude, position.longitude], Math.max(map.getZoom(), 15), { animate: false });
        }
      } catch {
        // A queued marker update can race a view change; the map is optional and
        // the textual location status remains available.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [position, mapStatus, followLocation, stale]);

  useEffect(() => {
    if (!position || !followLocation) return;
    const map = mapRef.current;
    if (!map || !aliveRef.current || !map.getContainer().isConnected) return;
    try {
      map.setView([position.latitude, position.longitude], Math.max(map.getZoom(), 15), { animate: false });
    } catch {
      // The map was removed between the guard and the call.
    }
  }, [recenterNonce, position, followLocation]);

  const showLocationPrompt = !position && mapStatus === "ready";
  const locationMessage =
    geoState === "requesting"
      ? "Waiting for your device location…"
      : geoState === "denied"
        ? "Location permission is blocked. Enable location for this site in browser settings, then try again."
        : geoState === "unavailable"
          ? "Your device could not provide a location. Check that location services are on."
          : geoState === "timeout"
            ? "The location request timed out. Move to an open area and try again."
            : geoState === "unsupported"
              ? "This browser does not support device location."
              : online
                ? "You are online. Turn on live location to see yourself on the map and keep matching fresh."
                : "Location is used only while you choose to go online or enable the map.";

  return (
    <section aria-labelledby="delivery-map-heading" className="min-w-0 overflow-hidden rounded-2xl border border-[#e5ebe6] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#eaf7ee] text-[#0b8f47]">
            <MapPin className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="delivery-map-heading" className="truncate font-display text-[16px] font-extrabold tracking-[-0.01em] text-[#0f2417]">
              Delivery area · {data.partner.city ?? "not set"}
            </h2>
            <p className="truncate text-[10.5px] text-[#6b7a70]">
              {data.partner.city ? `${data.partner.city} operating map` : "No operating city recorded on your transport"}
            </p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${stale ? "bg-[#fff0d9] text-[#8a4308]" : position ? "bg-[#e4f7e9] text-[#086536]" : "bg-[#eef1ef] text-[#4a5a50]"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${stale ? "bg-[#b45309]" : position ? "bg-[#0b8f47]" : "bg-[#8a938d]"}`} aria-hidden="true" />
          {stale ? "Location stale" : position ? "Live position" : "Location off"}
        </span>
      </div>

      <div className="relative">
        <div
          ref={containerRef}
          className="h-[300px] w-full bg-[#e9f1e7] sm:h-[360px] xl:h-[395px]"
          role="region"
          aria-label={`Map of ${data.partner.city ?? "your operating area"}${position ? " with your current location" : ""}`}
        />

        {mapStatus === "loading" ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[#f2f7f1]/90 text-[12px] font-bold text-[#5d6d64]">
            <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading map…</span>
          </div>
        ) : null}

        {mapStatus === "failed" ? (
          <div className="absolute inset-0 grid place-items-center bg-[#f7f9f8]/95 p-5 text-center">
            <div>
              <AlertTriangle className="mx-auto h-6 w-6 text-[#b45309]" aria-hidden="true" />
              <p className="mt-1.5 text-[12px] font-extrabold text-[#14241b]">Map tiles could not load</p>
              <p className="mt-0.5 text-[11px] leading-5 text-[#5d6d64]">Check your connection. Going online and accepting deliveries do not depend on the map.</p>
              <button
                type="button"
                onClick={() => setRebuildKey((value) => value + 1)}
                className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#d8e2da] bg-white px-3 text-[11px] font-bold text-[#0b5c33]"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry map
              </button>
            </div>
          </div>
        ) : null}

        {mapStatus === "ready" ? (
          <>
            <div className="absolute left-3 top-3 z-10 max-w-[min(280px,calc(100%-4rem))] rounded-xl border border-[#e2e8e3] bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
              <p className="flex items-center gap-1.5 text-[11px] font-extrabold text-[#14241b]">
                <Navigation className="h-3.5 w-3.5 text-[#0b8f47]" aria-hidden="true" />
                {position ? "Your position" : "Map centre"}
              </p>
              <p className="mt-0.5 text-[10px] leading-4 text-[#5d6d64]">
                {position
                  ? `${position.latitude.toFixed(4)}, ${position.longitude.toFixed(4)} · ±${Math.round(position.accuracyM)} m · ${formatTimeAgoSeconds(positionAgeSeconds)}`
                  : data.partner.city
                    ? `${data.partner.city} is shown from OpenStreetMap tiles.`
                    : "No operating city is recorded for this account."}
              </p>
              {offerLabel ? <p className="mt-1 line-clamp-2 text-[10px] font-semibold text-[#8a4308]">Pickup: {offerLabel}</p> : null}
            </div>

            <div className="absolute right-3 top-3 z-10 flex flex-col gap-1">
              <button
                type="button"
                onClick={() => zoomTargets?.zoomIn()}
                aria-label="Zoom in"
                className="grid h-9 w-9 place-items-center rounded-lg border border-[#e2e8e3] bg-white text-[18px] font-bold text-[#33443a] shadow-sm hover:bg-[#f7faf8]"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => zoomTargets?.zoomOut()}
                aria-label="Zoom out"
                className="grid h-9 w-9 place-items-center rounded-lg border border-[#e2e8e3] bg-white text-[18px] font-bold text-[#33443a] shadow-sm hover:bg-[#f7faf8]"
              >
                −
              </button>
            </div>

            <div className="absolute bottom-8 left-3 z-10 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={onRecenter}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#e2e8e3] bg-white px-2.5 text-[10.5px] font-extrabold text-[#0b5c33] shadow-sm hover:bg-[#f7faf8]"
              >
                <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" /> Re-centre on me
              </button>
              <button
                type="button"
                onClick={() => onFollowChange(!followLocation)}
                aria-pressed={followLocation}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[10.5px] font-extrabold shadow-sm ${
                  followLocation ? "border-[#0b5c33] bg-[#eaf7ee] text-[#0b5c33]" : "border-[#e2e8e3] bg-white text-[#40564a]"
                }`}
              >
                <Navigation className="h-3.5 w-3.5" aria-hidden="true" /> {followLocation ? "Following" : "Follow"}
              </button>
            </div>

            {showLocationPrompt ? (
              <div className="absolute bottom-8 right-3 z-10 max-w-[min(260px,calc(100%-6rem))] rounded-xl border border-[#e2e8e3] bg-white/97 p-3 shadow-lg">
                <p className="text-[11px] font-extrabold text-[#14241b]">Use your device location</p>
                <p className="mt-0.5 text-[10px] leading-4 text-[#5d6d64]">{locationMessage}</p>
                <button
                  type="button"
                  onClick={onRequestLocation}
                  disabled={geoState === "unsupported"}
                  className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-[#0b7a3b] px-2.5 text-[10.5px] font-extrabold text-white disabled:opacity-60"
                >
                  <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
                  {geoState === "denied" ? "Try location again" : "Enable location"}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-t border-[#eef1ef] px-4 py-2.5">
        <p className="min-w-0 text-[10px] leading-4 text-[#6b7a70]">
          {position
            ? `Device location ${stale ? "is stale" : "is current"} · accuracy ±${Math.round(position.accuracyM)} m · updated ${formatTimeAgoSeconds(positionAgeSeconds)}.`
            : locationMessage}
        </p>
        <p className="text-[9.5px] leading-4 text-[#8a938d]">
          Pickup and delivery pins appear only when the order has verified coordinates. No route line is drawn without road geometry.
        </p>
      </div>
      <p className="border-t border-[#eef1ef] px-4 py-1.5 text-[9px] text-[#8a938d]">
        Map tiles © OpenStreetMap contributors. Scrolling moves the page; use +/− to zoom.
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------------- */
/* Offer panel                                                               */
/* ------------------------------------------------------------------------- */

function OfferPanel({
  online,
  offer,
  offerMeta,
  offerMetaStatus,
  offerBusy,
  offerExpired,
  secondsLeft,
  offersStatus,
  offersError,
  onAccept,
  onDecline,
  onReload,
  onGoOnline
}: {
  online: boolean;
  offer: Offer | null;
  offerMeta: OfferMeta | null;
  offerMetaStatus: "idle" | "loading" | "ready" | "error";
  offerBusy: "accept" | "decline" | null;
  offerExpired: boolean;
  secondsLeft: number;
  offersStatus: "idle" | "loading" | "ready" | "error";
  offersError: string;
  onAccept: (offer: Offer) => void;
  onDecline: (offer: Offer) => void;
  onReload: () => void;
  onGoOnline: () => void;
}) {
  if (!online) {
    return (
      <section aria-label="Delivery requests" className="rounded-2xl border border-[#e5ebe6] bg-white p-4">
        <h2 className="font-display text-[18px] font-extrabold tracking-[-0.01em] text-[#0f2417]">New delivery request</h2>
        <div className="mt-3 rounded-xl bg-[#f5f8f6] p-4 text-center">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#eaf7ee] text-[#0b5c33]">
            <Clock className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="mt-2 text-[12.5px] font-extrabold text-[#14241b]">You are offline</p>
          <p className="mt-1 text-[11px] leading-5 text-[#6b7a70]">Go online to receive food-delivery requests in your operating area.</p>
          <button type="button" onClick={onGoOnline} className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#0b7a3b] px-4 text-[12px] font-extrabold text-white">
            Go online
          </button>
        </div>
      </section>
    );
  }

  if (offersStatus === "loading" && !offer) {
    return (
      <section aria-label="Delivery requests" aria-busy="true" className="rounded-2xl border border-[#e5ebe6] bg-white p-4">
        <h2 className="font-display text-[18px] font-extrabold text-[#0f2417]">New delivery request</h2>
        <div className="mt-3 animate-pulse space-y-2">
          <div className="h-9 rounded-lg bg-[#f0f4f1]" />
          <div className="h-16 rounded-lg bg-[#f0f4f1]" />
          <div className="h-10 rounded-lg bg-[#f0f4f1]" />
        </div>
        <p className="sr-only">Loading delivery requests…</p>
      </section>
    );
  }

  if (offersStatus === "error") {
    return (
      <section aria-label="Delivery requests" className="rounded-2xl border border-[#e5ebe6] bg-white p-4">
        <h2 className="font-display text-[18px] font-extrabold text-[#0f2417]">New delivery request</h2>
        <div role="alert" className="mt-3 rounded-xl border border-[#f3c6c2] bg-[#fdf0ef] p-3 text-[11.5px] font-semibold text-[#8f1d18]">
          {offersError}
        </div>
        <button type="button" onClick={onReload} className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#d8e2da] px-3 text-[11px] font-bold text-[#0b5c33]">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Try again
        </button>
      </section>
    );
  }

  if (!offer) {
    return (
      <section aria-label="Delivery requests" className="rounded-2xl border border-[#e5ebe6] bg-white p-4">
        <h2 className="font-display text-[18px] font-extrabold tracking-[-0.01em] text-[#0f2417]">New delivery request</h2>
        <div className="mt-3 rounded-xl border border-dashed border-[#d7e2da] bg-[#fbfdfb] p-4 text-center">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#eaf7ee] text-[#0b8f47]">
            <Utensils className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="mt-2 text-[12.5px] font-extrabold text-[#14241b]">No delivery requests right now</p>
          <p className="mt-1 text-[11px] leading-5 text-[#6b7a70]">
            Requests appear here when a kitchen marks an order ready and you are online in the delivery zone. This panel checks every 10 seconds.
          </p>
        </div>
      </section>
    );
  }

  const canAct = !offerBusy && !offerExpired && offerMetaStatus === "ready";
  const urgent = secondsLeft <= 10;

  return (
    <section aria-labelledby="offer-heading" className="rounded-2xl border border-[#e5ebe6] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="offer-heading" className="font-display text-[18px] font-extrabold tracking-[-0.01em] text-[#0f2417]">
          New delivery request
        </h2>
        <span className="inline-flex items-center gap-1 rounded-full bg-[#fff1e6] px-2.5 py-1 text-[10px] font-extrabold text-[#a3480f]">
          <Utensils className="h-3 w-3" aria-hidden="true" /> Food pickup
        </span>
      </div>

      <div
        role="timer"
        aria-label={offerExpired ? "Offer expired" : `Offer expires in ${secondsLeft} seconds`}
        className={`mt-3 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-[13px] font-extrabold ${
          offerExpired
            ? "bg-[#f3f5f4] text-[#5d6d64]"
            : urgent
              ? "bg-[#fdecea] text-[#a31818]"
              : "bg-[#fff3e8] text-[#a3480f]"
        }`}
      >
        {offerExpired ? <AlertCircle className="h-4 w-4" aria-hidden="true" /> : <Timer className="h-4 w-4" aria-hidden="true" />}
        {offerExpired ? "Offer expired" : `Accept within ${secondsLeft}s`}
      </div>

      <div className="mt-4 flex gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#fff1e6] text-[#c25716]">
          <ShoppingBag className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[12.5px] font-extrabold text-[#14241b]">Restaurant pickup</p>
          <p className="truncate text-[12px] font-semibold text-[#33443a]">{offer.restaurant?.name ?? "Kitchen"}</p>
          <p className="text-[10.5px] text-[#6b7a70]">{offer.area ?? "Pickup area not recorded"}</p>
        </div>
      </div>

      <div className="ml-[17px] h-5 border-l border-dashed border-[#cfd8d1]" aria-hidden="true" />

      <div className="flex gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#e4f7e9] text-[#0b7a3b]">
          <MapPin className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[12.5px] font-extrabold text-[#14241b]">Delivery</p>
          <p className="text-[11.5px] font-semibold text-[#33443a]">Customer address shared after acceptance</p>
          <p className="text-[10.5px] text-[#6b7a70]">Distance and route appear only when coordinates are recorded</p>
        </div>
      </div>

      <dl className="mt-4 divide-y divide-[#eef1ef] border-y border-[#eef1ef] text-[11.5px]">
        <div className="flex items-center justify-between gap-3 py-2">
          <dt className="flex items-center gap-1.5 text-[#5d6d64]">
            <CircleDollarSign className="h-3.5 w-3.5" aria-hidden="true" /> Estimated delivery earnings
          </dt>
          <dd className="font-extrabold text-[#0b5c33]">{formatMoney(offer.earningsKobo)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 py-2">
          <dt className="flex items-center gap-1.5 text-[#5d6d64]">
            <PackageCheck className="h-3.5 w-3.5" aria-hidden="true" /> Order size
          </dt>
          <dd className="text-right font-semibold text-[#33443a]">
            {offerMetaStatus === "loading" ? "Checking order…" : offerMeta ? `${offerMeta.itemQuantity} ${offerMeta.itemQuantity === 1 ? "item" : "items"}` : "Unavailable"}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 py-2">
          <dt className="flex items-center gap-1.5 text-[#5d6d64]">
            <CreditCard className="h-3.5 w-3.5" aria-hidden="true" /> Payment
          </dt>
          <dd className="text-right font-semibold text-[#33443a]">
            {offerMetaStatus === "loading" ? "Checking…" : offerMeta?.paymentLabel ?? "Unavailable"}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 py-2">
          <dt className="flex items-center gap-1.5 text-[#5d6d64]">
            <Bike className="h-3.5 w-3.5" aria-hidden="true" /> Vehicle
          </dt>
          <dd className="text-right font-semibold text-[#33443a]">{vehicleNeedLabel(offer.vehicleNeed)}</dd>
        </div>
      </dl>

      {offerMetaStatus === "error" ? (
        <p role="alert" className="mt-2 rounded-lg bg-[#fdf0ef] px-2.5 py-2 text-[10.5px] font-semibold text-[#8f1d18]">
          Order details could not be loaded, so accepting is disabled. Refresh the request.
        </p>
      ) : null}

      <div className="mt-3 space-y-2">
        <button
          type="button"
          disabled={!canAct}
          onClick={() => onAccept(offer)}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0b7a3b] px-4 text-[13px] font-extrabold text-white transition hover:bg-[#09622f] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b5c33]"
        >
          {offerBusy === "accept" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
          Accept delivery
        </button>
        <button
          type="button"
          disabled={offerExpired || offerBusy !== null}
          onClick={() => onDecline(offer)}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#d8e2da] bg-white px-4 text-[13px] font-extrabold text-[#33443a] transition hover:bg-[#f7faf8] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {offerBusy === "decline" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Decline
        </button>
      </div>

      <p className="mt-2.5 flex items-start gap-1.5 text-[10px] leading-4 text-[#7c8b81]">
        <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
        Review pickup and delivery details before accepting. Pickup and delivery are confirmed with the order&apos;s PINs.
      </p>
    </section>
  );
}

function ActiveDeliverySummary({ data, onOpenDeliveries }: { data: PartnerDashboardData; onOpenDeliveries: () => void }) {
  const delivery = data.activeDelivery;
  if (!delivery) return null;
  return (
    <section aria-labelledby="active-summary-heading" className="rounded-2xl border border-[#e5ebe6] bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="active-summary-heading" className="font-display text-[18px] font-extrabold text-[#0f2417]">
            Active delivery
          </h2>
          <p className="text-[11px] text-[#6b7a70]">{delivery.order.orderNumber}</p>
        </div>
        <span className="rounded-full bg-[#fff0d9] px-2.5 py-1 text-[10px] font-extrabold text-[#8a4308]">
          {delivery.order.status === "picked_up" ? "Collected" : "Assigned"}
        </span>
      </div>
      <div className="mt-3 space-y-2 text-[11.5px]">
        <p className="flex items-start gap-2">
          <ShoppingBag className="mt-0.5 h-4 w-4 shrink-0 text-[#c25716]" aria-hidden="true" />
          <span><span className="block font-extrabold text-[#14241b]">{delivery.order.restaurant.name}</span><span className="text-[#6b7a70]">{delivery.order.restaurant.address}</span></span>
        </p>
        <p className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#0b8f47]" aria-hidden="true" />
          <span><span className="block font-extrabold text-[#14241b]">Customer delivery</span><span className="text-[#6b7a70]">{delivery.order.deliveryAddress}</span></span>
        </p>
      </div>
      <button type="button" onClick={onOpenDeliveries} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#0b7a3b] px-4 text-[12px] font-extrabold text-white">
        Open active delivery <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------------- */
/* How it works + transport + support                                        */
/* ------------------------------------------------------------------------- */

function HowItWorks({ data, activeDelivery }: { data: PartnerDashboardData; activeDelivery: ActiveDelivery | null }) {
  const driverWithoutBag = data.transports.find(
    (transport) => transport.kind === "driver" && transport.approved && transport.insulatedBag === false
  );
  const steps = [
    { label: "Accept", icon: CheckCircle2, tone: "text-[#0b8f47] bg-[#e4f7e9]" },
    { label: "Collect food", icon: ShoppingBag, tone: "text-[#c25716] bg-[#fff1e6]" },
    { label: "Deliver", icon: MapPin, tone: "text-[#0b8f47] bg-[#e4f7e9]" },
    { label: "Complete", icon: CheckCircle2, tone: "text-[#0b8f47] bg-[#e4f7e9]" }
  ];
  return (
    <section aria-labelledby="how-it-works-heading" className="rounded-2xl border border-[#e5ebe6] bg-[#eef9f1] p-4">
      <h2 id="how-it-works-heading" className="font-display text-[16px] font-extrabold text-[#0f2417]">
        How your next delivery works
      </h2>
      <ol className="mt-3 flex flex-wrap items-center gap-1.5">
        {steps.map((step, index) => (
          <li key={step.label} className="flex items-center gap-1.5">
            <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-white px-3 text-[11.5px] font-extrabold text-[#14241b] shadow-sm">
              <step.icon className={`h-4 w-4 ${step.tone.split(" ")[0]}`} aria-hidden="true" />
              {step.label}
            </span>
            {index < steps.length - 1 ? <ChevronRight className="h-3.5 w-3.5 text-[#8a938d]" aria-hidden="true" /> : null}
          </li>
        ))}
      </ol>
      <p className="mt-2.5 flex items-start gap-1.5 text-[10.5px] leading-4 text-[#5d6d64]">
        <ShoppingBag className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {driverWithoutBag
          ? "An insulated food bag is not recorded on your driver transport. Food offers are not sent until operations record one."
          : activeDelivery
            ? "Your active delivery is in progress. Use the assigned order's PINs to confirm pickup and completion."
            : "Pickup and completion are confirmed with the order's one-time PINs. Keep the food hot and the bag sealed in transit."}
      </p>
    </section>
  );
}

function TransportPanel({
  data,
  activeTransport,
  onOpenTransport
}: {
  data: PartnerDashboardData;
  activeTransport: PartnerTransport | null;
  onOpenTransport: () => void;
}) {
  return (
    <section aria-labelledby="registered-transport-heading" className="rounded-2xl border border-[#e5ebe6] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="registered-transport-heading" className="font-display text-[16px] font-extrabold text-[#0f2417]">
          Registered transport
        </h2>
        <button type="button" onClick={onOpenTransport} className="inline-flex min-h-8 items-center gap-1 text-[11px] font-extrabold text-[#0b5c33] underline">
          Manage transport <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {data.transports.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-[#d7e2da] p-4 text-[11.5px] leading-5 text-[#6b7a70]">
          No delivery transport is registered on this account. Register through NaijaSend or NaijaDrive, then opt in to food delivery.
        </p>
      ) : (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {data.transports.map((transport) => {
            const Icon = vehicleIcon(transport.rawVehicle);
            const current = activeTransport?.kind === transport.kind;
            return (
              <li key={transport.kind}>
                <div
                  className={`flex min-h-[68px] items-center gap-2.5 rounded-xl border p-3 ${
                    current ? "border-[#0b5c33] bg-[#f6fcf8]" : "border-[#e5ebe6] bg-white"
                  }`}
                >
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${current ? "bg-[#e4f7e9] text-[#0b5c33]" : "bg-[#f5f8f6] text-[#5d6d64]"}`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-extrabold text-[#14241b]">{transport.label}</p>
                    <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[9.5px] font-extrabold ${statusTone(transport.status)}`}>
                      {transport.statusLabel}
                    </span>
                  </div>
                  {current ? <CheckCircle2 className="h-5 w-5 shrink-0 text-[#0b8f47]" aria-label="Active transport" /> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2.5 text-[10px] leading-4 text-[#7c8b81]">
        Only approved transport can be selected. Pending, suspended and disabled transport stays visible so you can see its real state.
      </p>
    </section>
  );
}

function SupportCard({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex w-full items-center gap-3 rounded-2xl bg-[#eef9f1] p-4 text-left transition hover:bg-[#e6f5eb]">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-[#0b5c33] shadow-sm">
        <Headphones className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[14px] font-extrabold text-[#0f2417]">Need help?</span>
        <span className="block text-[11px] text-[#5d6d64]">Contact partner support</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[#0b5c33] transition group-hover:translate-x-0.5" aria-hidden="true" />
    </button>
  );
}

/* ------------------------------------------------------------------------- */
/* Deliveries view                                                           */
/* ------------------------------------------------------------------------- */

function DeliveriesView({ data, online, onGoOnline }: { data: PartnerDashboardData; online: boolean; onGoOnline: () => void }) {
  const router = useRouter();
  const [pickupPin, setPickupPin] = useState("");
  const [deliveryPin, setDeliveryPin] = useState("");
  const [busy, setBusy] = useState<"pickup" | "delivery" | null>(null);
  const [message, setMessage] = useState<Notice>(null);
  const delivery = data.activeDelivery;

  async function confirmStep(step: "pickup" | "delivery") {
    if (!delivery || busy) return;
    setBusy(step);
    setMessage(null);
    try {
      const response = await fetch("/api/eats/dispatch/status", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step,
          dispatchId: delivery.dispatchId,
          pin: step === "pickup" ? pickupPin : deliveryPin
        })
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMessage({ tone: "error", text: body.error ?? "That PIN was not accepted." });
        return;
      }
      setPickupPin("");
      setDeliveryPin("");
      setMessage({
        tone: "ok",
        text: step === "pickup" ? "Pickup confirmed. Head to the customer." : "Delivery completed and settlement recorded in the ledger."
      });
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "The delivery status could not be updated. Check your connection and try again." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-[24px] font-extrabold tracking-[-0.02em] text-[#0f2417]">Deliveries</h1>
        <p className="mt-0.5 text-[12px] text-[#5d6d64]">Your active job, PIN confirmation and recent completed deliveries.</p>
      </header>

      {message ? (
        <div role={message.tone === "error" ? "alert" : "status"} className={`rounded-xl border px-3 py-2.5 text-[12px] font-semibold ${message.tone === "error" ? "border-[#f3c6c2] bg-[#fdf0ef] text-[#8f1d18]" : "border-[#cfe8d4] bg-[#eef9f1] text-[#0b5c33]"}`}>
          {message.text}
        </div>
      ) : null}

      {delivery ? (
        <section aria-labelledby="active-delivery-heading" className="rounded-2xl border border-[#e5ebe6] bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 id="active-delivery-heading" className="font-display text-[18px] font-extrabold text-[#0f2417]">
                Active delivery · {delivery.order.orderNumber}
              </h2>
              <p className="text-[11px] text-[#6b7a70]">Assigned to you. Contact details are shown only for this job.</p>
            </div>
            <span className="rounded-full bg-[#fff0d9] px-2.5 py-1 text-[10px] font-extrabold text-[#8a4308]">
              {delivery.order.status === "picked_up" ? "Collected" : "Assigned"}
            </span>
          </div>

          <ol className="mt-4 flex flex-wrap items-center gap-1.5" aria-label="Delivery progress">
            {[
              { label: "Accepted", done: true },
              { label: "Collected", done: delivery.order.status === "picked_up" || Boolean(delivery.pickedUpAt) },
              { label: "Delivered", done: delivery.order.status === "delivered" }
            ].map((step, index) => (
              <li key={step.label} className="flex items-center gap-1.5">
                <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 text-[10.5px] font-extrabold ${step.done ? "bg-[#e4f7e9] text-[#086536]" : "bg-[#f1f4f2] text-[#6b7a70]"}`}>
                  {step.done ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <span className="grid h-3.5 w-3.5 place-items-center rounded-full border border-[#9aa59e] text-[8px]" aria-hidden="true">{index + 1}</span>}
                  {step.label}
                </span>
                {index < 2 ? <ChevronRight className="h-3.5 w-3.5 text-[#8a938d]" aria-hidden="true" /> : null}
              </li>
            ))}
          </ol>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-[#fff8f2] p-3">
              <p className="text-[10.5px] font-extrabold uppercase tracking-wide text-[#8a4308]">Pickup</p>
              <p className="mt-1 text-[12.5px] font-extrabold text-[#14241b]">{delivery.order.restaurant.name}</p>
              <p className="text-[11px] leading-5 text-[#5d6d64]">{delivery.order.restaurant.address}</p>
              <p className="text-[10.5px] text-[#6b7a70]">{delivery.order.restaurant.market}</p>
              <a href={`tel:${delivery.order.restaurant.phone}`} className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-[#0b5c33] underline">
                <Phone className="h-3.5 w-3.5" aria-hidden="true" /> Call kitchen
              </a>
            </div>
            <div className="rounded-xl bg-[#f4fbf6] p-3">
              <p className="text-[10.5px] font-extrabold uppercase tracking-wide text-[#086536]">Delivery</p>
              <p className="mt-1 text-[12.5px] font-extrabold text-[#14241b]">{delivery.order.contactName}</p>
              <p className="text-[11px] leading-5 text-[#5d6d64]">{delivery.order.deliveryAddress}</p>
              <p className="text-[10.5px] text-[#6b7a70]">{paymentLabel(delivery.order.paymentStatus)} · {formatMoney(delivery.order.totalKobo)} order value</p>
              <a href={`tel:${delivery.order.contactPhone}`} className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-[#0b5c33] underline">
                <Phone className="h-3.5 w-3.5" aria-hidden="true" /> Call customer
              </a>
            </div>
          </div>

          {delivery.order.status === "courier_assigned" ? (
            <form
              className="mt-4 rounded-xl border border-[#e5ebe6] p-3"
              onSubmit={(event) => {
                event.preventDefault();
                void confirmStep("pickup");
              }}
            >
              <label htmlFor="pickup-pin" className="text-[11px] font-extrabold text-[#14241b]">Pickup PIN from the kitchen</label>
              <p className="mt-0.5 text-[10.5px] text-[#6b7a70]">The kitchen or restaurant order page issues this PIN. It is not your device location.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  id="pickup-pin"
                  value={pickupPin}
                  onChange={(event) => setPickupPin(event.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={12}
                  required
                  className="min-h-11 w-36 rounded-lg border border-[#d8e2da] px-3 font-mono text-[14px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b5c33]"
                />
                <button type="submit" disabled={busy !== null || !pickupPin.trim()} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#0b7a3b] px-4 text-[12px] font-extrabold text-white disabled:opacity-60">
                  {busy === "pickup" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                  Confirm pickup
                </button>
              </div>
            </form>
          ) : delivery.order.status === "picked_up" ? (
            <form
              className="mt-4 rounded-xl border border-[#e5ebe6] p-3"
              onSubmit={(event) => {
                event.preventDefault();
                void confirmStep("delivery");
              }}
            >
              <label htmlFor="delivery-pin" className="text-[11px] font-extrabold text-[#14241b]">Customer delivery PIN</label>
              <p className="mt-0.5 text-[10.5px] text-[#6b7a70]">Ask the customer for the PIN shown on their order. Location alone cannot complete a delivery.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  id="delivery-pin"
                  value={deliveryPin}
                  onChange={(event) => setDeliveryPin(event.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={12}
                  required
                  className="min-h-11 w-36 rounded-lg border border-[#d8e2da] px-3 font-mono text-[14px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b5c33]"
                />
                <button type="submit" disabled={busy !== null || !deliveryPin.trim()} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#0b7a3b] px-4 text-[12px] font-extrabold text-white disabled:opacity-60">
                  {busy === "delivery" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                  Complete delivery
                </button>
              </div>
            </form>
          ) : (
            <p className="mt-4 rounded-xl bg-[#f4fbf6] p-3 text-[11.5px] text-[#40564a]">This delivery has no further action in the dashboard.</p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(delivery.order.deliveryAddress)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#d8e2da] px-3 text-[11px] font-bold text-[#0b5c33]"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Open navigation (external)
            </a>
            <p className="text-[10px] text-[#7c8b81]">Opens Google Maps in a new tab using the recorded delivery address. This is not in-app turn-by-turn guidance.</p>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-[#d7e2da] bg-white p-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#eaf7ee] text-[#0b5c33]">
            <PackageCheck className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="mt-2 font-display text-[16px] font-extrabold text-[#0f2417]">No active delivery</h2>
          <p className="mx-auto mt-1 max-w-sm text-[11.5px] leading-5 text-[#6b7a70]">
            {online
              ? "You are online. A new request will appear on Overview when a kitchen dispatches an order in your area."
              : "Go online to receive a delivery request. Accepted jobs appear here with the PIN steps."}
          </p>
          {!online ? (
            <button type="button" onClick={onGoOnline} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#0b7a3b] px-4 text-[12px] font-extrabold text-white">
              Go online
            </button>
          ) : null}
        </section>
      )}

      <section aria-labelledby="delivery-history-heading" className="rounded-2xl border border-[#e5ebe6] bg-white p-4">
        <h2 id="delivery-history-heading" className="font-display text-[16px] font-extrabold text-[#0f2417]">Recent completed deliveries</h2>
        {data.recentDeliveries.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-[#d7e2da] p-4 text-[11.5px] leading-5 text-[#6b7a70]">
            No completed NaijaEats deliveries are recorded for this account yet. Completed jobs and their settlement credits will appear here.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-[#eef1ef]">
            {data.recentDeliveries.map((deliveryRow) => (
              <li key={deliveryRow.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="text-[12px] font-extrabold text-[#14241b]">{deliveryRow.orderNumber} · {deliveryRow.restaurantName}</p>
                  <p className="truncate text-[10.5px] text-[#6b7a70]">{deliveryRow.deliveryAddress}</p>
                  <p className="text-[10px] text-[#8a938d]">{deliveryRow.market} · {formatDateTime(deliveryRow.deliveredAt)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10.5px] font-bold text-[#5d6d64]">{paymentLabel(deliveryRow.paymentStatus)}</p>
                  <p className="text-[10px] text-[#8a938d]">{formatMoney(deliveryRow.totalKobo)} order</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Earnings view                                                             */
/* ------------------------------------------------------------------------- */

function EarningsView({ data }: { data: PartnerDashboardData }) {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-[24px] font-extrabold tracking-[-0.02em] text-[#0f2417]">Earnings</h1>
        <p className="mt-0.5 text-[12px] text-[#5d6d64]">Delivery earnings credited by the NaijaEats settlement ledger.</p>
      </header>
      <section aria-label="Earnings summary" className="grid gap-3 sm:grid-cols-3">
        <SummaryCard icon={CircleDollarSign} label="Today" value={formatMoney(data.stats.earningsTodayKobo, data.stats.currency)} sub="Settled delivery credits" title="Ledger credits posted today in Africa/Lagos." />
        <SummaryCard icon={ReceiptText} label="Last 7 days" value={formatMoney(data.stats.earningsWeekKobo, data.stats.currency)} sub="Settled delivery credits" title="Ledger credits posted in the last seven local days." />
        <SummaryCard icon={WalletCards} label="All time" value={formatMoney(data.stats.earningsAllKobo, data.stats.currency)} sub="Settled delivery credits" title="All NaijaEats delivery credits posted to your partner wallet." />
      </section>
      <section aria-labelledby="earnings-ledger-heading" className="rounded-2xl border border-[#e5ebe6] bg-white p-4">
        <h2 id="earnings-ledger-heading" className="font-display text-[16px] font-extrabold text-[#0f2417]">Recent settlement credits</h2>
        {data.wallet.recent.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-[#d7e2da] p-4 text-[11.5px] leading-5 text-[#6b7a70]">
            No delivery earnings have been settled to this partner wallet yet. Completed deliveries post one ledger credit each.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-[#eef1ef]">
            {data.wallet.recent.map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-[#14241b]">{row.description}</p>
                  <p className="text-[10px] text-[#8a938d]">{row.memo} · {formatDateTime(row.createdAt)}</p>
                </div>
                <p className="shrink-0 text-[12px] font-extrabold text-[#0b5c33]">+{formatMoney(row.amountKobo, data.wallet.currency)}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[10px] leading-4 text-[#7c8b81]">
          These are gross delivery earnings recorded by the platform ledger. Tips, incentives, fees, adjustments and cash-on-delivery balances are not modelled and are not included. The ledger, not this page, is authoritative.
        </p>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Wallet view                                                               */
/* ------------------------------------------------------------------------- */

function WalletView({ data }: { data: PartnerDashboardData }) {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-[24px] font-extrabold tracking-[-0.02em] text-[#0f2417]">Wallet &amp; payouts</h1>
        <p className="mt-0.5 text-[12px] text-[#5d6d64]">Your partner wallet balance and delivery settlement history.</p>
      </header>
      <section aria-label="Wallet balance" className="grid gap-3 sm:grid-cols-3">
        <SummaryCard icon={CircleDollarSign} label="Delivery earnings credited" value={formatMoney(data.stats.earningsAllKobo, data.wallet.currency)} sub="EATS settlement ledger · all time" title="All delivery-earnings credits posted by the EATS settlement ledger, identified by the EATS-SETTLE reference and the Delivery earnings memo." />
        <SummaryCard icon={ReceiptText} label="Today's delivery credits" value={formatMoney(data.stats.earningsTodayKobo, data.wallet.currency)} sub="Settled earnings · Africa/Lagos" title="Today's NaijaEats delivery credits." />
        <SummaryCard icon={WalletCards} label="Account wallet available" value={formatMoney(data.wallet.availableKobo, data.wallet.currency)} sub={`${data.wallet.rows.length} wallet ${data.wallet.rows.length === 1 ? "row" : "rows"} · ${data.wallet.currency}`} title="Available balance across the wallet rows on this NaijaDeals account, in the displayed currency. The wallet row may also hold non-delivery revenue." />
      </section>

      <section aria-labelledby="wallet-rows-heading" className="rounded-2xl border border-[#e5ebe6] bg-white p-4">
        <h2 id="wallet-rows-heading" className="font-display text-[16px] font-extrabold text-[#0f2417]">Wallets on this account</h2>
        {data.wallet.rows.length === 0 ? (
          <p className="mt-2 text-[11.5px] leading-5 text-[#6b7a70]">No wallet row exists for this account yet. A settlement creates one when a delivery is completed.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {data.wallet.rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#eef1ef] px-3 py-2 text-[11.5px]">
                <span className="font-bold text-[#33443a]">{walletOwnerLabel(row.ownerType)}</span>
                <span className="text-[#5d6d64]">
                  Available <strong className="text-[#14241b]">{formatMoney(row.availableKobo, data.wallet.currency)}</strong>
                  {BigInt(row.heldKobo) > BigInt(0) ? ` · Held ${formatMoney(row.heldKobo, data.wallet.currency)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[10px] leading-4 text-[#7c8b81]">
          The payment service resolves a wallet by user account. If the same NaijaDeals account also operates a kitchen or vendor, the
          settlement row is the existing wallet rather than a second wallet. Delivery earnings above are read from the ledger by settlement
          reference and memo, so they remain correct even when the row is shared.
        </p>
      </section>
      <section aria-labelledby="payouts-heading" className="rounded-2xl border border-[#e5ebe6] bg-white p-4">
        <h2 id="payouts-heading" className="font-display text-[16px] font-extrabold text-[#0f2417]">Payouts</h2>
        <div className="mt-2 flex items-start gap-2.5 rounded-xl bg-[#fff8ed] p-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#b45309]" aria-hidden="true" />
          <div>
            <p className="text-[12px] font-extrabold text-[#7a4a0c]">Withdrawals are not configured for partner wallets in this build.</p>
            <p className="mt-0.5 text-[10.5px] leading-5 text-[#6b7a70]">
              Your available balance is recorded in the ledger, but no approved partner payout provider or withdrawal flow is configured. No payout request is simulated here.
            </p>
          </div>
        </div>
        <p className="mt-2 text-[10px] leading-4 text-[#7c8b81]">
          Cash collected is not automatically additional earnings. NaijaEats settlement posts delivery earnings to the ledger when a delivery is completed.
        </p>
      </section>
      <section aria-labelledby="wallet-history-heading" className="rounded-2xl border border-[#e5ebe6] bg-white p-4">
        <h2 id="wallet-history-heading" className="font-display text-[16px] font-extrabold text-[#0f2417]">Delivery ledger history</h2>
        {data.wallet.recent.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-[#d7e2da] p-4 text-[11.5px] leading-5 text-[#6b7a70]">
            No delivery ledger entries exist for this wallet yet.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-[#eef1ef]">
            {data.wallet.recent.map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-[#14241b]">{row.description}</p>
                  <p className="text-[10px] text-[#8a938d]">{row.reference} · {formatDateTime(row.createdAt)}</p>
                </div>
                <p className="shrink-0 text-[12px] font-extrabold text-[#0b5c33]">+{formatMoney(row.amountKobo, data.wallet.currency)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Transport & documents view                                                */
/* ------------------------------------------------------------------------- */

function TransportView({
  data,
  online,
  selectedKind,
  onSelect,
  onGoOnline
}: {
  data: PartnerDashboardData;
  online: boolean;
  selectedKind: PartnerTransportKind;
  onSelect: (kind: PartnerTransportKind) => void;
  onGoOnline: () => void;
}) {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-[24px] font-extrabold tracking-[-0.02em] text-[#0f2417]">Transport &amp; documents</h1>
        <p className="mt-0.5 text-[12px] text-[#5d6d64]">The transport registered to your partner account and its real approval state.</p>
      </header>

      <section className="rounded-2xl border border-[#e5ebe6] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#eaf7ee] text-[#0b8f47]">
              <MapPin className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[12.5px] font-extrabold text-[#14241b]">{data.partner.city ?? "Operating city not set"}</p>
              <p className="text-[10.5px] text-[#6b7a70]">Operating area from your transport profile</p>
            </div>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${data.partner.cityActive ? "bg-[#e4f7e9] text-[#086536]" : "bg-[#fff0d9] text-[#8a4308]"}`}>
            {data.partner.cityActive ? "Food delivery activated" : "City activation not recorded"}
          </span>
        </div>
        <p className="mt-2 text-[10.5px] leading-5 text-[#7c8b81]">
          Operating areas are configured by administrators in the Control Center city settings. Changing your recorded city is handled by partner operations; there is no self-service city editor in this build.
        </p>
      </section>

      <div className="grid gap-3 xl:grid-cols-2">
        {data.transports.map((transport) => {
          const Icon = vehicleIcon(transport.rawVehicle);
          const current = selectedKind === transport.kind;
          return (
            <section key={transport.kind} className={`rounded-2xl border bg-white p-4 ${current ? "border-[#0b5c33]" : "border-[#e5ebe6]"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${current ? "bg-[#e4f7e9] text-[#0b5c33]" : "bg-[#f5f8f6] text-[#5d6d64]"}`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-[16px] font-extrabold text-[#0f2417]">{transport.label}</h2>
                    <p className="text-[10.5px] text-[#6b7a70]">{transport.kind === "courier" ? "NaijaSend courier transport" : "NaijaDrive driver transport"}</p>
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9.5px] font-extrabold ${statusTone(transport.status)}`}>{transport.statusLabel}</span>
              </div>

              <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 text-[11px] sm:grid-cols-2">
                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-[#7c8b81]">Operating city</dt>
                  <dd className="font-semibold text-[#33443a]">{transport.serviceZone ?? "Not recorded"}</dd>
                </div>
                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-[#7c8b81]">Vehicle plate</dt>
                  <dd className="font-semibold text-[#33443a]">{transport.plate ?? "Not recorded"}</dd>
                </div>
                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-[#7c8b81]">Make / model</dt>
                  <dd className="font-semibold text-[#33443a]">{transport.makeModel ?? "Not recorded"}</dd>
                </div>
                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-[#7c8b81]">Licence on file</dt>
                  <dd className="font-semibold text-[#33443a]">{transport.licenceMasked ?? "Not recorded"}</dd>
                </div>
                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-[#7c8b81]">Insulated food bag</dt>
                  <dd className="font-semibold text-[#33443a]">
                    {transport.insulatedBag === null ? "Not recorded for courier transport" : transport.insulatedBag ? "Recorded" : "Not recorded"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-[#7c8b81]">Online</dt>
                  <dd className="font-semibold text-[#33443a]">{transport.online ? "Yes" : "No"}</dd>
                </div>
              </dl>

              <p className="mt-2 rounded-lg bg-[#f6f9f7] px-2.5 py-2 text-[10.5px] leading-4 text-[#5d6d64]">{transport.note}</p>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onSelect(transport.kind)}
                  disabled={!transport.approved || (current && online)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#0b7a3b] px-3 text-[11px] font-extrabold text-white disabled:cursor-not-allowed disabled:bg-[#e3e9e5] disabled:text-[#7c8b81]"
                >
                  {current ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                  {current ? (online ? "Active and online" : "Selected") : transport.approved ? "Use this transport" : "Not selectable"}
                </button>
                {!online && transport.approved ? (
                  <button type="button" onClick={onGoOnline} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#d8e2da] px-3 text-[11px] font-bold text-[#0b5c33]">
                    Go online with this transport
                  </button>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      <section className="rounded-2xl border border-[#e5ebe6] bg-white p-4">
        <h2 className="font-display text-[16px] font-extrabold text-[#0f2417]">Documents</h2>
        <p className="mt-1 text-[11px] leading-5 text-[#6b7a70]">
          Document and approval changes are handled by partner operations. Self-service uploads are not configured in this build, and this page does not claim that a missing document is approved.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href="/naijasend/transporter" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#d8e2da] px-3 text-[11px] font-bold text-[#0b5c33]">
            NaijaSend transport registration <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
          <Link href="/account" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#d8e2da] px-3 text-[11px] font-bold text-[#0b5c33]">
            Account identity <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Support view                                                              */
/* ------------------------------------------------------------------------- */

function SupportView({ data }: { data: PartnerDashboardData }) {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-[24px] font-extrabold tracking-[-0.02em] text-[#0f2417]">Support</h1>
        <p className="mt-0.5 text-[12px] text-[#5d6d64]">Channels that exist today for delivery partners.</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        <SupportLink
          icon={Headphones}
          title="NaijaEats help centre"
          body="Delivery, payments, refunds and food-safety topics for customers and delivery partners."
          href="/naijaeats/help"
        />
        <SupportLink
          icon={ShieldCheck}
          title="Account & security"
          body="Change your password, review active sessions and manage your NaijaDeals profile."
          href="/account"
        />
        <SupportLink
          icon={Truck}
          title="NaijaSend transporter help"
          body="Transport registration, vehicle documentation and logistics provider guidance."
          href="/naijasend/help"
        />
        <SupportLink
          icon={PackageCheck}
          title="Your deliveries"
          body="Open your assigned and completed deliveries with their PIN steps."
          href="/naijaeats/courier?view=deliveries"
        />
      </div>
      <section className="rounded-2xl border border-[#e5ebe6] bg-white p-4">
        <h2 className="font-display text-[16px] font-extrabold text-[#0f2417]">Partner account</h2>
        <p className="mt-1 text-[11.5px] leading-5 text-[#5d6d64]">
          {data.partner.name} · {data.partner.email}
          {data.partner.phone ? ` · ${data.partner.phone}` : ""}
        </p>
        <p className="mt-2 text-[10.5px] leading-5 text-[#7c8b81]">
          There is no live chat or telephone support desk configured in this build, so no response-time promise is displayed. Support runs through the help centre and account pages above.
        </p>
      </section>
    </div>
  );
}

function SupportLink({ icon: Icon, title, body, href }: { icon: typeof Headphones; title: string; body: string; href: string }) {
  return (
    <Link href={href} className="group flex items-start gap-3 rounded-2xl border border-[#e5ebe6] bg-white p-4 transition hover:border-[#bfd8c6] hover:bg-[#fbfdfb]">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eaf7ee] text-[#0b5c33]">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-extrabold text-[#14241b]">{title}</span>
        <span className="mt-0.5 block text-[10.5px] leading-5 text-[#6b7a70]">{body}</span>
      </span>
      <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-[#8a938d] transition group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}

/* ------------------------------------------------------------------------- */
/* Settings view                                                             */
/* ------------------------------------------------------------------------- */

function SettingsView({
  data,
  onNotice,
  onRefresh
}: {
  data: PartnerDashboardData;
  onNotice: (notice: Notice) => void;
  onRefresh: () => void;
}) {
  const [name, setName] = useState(data.partner.name);
  const [phone, setPhone] = useState(data.partner.phone ?? "");
  const [saving, setSaving] = useState(false);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/account", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone })
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        onNotice({ tone: "error", text: body.error ?? "Your profile could not be saved." });
        return;
      }
      onNotice({ tone: "ok", text: "Profile saved." });
      onRefresh();
    } catch {
      onNotice({ tone: "error", text: "Your profile could not be saved. Check your connection and try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-[24px] font-extrabold tracking-[-0.02em] text-[#0f2417]">Settings</h1>
        <p className="mt-0.5 text-[12px] text-[#5d6d64]">Partner profile and delivery notification preferences.</p>
      </header>

      <section aria-labelledby="profile-settings-heading" className="rounded-2xl border border-[#e5ebe6] bg-white p-4">
        <h2 id="profile-settings-heading" className="font-display text-[16px] font-extrabold text-[#0f2417]">Partner profile</h2>
        <form onSubmit={saveProfile} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-[11px] font-bold text-[#33443a]">
            Full name
            <input
              required
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border border-[#d8e2da] px-3 text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b5c33]"
            />
          </label>
          <label className="text-[11px] font-bold text-[#33443a]">
            Phone number
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              inputMode="tel"
              autoComplete="tel"
              className="mt-1 min-h-11 w-full rounded-lg border border-[#d8e2da] px-3 text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b5c33]"
            />
          </label>
          <label className="text-[11px] font-bold text-[#33443a] sm:col-span-2">
            Email
            <input value={data.partner.email} readOnly className="mt-1 min-h-11 w-full rounded-lg border border-[#e5ebe6] bg-[#f7f9f8] px-3 text-[13px] text-[#5d6d64]" />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#0b7a3b] px-4 text-[12px] font-extrabold text-white disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null} Save profile
            </button>
          </div>
        </form>
        <p className="mt-2 text-[10px] leading-4 text-[#7c8b81]">
          Password changes, session review and account security are handled by the shared NaijaDeals account. <Link href="/account" className="font-bold text-[#0b5c33] underline">Open account security</Link>.
        </p>
      </section>

      <NotificationPreferences />

      <section className="rounded-2xl border border-[#e5ebe6] bg-white p-4">
        <h2 className="font-display text-[16px] font-extrabold text-[#0f2417]">Operating city</h2>
        <p className="mt-1 text-[11.5px] leading-5 text-[#5d6d64]">
          {data.partner.city ?? "No operating city is recorded on your transport."}
          {data.partner.city ? ` · ${data.partner.cityActive ? "food delivery activated" : "city activation not recorded"}` : ""}
        </p>
        <p className="mt-1 text-[10px] leading-4 text-[#7c8b81]">
          Operating areas are managed by administrators. Contact partner support to change your city or transport approval; this build has no self-service editor for those fields.
        </p>
      </section>
    </div>
  );
}

function NotificationPreferences() {
  const [preferences, setPreferences] = useState<Array<{ channel: string; category: string; enabled: boolean; mandatory: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications/preferences", { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("Notification preferences could not be loaded.");
      const body = (await response.json()) as { preferences?: Array<{ channel: string; category: string; enabled: boolean; mandatory: boolean }> };
      setPreferences(Array.isArray(body.preferences) ? body.preferences.filter((row) => row.category === "DISPATCH") : []);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Notification preferences could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(channel: string, category: string, enabled: boolean) {
    setBusy(`${channel}:${category}`);
    try {
      const response = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, category, enabled })
      });
      if (!response.ok) throw new Error("That preference could not be saved.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That preference could not be saved.");
    } finally {
      setBusy("");
    }
  }

  const channels = ["IN_APP", "EMAIL", "SMS", "PUSH"];

  return (
    <section aria-labelledby="notification-settings-heading" className="rounded-2xl border border-[#e5ebe6] bg-white p-4">
      <h2 id="notification-settings-heading" className="font-display text-[16px] font-extrabold text-[#0f2417]">Delivery notifications</h2>
      <p className="mt-0.5 text-[10.5px] text-[#6b7a70]">Dispatch-category preferences for this account. Account and security messages are mandatory.</p>
      {loading ? <p className="mt-2 text-[11px] text-[#6b7a70]">Loading preferences…</p> : null}
      {error ? <p role="alert" className="mt-2 rounded-lg bg-[#fdf0ef] px-2.5 py-2 text-[10.5px] font-semibold text-[#8f1d18]">{error}</p> : null}
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {channels.map((channel) => {
          const row = preferences.find((preference) => preference.channel === channel);
          if (!row) return null;
          return (
            <label key={channel} className="flex min-h-10 items-center justify-between gap-2 rounded-lg border border-[#eef1ef] px-3 text-[11px] font-semibold text-[#33443a]">
              <span>{channel === "IN_APP" ? "In-app" : channel === "EMAIL" ? "Email" : channel === "SMS" ? "SMS" : "Push"}</span>
              <input
                type="checkbox"
                checked={row.enabled}
                disabled={row.mandatory || busy === `${channel}:DISPATCH`}
                onChange={(event) => void toggle(channel, "DISPATCH", event.target.checked)}
                className="h-4 w-4 accent-[#0b7a3b]"
              />
            </label>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------- */
/* Location explanation dialog                                               */
/* ------------------------------------------------------------------------- */

function LocationDialog({
  intent,
  transportLabel,
  city,
  geoState,
  busy,
  onCancel,
  onConfirm
}: {
  intent: PendingIntent;
  transportLabel: string;
  city: string | null;
  geoState: GeoState;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCancel();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center px-4">
      <button type="button" aria-label="Cancel location request" onClick={onCancel} className="absolute inset-0 bg-[#0d1b13]/50" />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="location-dialog-heading" className="relative w-full max-w-[460px] rounded-2xl border border-[#e2e8e3] bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#eaf7ee] text-[#0b5c33]">
            <LocateFixed className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="location-dialog-heading" className="font-display text-[18px] font-extrabold text-[#0f2417]">
              {intent.type === "switch" ? `Switch to ${transportLabel}?` : "Use device location to go online?"}
            </h2>
            <p className="mt-1 text-[11.5px] leading-5 text-[#5d6d64]">
              {intent.type === "switch"
                ? `Only one transport can receive requests at a time. Going online with ${transportLabel} stops offers for the other transport.`
                : "NaijaEats uses your device location while you are online to match nearby deliveries and show your position on the map."}
            </p>
          </div>
        </div>
        <ul className="mt-3 space-y-1.5 rounded-xl bg-[#f6faf7] p-3 text-[10.5px] leading-4 text-[#40564a]">
          <li className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0b8f47]" aria-hidden="true" /> Your browser will ask for location permission explicitly.</li>
          <li className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0b8f47]" aria-hidden="true" /> Location reading must be current and within {city ?? "your operating area"}.</li>
          <li className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0b8f47]" aria-hidden="true" /> Tracking stops when you go offline, sign out or close this page.</li>
          <li className="flex items-start gap-1.5"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#6b7a70]" aria-hidden="true" /> A web page cannot track in the background after the browser is closed or the device suspends it.</li>
        </ul>
        {geoState === "denied" ? (
          <p className="mt-2 rounded-lg bg-[#fff8ed] px-2.5 py-2 text-[10.5px] leading-4 text-[#7a4a0c]">
            Location permission is already blocked for this site. Allow it in your browser settings, then try again.
          </p>
        ) : null}
        {geoState === "unsupported" ? (
          <p className="mt-2 rounded-lg bg-[#fdf0ef] px-2.5 py-2 text-[10.5px] leading-4 text-[#8f1d18]">
            This browser does not provide the Geolocation API, so the online action is unavailable here.
          </p>
        ) : null}
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} disabled={busy} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[#d8e2da] px-4 text-[12px] font-bold text-[#33443a] disabled:opacity-60">
            Not now
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || geoState === "unsupported"}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#0b7a3b] px-4 text-[12px] font-extrabold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LocateFixed className="h-4 w-4" aria-hidden="true" />}
            {busy ? "Requesting location…" : geoState === "denied" ? "Try again" : "Allow location & continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
