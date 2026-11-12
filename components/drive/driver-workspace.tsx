"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  Bell,
  Bike,
  Car,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock,
  CreditCard,
  FileText,
  Gauge,
  Home,
  Loader2,
  LocateFixed,
  LogOut,
  MapPin,
  Menu,
  Navigation,
  Package,
  Phone,
  Play,
  RefreshCw,
  Route,
  Settings,
  ShieldCheck,
  Square,
  TriangleAlert,
  UserRound,
  Users,
  Wallet,
  Wifi,
  WifiOff,
  X
} from "lucide-react";
import { ApiRequestError, apiClient, koboToNaira } from "@/lib/api-client";
import { DRIVE_CITY, findVehicleClass, formatDistanceShort } from "@/lib/config/drive";
import { PartnerNotifications } from "@/components/functional/partner-notifications";
import { TripMap } from "./trip-map";
import { EarningsBreakdown } from "./earnings-breakdown";
import {
  DriveApiError,
  getDriverBoard,
  getPartnerNotifications,
  getTracking,
  markPartnerNotificationsRead,
  postPresence,
  signOut,
  verifyPassenger
} from "./api";
import { useBrowserLocation } from "./use-browser-location";
import { RideRatingPanel } from "./ride-rating";
import type { DriverBoard, DriverBoardRide, DriverNotification, DriveTracking } from "./types";

const focus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b5c33]";

type Tab = "overview" | "trips" | "earnings" | "wallet" | "vehicle" | "support" | "settings";

const navItems: Array<{ id: Tab; label: string; icon: typeof Home }> = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "trips", label: "Trips", icon: Car },
  { id: "earnings", label: "Earnings", icon: Gauge },
  { id: "wallet", label: "Wallet & payouts", icon: Wallet },
  { id: "vehicle", label: "Vehicle & documents", icon: FileText },
  { id: "support", label: "Support", icon: CircleHelp },
  { id: "settings", label: "Settings", icon: Settings }
];

const money = (value: string | number | null | undefined) =>
  value === null || value === undefined ? "—" : koboToNaira(value);

function formatDuration(totalSeconds: number | null | undefined) {
  const seconds = Math.max(0, Math.floor(totalSeconds ?? 0));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function timeAgo(iso: string | null | undefined, now: number) {
  if (!iso) return "not yet";
  const age = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (age < 10) return "just now";
  if (age < 60) return `${age}s ago`;
  if (age < 3600) return `${Math.floor(age / 60)}m ago`;
  return `${Math.floor(age / 3600)}h ago`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function describeError(caught: unknown, fallback: string) {
  if (caught instanceof ApiRequestError || caught instanceof DriveApiError) return caught.message;
  return caught instanceof Error ? caught.message : fallback;
}

export function DriverWorkspace({ userName }: { userName: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [board, setBoard] = useState<DriverBoard | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "forbidden">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [greeting, setGreeting] = useState("Welcome back");
  const [mobileNav, setMobileNav] = useState(false);
  const [notifications, setNotifications] = useState<DriverNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [presenceError, setPresenceError] = useState("");
  const [tracking, setTracking] = useState<DriveTracking | null>(null);
  const [trackingError, setTrackingError] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [isOnlineBrowser, setIsOnlineBrowser] = useState(true);

  const lastHeartbeatRef = useRef(0);
  const activeRide = board?.active[0] ?? null;
  const activeRideId = activeRide?.id ?? null;
  const online = Boolean(board?.presence.online);
  const onlineRef = useRef(false);
  onlineRef.current = online;
  const fixRef = useRef<ReturnType<typeof useBrowserLocation>["fix"]>(null);

  const loadBoard = useCallback(async () => {
    try {
      const data = await getDriverBoard();
      setBoard(data);
      setState("ready");
      setError("");
    } catch (caught) {
      const status = caught instanceof DriveApiError ? caught.status : 0;
      if (status === 401 || status === 403) {
        setState("forbidden");
        setError(describeError(caught, "Driver access is required."));
      } else {
        setState((current) => (current === "ready" ? current : "error"));
        setError(describeError(caught, "Unable to load the driver workspace."));
      }
    }
  }, []);

  const sendHeartbeat = useCallback(
    async (fix: NonNullable<ReturnType<typeof useBrowserLocation>["fix"]>) => {
      if (!onlineRef.current) return;
      if (Date.now() - lastHeartbeatRef.current < 15_000) return;
      lastHeartbeatRef.current = Date.now();
      try {
        await postPresence({
          action: "heartbeat",
          latitude: fix.lat,
          longitude: fix.lng,
          accuracyM: fix.accuracyM
        });
      } catch (caught) {
        setPresenceError(describeError(caught, "Location heartbeat failed."));
        void loadBoard();
      }
    },
    [loadBoard]
  );

  const onFix = useCallback(
    (fix: NonNullable<ReturnType<typeof useBrowserLocation>["fix"]>) => {
      fixRef.current = fix;
      void sendHeartbeat(fix);
    },
    [sendHeartbeat]
  );

  const location = useBrowserLocation(onFix);
  const { startWatch, stopWatch } = location;

  useEffect(() => {
    void loadBoard();
    getPartnerNotifications()
      .then((result) => {
        setNotifications(result.notifications);
        setUnread(result.unread);
      })
      .catch(() => undefined);
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening");
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(() => void loadBoard(), 12_000);
    const onOnline = () => setIsOnlineBrowser(true);
    const onOffline = () => setIsOnlineBrowser(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    setIsOnlineBrowser(navigator.onLine);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(poll);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [loadBoard]);

  // A watch is required while the driver is online or holding an active trip. It is
  // stopped when neither is true, so the browser is not collecting location forever.
  useEffect(() => {
    if (online || activeRideId) startWatch();
    else stopWatch();
  }, [activeRideId, online, startWatch, stopWatch]);

  // A stationary phone may not emit new watchPosition fixes; send the last usable
  // fix as a heartbeat while it is still fresh. If the fix is stale, no heartbeat is
  // sent and server presence expires on its documented TTL.
  useEffect(() => {
    if (!online) return;
    const timer = window.setInterval(() => {
      const fix = fixRef.current;
      if (!fix) return;
      if (Date.now() - fix.capturedAt > 90_000) return;
      void sendHeartbeat(fix);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [online, sendHeartbeat]);

  // Track the assigned ride. Out-of-order responses cannot move the map backwards.
  const lastCapturedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeRideId || !activeRide) {
      setTracking(null);
      return;
    }
    if (!["driver_assigned", "driver_arriving", "in_progress"].includes(activeRide.status)) {
      setTracking(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const next = await getTracking(activeRideId);
        if (cancelled) return;
        if (next.latest && lastCapturedRef.current && next.latest.capturedAt < lastCapturedRef.current) return;
        if (next.latest) lastCapturedRef.current = next.latest.capturedAt;
        setTracking(next);
        setTrackingError("");
      } catch (caught) {
        if (cancelled) return;
        setTrackingError(describeError(caught, "Tracking is reconnecting."));
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeRide, activeRideId]);

  async function run(key: string, action: () => Promise<unknown>, message: string) {
    setBusy(key);
    setError("");
    setNotice("");
    setPresenceError("");
    try {
      await action();
      setNotice(message);
      await loadBoard();
    } catch (caught) {
      setError(describeError(caught, "That action could not be completed."));
    } finally {
      setBusy("");
    }
  }

  async function goOnline() {
    setOnlineBusy(true);
    setPresenceError("");
    setError("");
    setNotice("");
    try {
      const fix = await location.requestOnce();
      if (!fix) {
        setPresenceError("A usable browser location is required before you can go online.");
        return;
      }
      await postPresence({
        action: "go_online",
        latitude: fix.lat,
        longitude: fix.lng,
        accuracyM: fix.accuracyM
      });
      lastHeartbeatRef.current = Date.now();
      await loadBoard();
      startWatch();
      setNotice("You are online. Approved passenger requests in Lagos can now be accepted.");
    } catch (caught) {
      setPresenceError(describeError(caught, "Unable to go online."));
      await loadBoard();
    } finally {
      setOnlineBusy(false);
    }
  }

  async function goOffline() {
    setOnlineBusy(true);
    setPresenceError("");
    setError("");
    setNotice("");
    try {
      await postPresence({ action: "go_offline" });
      await loadBoard();
      if (!activeRideId) stopWatch();
      setNotice(
        activeRideId
          ? "New requests stopped. The current trip continues and its location tracking stays on."
          : "You are offline. Location sharing has stopped."
      );
    } catch (caught) {
      setPresenceError(describeError(caught, "Unable to go offline."));
    } finally {
      setOnlineBusy(false);
    }
  }

  async function acceptRide(ride: DriverBoardRide) {
    await run(
      `accept-${ride.id}`,
      () => apiClient.driverAcceptRide(ride.id),
      `Ride ${ride.rideNumber} accepted. Navigate to the pick-up next.`
    );
  }

  async function advance(status: "driver_arriving" | "in_progress" | "completed") {
    if (!activeRide) return;
    await run(
      `status-${status}`,
      () => apiClient.driverRideStatus(activeRide.id, status),
      status === "driver_arriving"
        ? "Arrival recorded at the pick-up point."
        : status === "in_progress"
          ? "Trip started. Navigate to the passenger's destination."
          : "Trip completed. The receipt is available to the rider."
    );
  }

  async function releaseRide() {
    if (!activeRide) return;
    await run(
      `release-${activeRide.id}`,
      () => apiClient.driverReleaseRide(activeRide.id, "Driver released the ride."),
      "Ride released back to the open queue."
    );
  }

  async function submitVerification() {
    if (!activeRide) return;
    setBusy(`verify-${activeRide.id}`);
    setVerificationError("");
    setError("");
    setNotice("");
    try {
      await verifyPassenger(activeRide.id, verifyCode);
      setVerifyCode("");
      setNotice("Passenger verified. You can start the trip.");
      await loadBoard();
    } catch (caught) {
      // The authoritative service distinguishes a wrong code, an expiry, a
      // lockout and a rate-limited retry; show that state instead of a generic
      // failure so the driver never believes the trip can start.
      setVerificationError(describeError(caught, "That pickup code could not be verified."));
      await loadBoard();
    } finally {
      setBusy("");
    }
  }

  async function recordCash(ride: DriverBoardRide) {
    await run(`cash-${ride.id}`, () => apiClient.driverCashCollected(ride.id), "Cash fare recorded.");
  }

  async function markAllRead() {
    try {
      await markPartnerNotificationsRead();
      setUnread(0);
      setNotifications((rows) => rows.map((row) => ({ ...row, readAt: row.readAt ?? new Date().toISOString() })));
    } catch {
      /* the bell still opens the panel */
    }
  }

  async function doSignOut() {
    await signOut().catch(() => undefined);
    router.push("/");
    router.refresh();
  }

  const activeSummary = useMemo(() => {
    if (!activeRide) return null;
    return {
      pickup: tracking?.pickup ?? { label: activeRide.pickupLabel, lat: activeRide.pickupLat, lng: activeRide.pickupLng },
      dropoff: tracking?.dropoff ?? { label: activeRide.dropoffLabel, lat: activeRide.dropoffLat, lng: activeRide.dropoffLng },
      target:
        tracking?.target ??
        (activeRide.status === "in_progress"
          ? { label: activeRide.dropoffLabel, lat: activeRide.dropoffLat, lng: activeRide.dropoffLng }
          : { label: activeRide.pickupLabel, lat: activeRide.pickupLat, lng: activeRide.pickupLng })
    };
  }, [activeRide, tracking]);

  const mapPickup = useMemo(
    () =>
      activeSummary?.pickup && activeSummary.pickup.lat && activeSummary.pickup.lng
        ? { lat: activeSummary.pickup.lat, lng: activeSummary.pickup.lng, label: activeSummary.pickup.label }
        : null,
    [activeSummary]
  );
  const mapDropoff = useMemo(
    () =>
      activeSummary?.dropoff && activeSummary.dropoff.lat && activeSummary.dropoff.lng
        ? { lat: activeSummary.dropoff.lat, lng: activeSummary.dropoff.lng, label: activeSummary.dropoff.label }
        : null,
    [activeSummary]
  );
  const mapDriver = useMemo(
    () =>
      tracking?.latest
        ? {
            lat: tracking.latest.lat,
            lng: tracking.latest.lng,
            accuracyM: tracking.latest.accuracyM,
            capturedAt: tracking.latest.capturedAt,
            stale: tracking.stale
          }
        : location.fix
          ? {
              lat: location.fix.lat,
              lng: location.fix.lng,
              accuracyM: location.fix.accuracyM,
              capturedAt: location.fix.capturedAt,
              stale: location.stale
            }
          : null,
    [location.fix, location.stale, tracking]
  );
  const mapRoute = tracking?.route?.geometry ?? null;

  if (state === "loading") {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f7f8f6]">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#0b5c33]" aria-label="Loading driver workspace" />
          <p className="mt-2 text-[12px] font-bold text-[#5d6d64]">Loading driver workspace…</p>
        </div>
      </div>
    );
  }

  if (state === "forbidden") {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f7f8f6] px-4">
        <div className="max-w-md rounded-2xl bg-white p-6 text-center ring-1 ring-[#e6ece6]">
          <ShieldCheck className="mx-auto h-9 w-9 text-[#0b5c33]" aria-hidden />
          <h1 className="mt-2 font-display text-[23px] font-extrabold">Driver access required</h1>
          <p className="mt-1 text-[12px] leading-5 text-[#5d6d64]">
            {error || "This account has no approved NaijaDrive passenger-ride profile."}
          </p>
          <Link href="/naijadrive" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[#0b5c33] px-5 text-[12px] font-bold text-white">
            Back to NaijaDrive
          </Link>
        </div>
      </div>
    );
  }

  if (state === "error" || !board) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f7f8f6] px-4">
        <div role="alert" className="max-w-md rounded-2xl bg-white p-6 text-center ring-1 ring-[#ef4444]/30">
          <AlertCircle className="mx-auto h-8 w-8 text-[#b91c1c]" aria-hidden />
          <h1 className="mt-2 font-display text-[20px] font-extrabold">Workspace unavailable</h1>
          <p className="mt-1 text-[12px] text-[#5d6d64]">{error}</p>
          <button type="button" onClick={() => void loadBoard()} className="mt-3 inline-flex min-h-10 items-center rounded-xl bg-[#0b5c33] px-4 text-[12px] font-bold text-white">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const vehicle = findVehicleClass(board.driver.vehicleClass);
  const city = board.driver.serviceZone || board.presence.serviceZone || DRIVE_CITY;

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-4 py-4">
        <Link href="/naijadrive" className="flex items-center gap-2" aria-label="NaijaDrive home">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#0b5c33] text-white">
            <Car className="h-5 w-5" aria-hidden />
          </span>
          <span>
            <span className="block font-display text-[19px] font-extrabold leading-none text-[#0b5c33]">NaijaDrive</span>
            <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.14em] text-[#5d6d64]">by NaijaDeals</span>
          </span>
        </Link>
        <p className="mt-4 text-[10px] font-black uppercase tracking-[0.16em] text-[#5d6d64]">Driver workspace</p>
      </div>
      <nav aria-label="Driver workspace" className="flex-1 space-y-0.5 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                setMobileNav(false);
              }}
              aria-current={active ? "page" : undefined}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[12.5px] font-bold transition ${focus} ${
                active ? "bg-[#0b5c33] text-white" : "text-[#33443a] hover:bg-[#f2f7f2] hover:text-[#0b5c33]"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="m-3 rounded-xl bg-[#f7f8f6] p-3 ring-1 ring-[#e6ece6]">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#0b5c33] text-[11px] font-black text-white">
            {initials(userName)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-extrabold text-[#14241b]">{userName}</p>
            <p className="text-[10px] text-[#5d6d64]">NaijaDeals partner account</p>
          </div>
        </div>
        <Link href="/account" className={`mt-2 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-[#cfdccf] bg-white px-2 text-[10.5px] font-bold text-[#0b5c33] ${focus}`}>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden /> Switch service
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f7f8f6] text-[#14241b]">
      <div className="lg:flex">
        <aside className="sticky top-0 hidden h-screen w-[252px] shrink-0 border-r border-[#e6ece6] bg-white lg:block">
          {sidebar}
        </aside>

        <div className="min-w-0 flex-1">
          {/* Mobile top bar */}
          <div className="flex items-center gap-2 border-b border-[#e6ece6] bg-white px-3 py-2 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileNav(true)}
              aria-label="Open driver menu"
              aria-expanded={mobileNav}
              className={`grid h-10 w-10 place-items-center rounded-lg text-[#0b5c33] hover:bg-[#f2f7f2] ${focus}`}
            >
              <Menu className="h-5 w-5" aria-hidden />
            </button>
            <span className="font-display text-[16px] font-extrabold text-[#0b5c33]">NaijaDrive driver</span>
            <span className="ml-auto rounded-full bg-[#eaf5ec] px-2 py-1 text-[10px] font-bold text-[#0b5c33]">{city}</span>
          </div>

          <main className="mx-auto max-w-[1400px] px-3 py-4 sm:px-5 lg:px-6">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="font-display text-[26px] font-extrabold leading-tight text-[#14241b] sm:text-[30px]">
                  {greeting}, {userName.split(" ")[0]}
                </h1>
                <p className="text-[12px] text-[#5d6d64]">Your driving workspace</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[#dfe7df] bg-white px-3 text-[11px] font-bold text-[#14241b]">
                  <MapPin className="h-3.5 w-3.5 text-[#0b5c33]" aria-hidden />
                  {city}
                </span>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setNotificationsOpen((open) => !open);
                      setAccountOpen(false);
                    }}
                    aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
                    aria-expanded={notificationsOpen}
                    className={`relative grid h-10 w-10 place-items-center rounded-full border border-[#dfe7df] bg-white text-[#33443a] hover:text-[#0b5c33] ${focus}`}
                  >
                    <Bell className="h-4 w-4" aria-hidden />
                    {unread > 0 ? (
                      <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#16a34a] px-1 text-[9px] font-black text-white">
                        {unread}
                      </span>
                    ) : null}
                  </button>
                  {notificationsOpen ? (
                    <div className="absolute right-0 z-30 mt-2 w-[min(340px,calc(100vw-24px))] rounded-xl border border-[#e6ece6] bg-white p-3 shadow-xl">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[12px] font-extrabold">Partner updates</p>
                        {unread > 0 ? (
                          <button type="button" onClick={() => void markAllRead()} className="text-[10.5px] font-bold text-[#0b5c33] underline">
                            Mark all read
                          </button>
                        ) : null}
                      </div>
                      {notifications.length === 0 ? (
                        <p className="mt-2 text-[11px] leading-5 text-[#5d6d64]">
                          No partner updates yet. Assignment and account notices will appear here.
                        </p>
                      ) : (
                        <ul className="mt-2 max-h-72 space-y-1.5 overflow-y-auto">
                          {notifications.slice(0, 8).map((row) => (
                            <li key={row.id} className={`rounded-lg p-2 ${row.readAt ? "bg-[#f7f8f6]" : "bg-[#eaf5ec]"}`}>
                              <p className="text-[11.5px] font-bold">{row.title}</p>
                              {row.body ? <p className="mt-0.5 text-[10.5px] leading-4 text-[#5d6d64]">{row.body}</p> : null}
                              <p className="mt-0.5 text-[9.5px] text-[#5d6d64]">{new Date(row.createdAt).toLocaleString("en-NG")}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setAccountOpen((open) => !open);
                      setNotificationsOpen(false);
                    }}
                    aria-label="Account menu"
                    aria-expanded={accountOpen}
                    className={`grid h-10 w-10 place-items-center rounded-full bg-[#0b5c33] text-[11px] font-black text-white ${focus}`}
                  >
                    {initials(userName)}
                  </button>
                  {accountOpen ? (
                    <div className="absolute right-0 z-30 mt-2 w-52 rounded-xl border border-[#e6ece6] bg-white p-1.5 shadow-xl">
                      <Link href="/account" className="flex min-h-9 items-center gap-2 rounded-lg px-2 text-[11.5px] font-bold text-[#33443a] hover:bg-[#f2f7f2]">
                        <UserRound className="h-3.5 w-3.5" aria-hidden /> Account
                      </Link>
                      <Link href="/naijadrive" className="flex min-h-9 items-center gap-2 rounded-lg px-2 text-[11.5px] font-bold text-[#33443a] hover:bg-[#f2f7f2]">
                        <Car className="h-3.5 w-3.5" aria-hidden /> Rider view
                      </Link>
                      <button
                        type="button"
                        onClick={() => void doSignOut()}
                        className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-[11.5px] font-bold text-[#b91c1c] hover:bg-[#fee2e2]"
                      >
                        <LogOut className="h-3.5 w-3.5" aria-hidden /> Log out
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </header>

            {notice ? (
              <div role="status" className="mt-3 rounded-xl bg-[#eaf5ec] p-3 text-[12px] font-bold text-[#0b5c33]">
                {notice}
              </div>
            ) : null}
            {error ? (
              <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-[#ef4444]/25 bg-[#fee2e2] p-3 text-[12px] font-bold text-[#b91c1c]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
              </div>
            ) : null}

            {/* Online strip */}
            <section aria-label="Driver availability" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-[#eaf5ec] px-3 py-2.5 ring-1 ring-[#cfe3ca]">
              <span className="inline-flex items-center gap-1.5 text-[12px] font-extrabold text-[#14241b]">
                <span className={`h-2.5 w-2.5 rounded-full ${online ? "bg-[#16a34a]" : "bg-[#8a938d]"}`} aria-hidden />
                {online ? "Online" : "Offline"}
              </span>
              <span className="hidden h-4 w-px bg-[#cfe3ca] sm:block" aria-hidden />
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#33443a]">
                <Users className="h-3.5 w-3.5 text-[#0b5c33]" aria-hidden />
                Service: Passenger rides
              </span>
              <span className="hidden h-4 w-px bg-[#cfe3ca] sm:block" aria-hidden />
              <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-[#33443a]">
                <Car className="h-3.5 w-3.5 text-[#0b5c33]" aria-hidden />
                <span className="truncate">
                  Transport: {board.driver.vehicleMake} {board.driver.vehicleModel} · {vehicle?.label ?? board.driver.vehicleClass} · {board.driver.vehiclePlate}
                </span>
              </span>
              <span className="hidden h-4 w-px bg-[#cfe3ca] sm:block" aria-hidden />
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#33443a]">
                <Clock className="h-3.5 w-3.5 text-[#0b5c33]" aria-hidden />
                Online today {formatDuration(board.presence.todayOnlineSeconds)}
              </span>
              <button
                type="button"
                onClick={() => (online ? void goOffline() : void goOnline())}
                disabled={onlineBusy}
                className={`ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-[11px] font-extrabold disabled:opacity-50 ${focus} ${
                  online ? "border border-[#0b5c33] bg-white text-[#0b5c33]" : "bg-[#0b5c33] text-white"
                }`}
              >
                {onlineBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : online ? <Square className="h-3 w-3" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
                {online ? "Stop new requests" : "Go online"}
              </button>
            </section>

            {online && board.presence.stale ? (
              <p role="status" className="mt-2 rounded-lg bg-[#fff3e8] px-3 py-2 text-[10.5px] font-semibold leading-4 text-[#a3480f]">
                <TriangleAlert className="mr-1 inline h-3 w-3" aria-hidden />
                No fresh heartbeat from this device. Presence expires after {board.presence.heartbeatTtlSeconds}s;
                drivers with an expired heartbeat are no longer shown as online.
              </p>
            ) : null}
            {board.presence.activeRideId && !online ? (
              <p className="mt-2 rounded-lg bg-[#f2f7f2] px-3 py-2 text-[10.5px] font-semibold leading-4 text-[#33443a]">
                Offline with an active trip. You will not receive new requests, but the trip and its
                location tracking continue.
              </p>
            ) : null}

            {tab === "overview" ? (
              <>
                <section aria-label="Today's summary" className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-white p-3.5 ring-1 ring-[#e6ece6]">
                    <div className="flex items-center gap-2">
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#eaf5ec] text-[#0b5c33]">
                        <Wallet className="h-4 w-4" aria-hidden />
                      </span>
                      <p className="text-[10.5px] font-bold uppercase tracking-wide text-[#5d6d64]">Today&apos;s fare released</p>
                    </div>
                    <p className="mt-2 font-display text-[24px] font-extrabold text-[#14241b]">
                      {board.summary.walletAvailableKobo === null ? "—" : money(board.summary.todayFareReleasedKobo)}
                    </p>
                    <p className="text-[10.5px] text-[#5d6d64]">
                      {board.summary.walletAvailableKobo === null
                        ? "No DRIVER wallet exists for this account."
                        : "Wallet fares released to your NaijaPay driver wallet today."}
                    </p>
                    {board.summary.todayCashRecordedKobo !== "0" ? (
                      <p className="mt-1 text-[10.5px] font-semibold text-[#33443a]">
                        Cash recorded today: {money(board.summary.todayCashRecordedKobo)}
                      </p>
                    ) : null}
                  </div>
                  <div className="rounded-xl bg-white p-3.5 ring-1 ring-[#e6ece6]">
                    <div className="flex items-center gap-2">
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#eaf5ec] text-[#0b5c33]">
                        <CheckCircle2 className="h-4 w-4" aria-hidden />
                      </span>
                      <p className="text-[10.5px] font-bold uppercase tracking-wide text-[#5d6d64]">Completed trips</p>
                    </div>
                    <p className="mt-2 font-display text-[24px] font-extrabold text-[#14241b]">
                      {board.summary.todayCompletedTrips}
                    </p>
                    <p className="text-[10.5px] text-[#5d6d64]">Completed today, from server timestamps.</p>
                    {board.summary.todayCashPendingKobo !== "0" ? (
                      <p className="mt-1 text-[10.5px] font-semibold text-[#a3480f]">
                        Cash still to record: {money(board.summary.todayCashPendingKobo)}
                      </p>
                    ) : null}
                  </div>
                  <div className="rounded-xl bg-white p-3.5 ring-1 ring-[#e6ece6]">
                    <div className="flex items-center gap-2">
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#fff3e8] text-[#a3480f]">
                        <Route className="h-4 w-4" aria-hidden />
                      </span>
                      <p className="text-[10.5px] font-bold uppercase tracking-wide text-[#5d6d64]">Active trip</p>
                    </div>
                    <p className={`mt-2 font-display text-[20px] font-extrabold capitalize ${activeRide ? "text-[#a3480f]" : "text-[#14241b]"}`}>
                      {activeRide ? statusLabel(activeRide.status) : "No active trip"}
                    </p>
                    <p className="text-[10.5px] text-[#5d6d64]">
                      {activeRide ? activeRide.rideNumber : "Accept a request to start a trip."}
                    </p>
                  </div>
                </section>

                <div className="mt-3 grid gap-3 xl:grid-cols-[1.55fr_1fr]">
                  <div className="min-w-0 space-y-3">
                    <TripMap
                      pickup={mapPickup}
                      dropoff={mapDropoff}
                      driver={mapDriver}
                      route={mapRoute}
                      routeUnavailable={Boolean(activeRide && tracking?.latest && !tracking.route)}
                      title={activeRide ? (activeRide.status === "in_progress" ? "Destination navigation" : "Pick-up navigation") : "Your position"}
                      caption={
                        activeRide
                          ? tracking?.route
                            ? `OSRM route · ${(tracking.route.distanceMeters / 1000).toFixed(1)} km · ${formatDuration(tracking.route.durationSeconds)}`
                            : tracking?.latest
                              ? "Driver position received; road route unavailable"
                              : "Waiting for a server location fix"
                          : online
                            ? "Online · waiting for requests"
                            : "Offline · go online to receive requests"
                      }
                      heightClass="h-[300px] sm:h-[390px]"
                    />
                    {activeRide && tracking?.route?.steps?.length ? (
                      <div className="rounded-xl bg-white p-3 ring-1 ring-[#e6ece6]">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-extrabold text-[#14241b]">OSRM guidance preview</p>
                          <span className="rounded-full bg-[#f2f7f2] px-2 py-0.5 text-[9px] font-bold text-[#5d6d64]">
                            External navigation recommended
                          </span>
                        </div>
                        <ol className="mt-1.5 space-y-1 text-[11px] leading-5 text-[#5d6d64]">
                          {tracking.route.steps.slice(0, 3).map((step, index) => (
                            <li key={`${step.instruction}-${index}`} className="flex gap-2">
                              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#eaf5ec] text-[9px] font-black text-[#0b5c33]">
                                {index + 1}
                              </span>
                              <span>
                                {step.instruction}
                                {step.distanceMeters > 0 ? (
                                  <span className="text-[#5d6d64]"> · {formatDistanceShort(step.distanceMeters)}</span>
                                ) : null}
                              </span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}

                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-xl bg-white p-3 ring-1 ring-[#e6ece6]">
                        <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-[#5d6d64]">
                          <LocateFixed className="h-3.5 w-3.5 text-[#0b5c33]" aria-hidden /> Location status
                        </p>
                        <p className="mt-1 text-[12px] font-extrabold text-[#14241b]">
                          {location.status === "denied"
                            ? "Permission denied"
                            : location.status === "unavailable"
                              ? "Position unavailable"
                              : location.status === "timeout"
                                ? "Location timed out"
                                : location.status === "unsupported"
                                  ? "Not supported"
                                  : location.fix
                                    ? location.stale
                                      ? "Last known position (stale)"
                                      : "Updated just now"
                                    : "Waiting for a fix"}
                        </p>
                        <p className="mt-0.5 text-[10.5px] leading-4 text-[#5d6d64]">
                          {location.fix
                            ? `Accuracy ±${Math.round(location.fix.accuracyM)} m · ${timeAgo(new Date(location.fix.capturedAt).toISOString(), now)}`
                            : location.message || "No coordinates have been received from this browser."}
                        </p>
                        {location.message && location.fix ? (
                          <p className="mt-1 text-[10px] font-semibold text-[#a3480f]">{location.message}</p>
                        ) : null}
                      </div>
                      <div className="rounded-xl bg-white p-3 ring-1 ring-[#e6ece6]">
                        <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-[#5d6d64]">
                          {isOnlineBrowser ? <Wifi className="h-3.5 w-3.5 text-[#0b5c33]" aria-hidden /> : <WifiOff className="h-3.5 w-3.5 text-[#a3480f]" aria-hidden />} Connection
                        </p>
                        <p className="mt-1 text-[12px] font-extrabold text-[#14241b]">
                          {isOnlineBrowser ? "Connected" : "Offline"}
                          {online || activeRide ? " · location running" : " · location stopped"}
                        </p>
                        <p className="mt-0.5 text-[10.5px] leading-4 text-[#5d6d64]">
                          {presenceError
                            ? presenceError
                            : online
                              ? `Last heartbeat ${timeAgo(board.presence.lastSeenAt, now)} · expires in ${board.presence.expiresAt ? Math.max(0, Math.ceil((new Date(board.presence.expiresAt).getTime() - now) / 1000)) : "—"}s`
                              : "A browser cannot guarantee location updates while the screen is locked or the app is closed."}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl bg-white p-3 ring-1 ring-[#e6ece6]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] font-extrabold text-[#14241b]">Today&apos;s activity</p>
                        <button type="button" onClick={() => setTab("trips")} className="text-[10.5px] font-bold text-[#0b5c33] underline">
                          View activity
                        </button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div>
                          <p className="text-[10px] text-[#5d6d64]">Online time</p>
                          <p className="text-[14px] font-extrabold text-[#14241b]">{formatDuration(board.presence.todayOnlineSeconds)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#5d6d64]">Available</p>
                          <p className="text-[14px] font-extrabold text-[#14241b]">{formatDuration(board.summary.todayAvailableSeconds)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#5d6d64]">To pick-up</p>
                          <p className="text-[14px] font-extrabold text-[#14241b]">{formatDuration(board.summary.todayPickupSeconds)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#5d6d64]">On trip</p>
                          <p className="text-[14px] font-extrabold text-[#14241b]">{formatDuration(board.summary.todayDrivingSeconds)}</p>
                        </div>
                      </div>
                      <p className="mt-1 text-[9.5px] leading-4 text-[#5d6d64]">
                        Online time is calculated from server online/offline events, clipped to today in
                        West Africa Time. Time from acceptance to start is counted as “to pick-up”, time
                        from start to completion as “on trip”, and the remainder as available. Breaks are
                        not tracked.
                      </p>
                    </div>
                  </div>

                  <div className="order-first min-w-0 space-y-3 xl:order-none">
                    {activeRide ? (
                      <ActiveTripPanel
                        ride={activeRide}
                        tracking={tracking}
                        trackingError={trackingError}
                        online={online}
                        busy={busy}
                        verifyCode={verifyCode}
                        verificationError={verificationError}
                        onVerifyCode={(value) => {
                          setVerifyCode(value);
                          setVerificationError("");
                        }}
                        onSubmitVerification={() => void submitVerification()}
                        onAdvance={(status) => void advance(status)}
                        onRelease={() => void releaseRide()}
                        now={now}
                        onExpired={() => void loadBoard()}
                      />
                    ) : (
                      <section className="rounded-xl bg-white p-4 ring-1 ring-[#e6ece6]">
                        <div className="flex items-center gap-2">
                          <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#eaf5ec] text-[#0b5c33]">
                            <Car className="h-4 w-4" aria-hidden />
                          </span>
                          <div>
                            <h2 className="text-[13px] font-extrabold text-[#14241b]">No active trip</h2>
                            <p className="text-[10.5px] text-[#5d6d64]">
                              {online ? "Accept an open request below to start." : "Go online to see the passenger request queue."}
                            </p>
                          </div>
                        </div>
                        {online ? (
                          <OpenRequestList
                            rides={board.open}
                            busy={busy}
                            onAccept={(ride) => void acceptRide(ride)}
                          />
                        ) : (
                          <p className="mt-3 rounded-lg bg-[#f7f8f6] p-3 text-[11px] leading-5 text-[#5d6d64]">
                            The request queue is hidden while you are offline. Approved drivers can go
                            online with a fresh Lagos location.
                          </p>
                        )}
                      </section>
                    )}

                    <section className="rounded-xl bg-white p-3 ring-1 ring-[#e6ece6]">
                      <div className="flex items-center gap-2">
                        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#fff3e8] text-[#a3480f]">
                          <CircleHelp className="h-4 w-4" aria-hidden />
                        </span>
                        <div>
                          <p className="text-[12px] font-extrabold">Need assistance?</p>
                          <p className="text-[10.5px] text-[#5d6d64]">Driver support and trip help.</p>
                        </div>
                      </div>
                      <Link href="/naijadrive/help#support" className={`mt-2 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-[#dfe7df] text-[11px] font-bold text-[#0b5c33] ${focus}`}>
                        Contact driver support <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    </section>
                  </div>
                </div>
              </>
            ) : null}

            {tab === "trips" ? (
              <div className="mt-3 grid gap-3 xl:grid-cols-[1.2fr_1fr]">
                <div className="space-y-3">
                  {activeRide ? (
                    <ActiveTripPanel
                      ride={activeRide}
                      tracking={tracking}
                      trackingError={trackingError}
                      online={online}
                      busy={busy}
                      verifyCode={verifyCode}
                      verificationError={verificationError}
                      onVerifyCode={(value) => {
                        setVerifyCode(value);
                        setVerificationError("");
                      }}
                      onSubmitVerification={() => void submitVerification()}
                      onAdvance={(status) => void advance(status)}
                      onRelease={() => void releaseRide()}
                      now={now}
                      onExpired={() => void loadBoard()}
                    />
                  ) : (
                    <p className="rounded-xl bg-white p-4 text-[12px] text-[#5d6d64] ring-1 ring-[#e6ece6]">
                      No active trip. Open requests appear below while you are online.
                    </p>
                  )}
                  <OpenRequestsCard rides={board.open} online={online} busy={busy} onAccept={(ride) => void acceptRide(ride)} />
                </div>
                <RecentTrips rides={board.recent} busy={busy} onCash={(ride) => void recordCash(ride)} />
              </div>
            ) : null}

            {tab === "earnings" ? (
              <div className="mt-3 space-y-3">
                <EarningsBreakdown summary={board.summary} presence={board.presence} />
                <RecentTrips
                  rides={board.recent.filter((ride) => ride.status === "completed")}
                  busy={busy}
                  onCash={(ride) => void recordCash(ride)}
                />
              </div>
            ) : null}

            {tab === "wallet" ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Metric
                  label="Available balance"
                  value={board.summary.walletAvailableKobo === null ? "No DRIVER wallet" : money(board.summary.walletAvailableKobo)}
                  note="From the wallet with ownerType DRIVER for this account."
                />
                <Metric
                  label="Held balance"
                  value={board.summary.walletHeldKobo === null ? "No DRIVER wallet" : money(board.summary.walletHeldKobo)}
                  note="Held funds, if any, are read from the same driver wallet."
                />
                <section className="rounded-xl bg-white p-4 ring-1 ring-[#e6ece6] sm:col-span-2">
                  <h2 className="text-[14px] font-extrabold">Payouts</h2>
                  <p className="mt-1 text-[11.5px] leading-6 text-[#5d6d64]">
                    Payout requests and settlement schedules are not configured in this build. The wallet
                    balance is real ledger data; it is not a promise that a payout can be requested yet.
                  </p>
                  <Link href="/wallet" className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[#0b5c33] px-3 text-[11px] font-bold text-white">
                    Open NaijaPay wallet <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </section>
              </div>
            ) : null}

            {tab === "vehicle" ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <section className="rounded-xl bg-white p-4 ring-1 ring-[#e6ece6]">
                  <h2 className="text-[14px] font-extrabold">Approved vehicle</h2>
                  <dl className="mt-2 space-y-1.5 text-[11.5px]">
                    <Row label="Make and model" value={`${board.driver.vehicleMake} ${board.driver.vehicleModel}`} />
                    <Row label="Plate" value={board.driver.vehiclePlate} />
                    <Row label="Class" value={vehicle?.label ?? board.driver.vehicleClass} />
                    <Row label="Approval" value={board.driver.status} />
                    <Row label="Service zone" value={board.driver.serviceZone || DRIVE_CITY} />
                  </dl>
                </section>
                <section className="rounded-xl bg-white p-4 ring-1 ring-[#e6ece6]">
                  <h2 className="text-[14px] font-extrabold">Documents and eligibility</h2>
                  <dl className="mt-2 space-y-1.5 text-[11.5px]">
                    <Row label="Licence number on file" value={board.driver.licenseNumber ? `Ending ${board.driver.licenseNumber.slice(-4)}` : "Not recorded"} />
                    <Row label="Passenger rides" value={board.driver.status === "approved" ? "Eligible" : "Not eligible"} />
                    <Row label="Food delivery" value={board.driver.foodDeliveryEnabled ? "Enabled (separate approval)" : "Not enabled"} />
                    <Row label="Food vehicle" value={board.driver.foodVehicleType} />
                    <Row label="Insulated bag" value={board.driver.insulatedBag ? "Recorded" : "Not recorded"} />
                  </dl>
                  <p className="mt-2 text-[10.5px] leading-5 text-[#5d6d64]">
                    Document expiry dates and document uploads are not stored by the current schema, so
                    no expiry or verification badge is invented here.
                  </p>
                </section>
              </div>
            ) : null}

            {tab === "support" ? (
              <div className="mt-3 space-y-3">
                <PartnerNotifications />
                <section className="rounded-xl bg-white p-4 ring-1 ring-[#e6ece6]">
                  <h2 className="text-[14px] font-extrabold">Driver help</h2>
                  <p className="mt-1 text-[11.5px] leading-6 text-[#5d6d64]">
                    The help centre explains online presence, location limits, verification and payment
                    behaviour in this build. Support channels are listed only where they actually operate.
                  </p>
                  <Link href="/naijadrive/help#drivers" className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[#0b5c33] px-3 text-[11px] font-bold text-white">
                    Open driver help <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </section>
              </div>
            ) : null}

            {tab === "settings" ? (
              <div className="mt-3 space-y-3">
                <section className="rounded-xl bg-white p-4 ring-1 ring-[#e6ece6]">
                  <h2 className="text-[14px] font-extrabold">Account and service</h2>
                  <dl className="mt-2 space-y-1.5 text-[11.5px]">
                    <Row label="Account" value={userName} />
                    <Row label="Partner type" value="NaijaDeals shared partner account" />
                    <Row label="Passenger rides" value={board.driver.status === "approved" ? "Approved" : board.driver.status} />
                    <Row label="Food/parcel work" value={board.driver.foodDeliveryEnabled ? "Enabled separately" : "Not enabled"} />
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href="/account" className="inline-flex min-h-10 items-center rounded-lg bg-[#0b5c33] px-3 text-[11px] font-bold text-white">
                      Manage account
                    </Link>
                    <Link href="/naijasend/driver/jobs" className="inline-flex min-h-10 items-center rounded-lg border border-[#dfe7df] px-3 text-[11px] font-bold text-[#0b5c33]">
                      Switch to parcel work
                    </Link>
                    <button type="button" onClick={() => void doSignOut()} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[#ef4444]/25 bg-[#fee2e2] px-3 text-[11px] font-bold text-[#b91c1c]">
                      <LogOut className="h-3.5 w-3.5" aria-hidden /> Log out
                    </button>
                  </div>
                </section>
                <section className="rounded-xl bg-white p-4 ring-1 ring-[#e6ece6]">
                  <h2 className="text-[14px] font-extrabold">Location permission</h2>
                  <p className="mt-1 text-[11.5px] leading-6 text-[#5d6d64]">
                    Status: <strong className="text-[#14241b]">{location.status}</strong>.
                    {location.message ? ` ${location.message}` : " The browser manages this permission; this page cannot grant it."}
                  </p>
                  <button
                    type="button"
                    onClick={() => void location.requestOnce()}
                    className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[#dfe7df] px-3 text-[11px] font-bold text-[#0b5c33]"
                  >
                    <LocateFixed className="h-3.5 w-3.5" aria-hidden /> Request location again
                  </button>
                </section>
              </div>
            ) : null}
          </main>
        </div>
      </div>

      {mobileNav ? (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Driver navigation">
          <button type="button" aria-label="Close menu" onClick={() => setMobileNav(false)} className="absolute inset-0 bg-black/50" />
          <div className="relative h-full w-[84%] max-w-[300px] overflow-y-auto bg-white">
            <div className="flex justify-end p-2">
              <button type="button" onClick={() => setMobileNav(false)} aria-label="Close menu" className="grid h-10 w-10 place-items-center rounded-lg text-[#33443a]">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            {sidebar}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  note,
  tone = "default"
}: {
  label: string;
  value: string;
  note: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-[#e6ece6]">
      <p className="text-[10px] font-black uppercase tracking-wide text-[#5d6d64]">{label}</p>
      <p className={`mt-1 font-display text-[22px] font-extrabold ${tone === "warn" ? "text-[#a3480f]" : "text-[#14241b]"}`}>{value}</p>
      <p className="mt-0.5 text-[10.5px] leading-5 text-[#5d6d64]">{note}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-[#5d6d64]">{label}</dt>
      <dd className="max-w-[62%] break-words text-right font-semibold text-[#14241b]">{value}</dd>
    </div>
  );
}

function OpenRequestList({
  rides,
  busy,
  onAccept
}: {
  rides: DriverBoardRide[];
  busy: string;
  onAccept: (ride: DriverBoardRide) => void;
}) {
  if (rides.length === 0) {
    return (
      <p className="mt-3 rounded-lg bg-[#f7f8f6] p-3 text-[11px] leading-5 text-[#5d6d64]">
        No open requests right now. The board refreshes every 12 seconds.
      </p>
    );
  }
  return (
    <ul className="mt-2 space-y-2">
      {rides.slice(0, 4).map((ride) => (
        <li key={ride.id} className="rounded-lg bg-[#f7f8f6] p-2.5">
          <p className="text-[11.5px] font-extrabold text-[#14241b]">
            {ride.pickupLabel} → {ride.dropoffLabel}
          </p>
          <p className="mt-0.5 text-[10px] text-[#5d6d64]">
            {ride.rideNumber} · {(ride.distanceMeters / 1000).toFixed(1)} km · {ride.durationMinutes} min · opened{" "}
            {new Date(ride.requestedAt).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}
          </p>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="text-[11px] font-extrabold text-[#0b5c33]">{money(ride.fareKobo)}</span>
            <button
              type="button"
              onClick={() => onAccept(ride)}
              disabled={busy === `accept-${ride.id}`}
              className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-[#0b5c33] px-2.5 text-[10.5px] font-extrabold text-white disabled:opacity-50"
            >
              {busy === `accept-${ride.id}` ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Check className="h-3 w-3" aria-hidden />}
              Accept
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function OpenRequestsCard({
  rides,
  online,
  busy,
  onAccept
}: {
  rides: DriverBoardRide[];
  online: boolean;
  busy: string;
  onAccept: (ride: DriverBoardRide) => void;
}) {
  return (
    <section className="rounded-xl bg-white p-4 ring-1 ring-[#e6ece6]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-extrabold">Open requests</h2>
        <span className="rounded-full bg-[#f2f7f2] px-2 py-0.5 text-[10px] font-bold text-[#5d6d64]">{rides.length}</span>
      </div>
      {!online ? (
        <p className="mt-2 text-[11px] leading-5 text-[#5d6d64]">Go online to receive and accept requests.</p>
      ) : (
        <OpenRequestList rides={rides} busy={busy} onAccept={onAccept} />
      )}
      <p className="mt-2 text-[9.5px] leading-4 text-[#5d6d64]">
        Acceptance is atomic. The server rejects a second driver and prevents one driver holding two
        active trips. This build has no per-driver offer-expiry record; the open queue is the offer.
      </p>
    </section>
  );
}

function ActiveTripPanel({
  ride,
  tracking,
  trackingError,
  online,
  busy,
  verifyCode,
  verificationError,
  onVerifyCode,
  onSubmitVerification,
  onAdvance,
  onRelease,
  now,
  onExpired
}: {
  ride: DriverBoardRide;
  tracking: DriveTracking | null;
  trackingError: string;
  online: boolean;
  busy: string;
  verifyCode: string;
  verificationError: string;
  onVerifyCode: (value: string) => void;
  onSubmitVerification: () => void;
  onAdvance: (status: "driver_arriving" | "in_progress" | "completed") => void;
  onRelease: () => void;
  now: number;
  onExpired: () => void;
}) {
  const [expiryNotified, setExpiryNotified] = useState(false);
  const deadline = ride.assignmentExpiresAt ? new Date(ride.assignmentExpiresAt).getTime() : null;
  const remaining = deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
  const expired = remaining !== null && remaining <= 0;
  const verificationRequired = Boolean(ride.verification?.required);
  const verified = Boolean(ride.verification?.verified);
  const verificationExpired = Boolean(ride.verification?.expired);
  const verificationLocked = Boolean(ride.verification?.locked);
  const legacyVerification = Boolean(ride.verification?.legacy);
  const attemptsRemaining = ride.verification?.attemptsRemaining ?? 0;
  const verificationBlocked = verificationExpired || verificationLocked;
  const target =
    tracking?.target ??
    (ride.status === "in_progress"
      ? { label: ride.dropoffLabel, lat: ride.dropoffLat, lng: ride.dropoffLng }
      : { label: ride.pickupLabel, lat: ride.pickupLat, lng: ride.pickupLng });
  const canNavigate = Boolean(target?.lat && target?.lng);
  const navigationUrl = canNavigate
    ? `https://www.google.com/maps/dir/?api=1&destination=${target!.lat},${target!.lng}&travelmode=driving`
    : null;

  useEffect(() => {
    if (!expired || expiryNotified) return;
    setExpiryNotified(true);
    onExpired();
  }, [expired, expiryNotified, onExpired]);

  const nextAction =
    ride.status === "driver_assigned"
      ? { status: "driver_arriving" as const, label: "I have arrived at pick-up" }
      : ride.status === "driver_arriving"
        ? { status: "in_progress" as const, label: "Start trip" }
        : ride.status === "in_progress"
          ? { status: "completed" as const, label: "Arrived at destination · complete trip" }
          : null;

  return (
    <section aria-labelledby="driver-active-heading" className="rounded-xl bg-white p-4 ring-1 ring-[#e6ece6]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="inline-flex rounded-full bg-[#fff3e8] px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wide text-[#a3480f]">
            {statusLabel(ride.status)}
          </span>
          <h2 id="driver-active-heading" className="mt-1 text-[15px] font-extrabold text-[#14241b]">
            {ride.status === "in_progress" ? "Heading to destination" : ride.status === "driver_arriving" ? "At the pick-up" : "Heading to pick-up"}
          </h2>
          <p className="text-[10px] text-[#5d6d64]">{ride.rideNumber}</p>
        </div>
        <span className="shrink-0 text-[13px] font-extrabold text-[#0b5c33]">{money(ride.fareKobo)}</span>
      </div>

      <div className="mt-2 rounded-lg bg-[#f7f8f6] p-2.5">
        <p className="flex items-center gap-1.5 text-[11.5px] font-extrabold text-[#14241b]">
          <UserRound className="h-3.5 w-3.5 text-[#0b5c33]" aria-hidden />
          {ride.rider?.name ?? "Passenger"}
        </p>
        {ride.rider?.phone ? (
          <a href={`tel:${ride.rider.phone}`} className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-bold text-[#0b5c33] underline">
            <Phone className="h-3 w-3" aria-hidden /> Call passenger
          </a>
        ) : null}
        <div className="mt-1.5 space-y-1 text-[10.5px] leading-4 text-[#5d6d64]">
          <p className="flex items-start gap-1.5">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#0b5c33]" aria-hidden />
            Pick-up: {ride.pickupLabel}
          </p>
          <p className="flex items-start gap-1.5">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-[2px] bg-[#14241b]" aria-hidden />
            Drop-off: {ride.dropoffLabel}
          </p>
        </div>
        <p className="mt-1.5 text-[10px] text-[#5d6d64]">
          Payment: {ride.paymentMethod === "wallet" ? "NaijaPay" : "Cash"} ·{" "}
          {ride.paymentStatus === "paid" ? "paid" : ride.paymentStatus}
        </p>
        <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[#eaf5ec] px-2 py-0.5 text-[9.5px] font-bold text-[#0b5c33]">
          <Route className="h-3 w-3" aria-hidden /> Trip sharing active · passenger can follow this trip
        </p>
      </div>

      {trackingError ? (
        <p role="status" className="mt-2 rounded-lg bg-[#fff3e8] p-2 text-[10.5px] font-semibold text-[#a3480f]">
          {trackingError} The last known server state is shown; it is not presented as live.
        </p>
      ) : null}

      {remaining !== null ? (
        <p
          role="status"
          className={`mt-2 rounded-lg px-2 py-1.5 text-[10.5px] font-bold ${expired ? "bg-[#fee2e2] text-[#b91c1c]" : "bg-[#f2f7f2] text-[#5d6d64]"}`}
        >
          {expired
            ? "Assignment deadline passed. The ride returns to the open queue automatically; nothing extra is charged."
            : `Update this ride within ${formatDuration(remaining)} or it returns to the queue.`}
        </p>
      ) : null}

      {verificationRequired && !verified ? (
        <div className="mt-2 rounded-lg bg-[#fff3e8] p-2.5">
          <p className="text-[10.5px] font-extrabold text-[#a3480f]">Ask the passenger for their 4-digit pickup code</p>
          {verificationExpired ? (
            <p role="status" className="mt-1 rounded-lg bg-[#fee2e2] p-2 text-[10.5px] font-semibold leading-4 text-[#b91c1c]">
              This pickup code has expired. The rider can reset it from their trip screen, or support can
              reset it.
            </p>
          ) : verificationLocked ? (
            <p role="status" className="mt-1 rounded-lg bg-[#fee2e2] p-2 text-[10.5px] font-semibold leading-4 text-[#b91c1c]">
              The pickup code is locked after too many incorrect attempts. The rider or support must reset
              it before this trip can start.
            </p>
          ) : (
            <p className="mt-0.5 text-[10px] leading-4 text-[#7a5a35]">
              {attemptsRemaining} attempt{attemptsRemaining === 1 ? "" : "s"} left. The server refuses the start
              until the code is correct.
            </p>
          )}
          <div className="mt-1 flex gap-1.5">
            <label htmlFor="passenger-code" className="sr-only">
              Passenger 4-digit pickup code
            </label>
            <input
              id="passenger-code"
              value={verifyCode}
              onChange={(event) => onVerifyCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="1234"
              disabled={verificationBlocked}
              aria-invalid={Boolean(verificationError)}
              aria-describedby={verificationError ? "passenger-code-error" : undefined}
              className="min-h-9 w-24 rounded-lg border border-[#e2cfae] bg-white px-2 text-center font-display text-[14px] font-extrabold tracking-[0.2em] disabled:opacity-50"
            />
            <button
              type="button"
              onClick={onSubmitVerification}
              disabled={verificationBlocked || busy === `verify-${ride.id}` || verifyCode.length !== 4}
              className="inline-flex min-h-9 items-center rounded-lg bg-[#0b5c33] px-3 text-[11px] font-extrabold text-white disabled:opacity-50"
            >
              {busy === `verify-${ride.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : "Verify passenger"}
            </button>
          </div>
          {verificationError ? (
            <p id="passenger-code-error" role="alert" className="mt-1 text-[10.5px] font-bold text-[#b91c1c]">
              {verificationError}
            </p>
          ) : null}
        </div>
      ) : legacyVerification ? (
        <p className="mt-2 rounded-lg bg-[#f2f7f2] p-2 text-[10.5px] leading-4 text-[#5d6d64]">
          This trip was matched before protected pickup verification was introduced, so there is no code
          to enter. Starting it is allowed and the legacy exception is written to the trip audit trail.
        </p>
      ) : ride.status === "driver_arriving" ? (
        <p className="mt-2 rounded-lg bg-[#f2f7f2] p-2 text-[10.5px] leading-4 text-[#5d6d64]">
          {verified
            ? "Passenger verified by the server. Start the trip when they are in the car."
            : "No active pickup-code record is available for this ride. Refresh; the server will not start the trip without verification."}
        </p>
      ) : null}

      <div className="mt-2 grid gap-1.5">
        {nextAction ? (
          <button
            type="button"
            onClick={() => onAdvance(nextAction.status)}
            disabled={
              busy === `status-${nextAction.status}` ||
              (nextAction.status === "in_progress" && verificationRequired && !verified)
            }
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-[#16a34a] px-3 text-[11.5px] font-extrabold text-white hover:bg-[#128a3f] disabled:opacity-50"
          >
            {busy === `status-${nextAction.status}` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
            {nextAction.label}
          </button>
        ) : null}
        {navigationUrl ? (
          <a
            href={navigationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-[#0b5c33] px-3 text-[11px] font-extrabold text-white"
          >
            <Navigation className="h-3.5 w-3.5" aria-hidden />
            Open navigation (external · Google Maps)
          </a>
        ) : (
          <p className="rounded-lg bg-[#f7f8f6] px-2 py-1.5 text-[10px] text-[#5d6d64]">
            External navigation is available once the server has confirmed both ends of this trip.
          </p>
        )}
        {ride.status !== "in_progress" ? (
          <button
            type="button"
            onClick={onRelease}
            disabled={busy === `release-${ride.id}`}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-[#dfe7df] px-3 text-[10.5px] font-bold text-[#5d6d64] disabled:opacity-50"
          >
            {busy === `release-${ride.id}` ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
            Release ride
          </button>
        ) : null}
      </div>

      <TripProgress ride={ride} />
      <p className="mt-2 flex items-start gap-1.5 text-[9.5px] leading-4 text-[#5d6d64]">
        <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
        {online
          ? "Online location is shared only while this workspace is open. A browser cannot guarantee updates when the screen locks or the app closes."
          : "You are offline with an active trip: no new requests will arrive, but this trip's tracking continues while the workspace is open."}
      </p>
    </section>
  );
}

function TripProgress({ ride }: { ride: DriverBoardRide }) {
  const steps = [
    { label: "Accepted", done: Boolean(ride.acceptedAt) },
    { label: "Arrived", done: Boolean(ride.arrivedAt) },
    { label: "On trip", done: Boolean(ride.startedAt) },
    { label: "Completed", done: Boolean(ride.completedAt) }
  ];
  return (
    <ol className="mt-3 flex items-start justify-between gap-1" aria-label="Trip progress">
      {steps.map((step, index) => (
        <li key={step.label} className="flex min-w-0 flex-1 flex-col items-center text-center">
          <span className={`grid h-6 w-6 place-items-center rounded-full text-[9px] font-black ${step.done ? "bg-[#0b5c33] text-white" : "bg-[#eef1ef] text-[#5d6d64]"}`}>
            {step.done ? <Check className="h-3 w-3" aria-hidden /> : index + 1}
          </span>
          <span className={`mt-1 text-[9.5px] font-bold ${step.done ? "text-[#14241b]" : "text-[#5d6d64]"}`}>{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

function RecentTrips({
  rides,
  busy,
  onCash
}: {
  rides: DriverBoardRide[];
  busy: string;
  onCash: (ride: DriverBoardRide) => void;
}) {
  // Only the most recent completed trip offers the driver rating form; older
  // trips remain readable without a burst of per-row rating requests.
  const latestCompletedId = rides.find((ride) => ride.status === "completed")?.id;
  return (
    <section className="rounded-xl bg-white p-4 ring-1 ring-[#e6ece6]">
      <h2 className="text-[13px] font-extrabold">Recent trips</h2>
      {rides.length === 0 ? (
        <p className="mt-2 text-[11px] leading-5 text-[#5d6d64]">
          Completed and cancelled trips appear here with their payment state.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-[#eef1ef]">
          {rides.slice(0, 12).map((ride) => (
            <li key={ride.id} className="py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[11.5px] font-bold text-[#14241b]">
                    {ride.pickupLabel} → {ride.dropoffLabel}
                  </p>
                  <p className="text-[10px] text-[#5d6d64]">
                    {ride.rideNumber} · {statusLabel(ride.status)} ·{" "}
                    {new Date(ride.completedAt ?? ride.requestedAt).toLocaleDateString("en-NG")}
                  </p>
                </div>
                <span className="shrink-0 text-[11.5px] font-extrabold text-[#0b5c33]">{money(ride.fareKobo)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[9.5px] text-[#5d6d64]">
                <span>{ride.paymentMethod === "wallet" ? "NaijaPay" : "Cash"}</span>
                <span>·</span>
                <span>{ride.paymentStatus}</span>
                {ride.paymentMethod === "cash" && ride.status === "completed" && ride.paymentStatus === "pending" ? (
                  <button
                    type="button"
                    onClick={() => onCash(ride)}
                    disabled={busy === `cash-${ride.id}`}
                    className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-lg bg-[#0b5c33] px-2 text-[9.5px] font-bold text-white disabled:opacity-50"
                  >
                    {busy === `cash-${ride.id}` ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Banknote className="h-3 w-3" aria-hidden />}
                    Record cash
                  </button>
                ) : null}
              </div>
              {ride.id === latestCompletedId ? <RideRatingPanel rideId={ride.id} role="driver" compact /> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
