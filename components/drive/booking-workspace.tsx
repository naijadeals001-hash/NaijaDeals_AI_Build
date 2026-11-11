"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Banknote,
  Bike,
  Car,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Phone,
  Plane,
  ReceiptText,
  RefreshCw,
  Share2,
  ShieldCheck,
  Users,
  Wallet,
  XCircle
} from "lucide-react";
import { ApiRequestError, apiClient, koboToNaira, type ApiMoney } from "@/lib/api-client";
import {
  findPlace,
  findVehicleClass,
  type VehicleClassId
} from "@/lib/config/drive";
import { SavedPlaces } from "@/components/functional/saved-places";
import { TripMap } from "./trip-map";
import {
  getAllQuotes,
  getPublicRoute,
  getRideVerification,
  getTracking
} from "./api";
import type { ApiDriveQuote, ApiRide, DrivePublicRoute, DriveTracking, RideVerification } from "./types";

const activeStatuses = ["requested", "driver_assigned", "driver_arriving", "in_progress"];
const money = (value: ApiMoney, currency = "NGN") => koboToNaira(value, currency);

function isActive(ride: ApiRide) {
  return activeStatuses.includes(ride.status);
}

function statusText(status: string) {
  return status.replaceAll("_", " ");
}

function formatMinutes(minutes: number) {
  if (!Number.isFinite(minutes)) return "—";
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr ${Math.round(minutes % 60)} min`;
}

const vehicleCopy: Record<
  VehicleClassId,
  { mockupTitle: string; image: string; icon: typeof Car; badge?: string }
> = {
  bike: {
    mockupTitle: "Bike",
    image: "/brand-photography/drive-sedan-lagos.jpg",
    icon: Bike
  },
  economy: {
    mockupTitle: "Standard",
    image: "/brand-photography/drive-sedan-lagos.jpg",
    icon: Car,
    badge: "Economy"
  },
  comfort: {
    mockupTitle: "Comfort",
    image: "/brand-photography/drive-sedan-lagos.jpg",
    icon: Car
  },
  xl: {
    mockupTitle: "XL",
    image: "/brand-photography/drive-suv-lagos.jpg",
    icon: Users
  }
};

export function BookingWorkspace({
  viewer,
  pickup,
  dropoff,
  vehicleClass,
  onSelectVehicle
}: {
  viewer: { name: string; isDriver: boolean } | null;
  pickup: string;
  dropoff: string;
  vehicleClass: VehicleClassId;
  onSelectVehicle: (vehicle: VehicleClassId) => void;
}) {
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "wallet">("cash");
  const [quotes, setQuotes] = useState<ApiDriveQuote[]>([]);
  const [quotesState, setQuotesState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [quotesError, setQuotesError] = useState("");
  const [publicRoute, setPublicRoute] = useState<DrivePublicRoute | null>(null);
  const [routeState, setRouteState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [rides, setRides] = useState<ApiRide[]>([]);
  const [ridesState, setRidesState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [ridesError, setRidesError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [verification, setVerification] = useState<RideVerification | null>(null);

  const pickupPlace = useMemo(() => findPlace(pickup), [pickup]);
  const dropoffPlace = useMemo(() => findPlace(dropoff), [dropoff]);
  const selectedQuote = useMemo(
    () => quotes.find((quote) => quote.vehicleClass.id === vehicleClass) ?? null,
    [quotes, vehicleClass]
  );
  const activeRide = useMemo(() => rides.find(isActive) ?? null, [rides]);
  const completedRide = useMemo(() => rides.find((ride) => ride.status === "completed") ?? null, [rides]);

  const loadQuotes = useCallback(async () => {
    if (!pickup || !dropoff || pickup === dropoff) {
      setQuotes([]);
      setQuotesState("error");
      setQuotesError("Pick-up and drop-off must be different places.");
      return;
    }
    setQuotesState("loading");
    setQuotesError("");
    try {
      const result = await getAllQuotes(pickup, dropoff);
      setQuotes(result);
      setQuotesState("ready");
    } catch (caught) {
      setQuotesState("error");
      setQuotesError(caught instanceof Error ? caught.message : "Unable to calculate fares.");
    }
  }, [dropoff, pickup]);

  useEffect(() => {
    void loadQuotes();
  }, [loadQuotes]);

  useEffect(() => {
    if (!pickup || !dropoff || pickup === dropoff) {
      setPublicRoute(null);
      setRouteState("idle");
      return;
    }
    let cancelled = false;
    setRouteState("loading");
    getPublicRoute(pickup, dropoff)
      .then((result) => {
        if (cancelled) return;
        setPublicRoute(result);
        setRouteState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setPublicRoute(null);
        setRouteState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [pickup, dropoff]);

  const loadRides = useCallback(async () => {
    if (!viewer) {
      setRides([]);
      setRidesState("idle");
      return;
    }
    try {
      const result = await apiClient.driveRides();
      setRides(result);
      setRidesState("ready");
      setRidesError("");
    } catch (caught) {
      setRidesState("error");
      setRidesError(caught instanceof Error ? caught.message : "Unable to load your rides.");
    }
  }, [viewer]);

  useEffect(() => {
    void loadRides();
  }, [loadRides]);

  useEffect(() => {
    if (!activeRide) return;
    const timer = window.setInterval(() => void loadRides(), 10_000);
    return () => window.clearInterval(timer);
  }, [activeRide, loadRides]);

  // Ask the server for the rider's verification code as soon as a trip is assigned.
  // Fetching it is what makes the code mandatory on the driver side; a rider who
  // never opens this screen keeps the legacy flow.
  useEffect(() => {
    if (!activeRide || activeRide.status === "requested" || !viewer) {
      setVerification(null);
      return;
    }
    let cancelled = false;
    getRideVerification(activeRide.id)
      .then((result) => {
        if (!cancelled) setVerification(result);
      })
      .catch(() => {
        if (!cancelled) setVerification(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeRide?.id, activeRide?.status, viewer]);

  async function requestRide() {
    setBusy("request");
    setError("");
    setNotice("");
    try {
      const ride = await apiClient.driveRequestRide({
        pickupId: pickup,
        dropoffId: dropoff,
        vehicleClass,
        paymentMethod
      });
      setRides((current) => [ride, ...current]);
      setNotice(`Ride ${ride.rideNumber} requested. It is now in the server queue for approved drivers.`);
      requestAnimationFrame(() => {
        document.getElementById("active-trip")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (caught) {
      if (caught instanceof ApiRequestError) setError(caught.message);
      else setError(caught instanceof Error ? caught.message : "Unable to request this ride.");
    } finally {
      setBusy("");
    }
  }

  async function cancelRide(ride: ApiRide) {
    setBusy(`cancel-${ride.id}`);
    setError("");
    setNotice("");
    try {
      const updated = await apiClient.driveCancelRide(ride.id, "Rider cancelled from NaijaDrive.");
      setRides((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setNotice(
        updated.paymentStatus === "refunded"
          ? "Ride cancelled. The NaijaPay fare hold was returned to your wallet."
          : "Ride cancelled. No fare was charged."
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to cancel this ride.");
    } finally {
      setBusy("");
    }
  }

  async function refreshAll() {
    setBusy("refresh");
    await Promise.all([loadQuotes(), loadRides()]);
    setBusy("");
  }

  const canCancel = activeRide ? ["requested", "driver_assigned", "driver_arriving"].includes(activeRide.status) : false;

  return (
    <div className="space-y-6">
      <section id="ride-options" className="scroll-mt-24">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#0b5c33]">Ride options</p>
            <h2 className="mt-1 font-display text-[26px] font-extrabold leading-tight text-[#14241b] sm:text-[30px]">
              A ride for every kind of day
            </h2>
            <p className="mt-1 max-w-2xl text-[13px] leading-6 text-[#5d6d64]">
              Prices below are server quotes for this exact pick-up and destination. A quote becomes a
              locked fare only when you request the ride.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshAll()}
            disabled={busy === "refresh"}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#dfe7df] bg-white px-3 text-[12px] font-bold text-[#33443a] hover:border-[#0b5c33]/40 hover:text-[#0b5c33] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy === "refresh" ? "animate-spin" : ""}`} aria-hidden />
            Refresh quote
          </button>
        </div>

        {quotesState === "loading" ? (
          <p className="mt-5 flex items-center gap-2 text-[13px] font-semibold text-[#5d6d64]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Calculating real fares…
          </p>
        ) : quotesState === "error" ? (
          <p role="alert" className="mt-5 flex items-start gap-2 rounded-xl bg-[#fff3e8] p-3 text-[12.5px] font-semibold text-[#a3480f]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {quotesError}
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {(["economy", "comfort", "xl"] as VehicleClassId[]).map((id) => {
              const vehicle = findVehicleClass(id)!;
              const quote = quotes.find((row) => row.vehicleClass.id === id);
              const copy = vehicleCopy[id];
              const Icon = copy.icon;
              const selected = vehicleClass === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelectVehicle(id)}
                  className={`group relative overflow-hidden rounded-2xl border bg-white p-3 text-left transition ${
                    selected ? "border-[#0b5c33] ring-2 ring-[#0b5c33]/20" : "border-[#e2e6e3] hover:border-[#0b5c33]/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[15px] font-extrabold text-[#14241b]">{copy.mockupTitle}</p>
                      {copy.badge ? <p className="text-[10px] font-bold uppercase tracking-wide text-[#5d6d64]">{copy.badge} class</p> : null}
                    </div>
                    <span className={`grid h-8 w-8 place-items-center rounded-full ${selected ? "bg-[#0b5c33] text-white" : "bg-[#f2f7f2] text-[#0b5c33]"}`}>
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                  </div>
                  <p className="mt-1 min-h-8 text-[11px] leading-4 text-[#5d6d64]">{vehicle.description}</p>
                  <img
                    src={copy.image}
                    alt={`${vehicle.label} car in NaijaDrive brand livery (brand illustration)`}
                    width={520}
                    height={220}
                    className="mt-2 h-[86px] w-full rounded-lg object-cover object-[60%_60%]"
                    loading="lazy"
                  />
                  <div className="mt-2 flex items-end justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#5d6d64]">{vehicle.seats} seats</p>
                      <p className="text-[15px] font-extrabold text-[#0b5c33]">{quote ? money(quote.fareKobo, quote.currency) : "—"}</p>
                    </div>
                    <span className={`text-[10.5px] font-extrabold ${selected ? "text-[#0b5c33]" : "text-[#5d6d64]"}`}>
                      {selected ? "Selected" : "Choose"}
                    </span>
                  </div>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                onSelectVehicle("economy");
                document.getElementById("airport")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="group relative overflow-hidden rounded-2xl border border-[#e2e6e3] bg-[#f7f3e8] p-3 text-left transition hover:border-[#0b5c33]/40"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[15px] font-extrabold text-[#14241b]">Airport</p>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#8a6d1f]">Journey type</p>
                </div>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-[#0b5c33]">
                  <Plane className="h-4 w-4" aria-hidden />
                </span>
              </div>
              <p className="mt-1 min-h-8 text-[11px] leading-4 text-[#5d6d64]">
                A ride to or from Murtala Muhammed Airport. It is not a separate vehicle class; you still
                pick Standard, Comfort, XL or Bike.
              </p>
              <img
                src="/brand-photography/drive-suv-lagos.jpg"
                alt="NaijaDrive SUV in Lagos (brand illustration) for airport journeys"
                width={520}
                height={220}
                className="mt-2 h-[86px] w-full rounded-lg object-cover object-[60%_60%]"
                loading="lazy"
              />
              <div className="mt-2 flex items-end justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#8a6d1f]">Airport landmark</p>
                <span className="text-[10.5px] font-extrabold text-[#0b5c33]">Plan ride</span>
              </div>
            </button>
          </div>
        )}

        {/* Bike is a real class and remains bookable without pretending the mockup has five cards. */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f2f7f2] px-3 py-2">
          <p className="flex items-center gap-2 text-[11.5px] font-semibold text-[#33443a]">
            <Bike className="h-4 w-4 text-[#0b5c33]" aria-hidden />
            Bike is also available for one rider.
            {quotes.find((row) => row.vehicleClass.id === "bike") ? (
              <span className="font-extrabold text-[#0b5c33]">
                {money(quotes.find((row) => row.vehicleClass.id === "bike")!.fareKobo)}
              </span>
            ) : null}
          </p>
          <button
            type="button"
            onClick={() => onSelectVehicle("bike")}
            aria-pressed={vehicleClass === "bike"}
            className={`inline-flex min-h-9 items-center rounded-full border px-3 text-[11px] font-extrabold ${
              vehicleClass === "bike"
                ? "border-[#0b5c33] bg-[#0b5c33] text-white"
                : "border-[#0b5c33]/30 bg-white text-[#0b5c33]"
            }`}
          >
            {vehicleClass === "bike" ? "Bike selected" : "Choose bike"}
          </button>
        </div>
      </section>

      {notice ? (
        <div role="status" className="rounded-xl bg-[#eaf5ec] p-3 text-[12.5px] font-bold text-[#0b5c33]">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-[#ef4444]/25 bg-[#fee2e2] p-3 text-[12.5px] font-bold text-[#b91c1c]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="min-w-0 space-y-3">
          <TripMap
            pickup={pickupPlace ? { lat: pickupPlace.lat, lng: pickupPlace.lng, label: pickupPlace.label } : null}
            dropoff={dropoffPlace ? { lat: dropoffPlace.lat, lng: dropoffPlace.lng, label: dropoffPlace.label } : null}
            route={publicRoute?.route?.geometry ?? null}
            routeUnavailable={routeState === "error" || (routeState === "ready" && !publicRoute?.route)}
            title="Your road route"
            caption={
              publicRoute?.route
                ? `OSRM driving route · ${(publicRoute.route.distanceMeters / 1000).toFixed(1)} km · ${formatMinutes(publicRoute.route.durationSeconds / 60)}`
                : "Pick-up and drop-off landmarks"
            }
            heightClass="h-[280px] sm:h-[360px]"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-[#e2e6e3] bg-white p-3">
              <p className="text-[10px] font-black uppercase tracking-wide text-[#5d6d64]">Route distance</p>
              <p className="mt-1 text-[14px] font-extrabold text-[#14241b]">
                {publicRoute?.route ? `${(publicRoute.route.distanceMeters / 1000).toFixed(1)} km` : "Not available"}
              </p>
              <p className="mt-0.5 text-[10.5px] text-[#5d6d64]">Road distance from OSRM, not a straight line.</p>
            </div>
            <div className="rounded-xl border border-[#e2e6e3] bg-white p-3">
              <p className="text-[10px] font-black uppercase tracking-wide text-[#5d6d64]">Estimated drive time</p>
              <p className="mt-1 text-[14px] font-extrabold text-[#14241b]">
                {publicRoute?.route ? formatMinutes(publicRoute.route.durationSeconds / 60) : "Not available"}
              </p>
              <p className="mt-0.5 text-[10.5px] text-[#5d6d64]">No traffic adjustment is added by this build.</p>
            </div>
          </div>
        </div>

        <section aria-labelledby="book-heading" id="book" className="scroll-mt-24 rounded-2xl border border-[#e2e6e3] bg-white p-4 sm:p-5">
          <h2 id="book-heading" className="font-display text-[20px] font-extrabold text-[#14241b]">
            Review and book
          </h2>
          <p className="mt-1 text-[12px] leading-5 text-[#5d6d64]">
            The server re-checks the route, vehicle and fare when you request. Quotes are estimates; the
            fare is locked at request.
          </p>

          <div className="mt-3 rounded-xl bg-[#f7f8f6] p-3">
            <p className="text-[10px] font-black uppercase tracking-wide text-[#5d6d64]">Your route</p>
            <div className="mt-1 flex items-center gap-2 text-[12.5px] font-bold text-[#14241b]">
              <span className="h-2.5 w-2.5 rounded-full bg-[#0b5c33]" aria-hidden />
              <span className="min-w-0 truncate">{pickupPlace?.label ?? "Choose pick-up"}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[12.5px] font-bold text-[#14241b]">
              <span className="h-2.5 w-2.5 rounded-[2px] bg-[#14241b]" aria-hidden />
              <span className="min-w-0 truncate">{dropoffPlace?.label ?? "Choose destination"}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-[#e6ece6] pt-2">
              <span className="text-[11px] text-[#5d6d64]">{findVehicleClass(vehicleClass)?.label ?? "Vehicle"}</span>
              <span className="font-display text-[20px] font-extrabold text-[#0b5c33]">
                {selectedQuote ? money(selectedQuote.fareKobo, selectedQuote.currency) : "—"}
              </span>
            </div>
            {selectedQuote ? (
              <p className="text-right text-[10.5px] text-[#5d6d64]">
                {selectedQuote.vehicleClass.seats} seats · about {formatMinutes(selectedQuote.durationMinutes)}
              </p>
            ) : null}
          </div>

          <fieldset className="mt-3">
            <legend className="text-[10px] font-black uppercase tracking-wide text-[#5d6d64]">Payment</legend>
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
              <label
                className={`flex cursor-pointer items-start gap-2 rounded-xl border p-2.5 ${
                  paymentMethod === "cash" ? "border-[#0b5c33] bg-[#eaf5ec]" : "border-[#e2e6e3] bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="payment-method"
                  value="cash"
                  checked={paymentMethod === "cash"}
                  onChange={() => setPaymentMethod("cash")}
                  className="sr-only"
                />
                <Banknote className="mt-0.5 h-4 w-4 shrink-0 text-[#0b5c33]" aria-hidden />
                <span>
                  <span className="block text-[12px] font-extrabold text-[#14241b]">Cash to driver</span>
                  <span className="mt-0.5 block text-[10.5px] leading-4 text-[#5d6d64]">
                    Receipt stays cash due until the driver records collection.
                  </span>
                </span>
              </label>
              <label
                className={`flex cursor-pointer items-start gap-2 rounded-xl border p-2.5 ${
                  paymentMethod === "wallet" ? "border-[#0b5c33] bg-[#eaf5ec]" : "border-[#e2e6e3] bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="payment-method"
                  value="wallet"
                  checked={paymentMethod === "wallet"}
                  onChange={() => setPaymentMethod("wallet")}
                  className="sr-only"
                />
                <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-[#0b5c33]" aria-hidden />
                <span>
                  <span className="block text-[12px] font-extrabold text-[#14241b]">NaijaPay wallet</span>
                  <span className="mt-0.5 block text-[10.5px] leading-4 text-[#5d6d64]">
                    Fare held at request, released to the driver on completion.{" "}
                    <Link href="/wallet" className="font-bold text-[#0b5c33] underline">
                      Top up
                    </Link>
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          {viewer ? (
            <button
              type="button"
              onClick={requestRide}
              disabled={
                Boolean(activeRide) ||
                !selectedQuote ||
                quotesState !== "ready" ||
                busy === "request" ||
                pickup === dropoff
              }
              className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#16a34a] px-4 text-[13px] font-extrabold text-white transition hover:bg-[#128a3f] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === "request" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Car className="h-4 w-4" aria-hidden />}
              {activeRide ? "Finish or cancel your active ride first" : "Request ride"}
            </button>
          ) : (
            <Link
              href={`/login?next=${encodeURIComponent(`/naijadrive?pickup=${pickup}&dropoff=${dropoff}&class=${vehicleClass}`)}`}
              className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0b5c33] px-4 text-[13px] font-extrabold text-white transition hover:bg-[#0a4a29]"
            >
              <Car className="h-4 w-4" aria-hidden />
              Sign in to request
            </Link>
          )}
          {!viewer ? (
            <p className="mt-1.5 text-center text-[10.5px] text-[#5d6d64]">
              Your pick-up, destination and class are kept when you sign in.
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => setShowBreakdown((value) => !value)}
            aria-expanded={showBreakdown}
            className="mt-2 flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1.5 text-left text-[11px] font-bold text-[#0b5c33]"
          >
            How this fare is built
            <ChevronDown className={`h-3.5 w-3.5 transition ${showBreakdown ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {showBreakdown && selectedQuote?.breakdown ? (
            <dl className="mt-1 space-y-1.5 rounded-xl bg-[#f7f8f6] p-3 text-[11.5px]">
              <div className="flex justify-between gap-2">
                <dt className="text-[#5d6d64]">Base fare · {selectedQuote.vehicleClass.label}</dt>
                <dd className="font-semibold">{money(selectedQuote.breakdown.baseKobo, selectedQuote.currency)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#5d6d64]">Distance · {(selectedQuote.distanceMeters / 1000).toFixed(1)} km</dt>
                <dd className="font-semibold">{money(selectedQuote.breakdown.distanceKobo, selectedQuote.currency)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#5d6d64]">Time · about {selectedQuote.durationMinutes} min</dt>
                <dd className="font-semibold">{money(selectedQuote.breakdown.timeKobo, selectedQuote.currency)}</dd>
              </div>
              {selectedQuote.breakdown.adjustmentKobo !== 0 ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-[#5d6d64]">Rounding to ₦50</dt>
                  <dd className="font-semibold">
                    {selectedQuote.breakdown.adjustmentKobo < 0 ? "−" : "+"}
                    {money(Math.abs(selectedQuote.breakdown.adjustmentKobo), selectedQuote.currency)}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-2 border-t border-[#e6ece6] pt-1.5">
                <dt className="font-extrabold">Estimate</dt>
                <dd className="font-extrabold text-[#0b5c33]">{money(selectedQuote.fareKobo, selectedQuote.currency)}</dd>
              </div>
            </dl>
          ) : null}

          <ul className="mt-3 space-y-1 text-[10.5px] leading-4 text-[#5d6d64]">
            <li className="flex gap-1.5">
              <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-[#0b5c33]" aria-hidden />
              No card is charged here. Wallet fares are held by NaijaPay and released on completion.
            </li>
            <li className="flex gap-1.5">
              <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-[#0b5c33]" aria-hidden />
              Cancelling before the trip starts is free today: no cancellation fee is configured in this build.
            </li>
            <li className="flex gap-1.5">
              <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-[#0b5c33]" aria-hidden />
              Scheduled rides are not available. The Schedule tab is shown as unavailable.
            </li>
          </ul>
        </section>
      </div>

      {activeRide ? (
        <ActiveTripPanel
          ride={activeRide}
          viewer={viewer}
          canCancel={canCancel}
          busy={busy}
          onCancel={() => void cancelRide(activeRide)}
          onRefresh={() => void loadRides()}
          verification={verification}
        />
      ) : (
        <section id="active-trip" className="scroll-mt-24 rounded-2xl border border-dashed border-[#cfdccf] bg-[#f7fbf7] p-4 text-[12.5px] text-[#5d6d64]">
          <p className="font-extrabold text-[#14241b]">No active ride</p>
          <p className="mt-1">
            When a driver accepts, their approved vehicle, live position and route to your pick-up appear
            here. Nothing is shown before a real assignment exists.
          </p>
        </section>
      )}

      {viewer ? (
        <div id="saved-places" className="scroll-mt-24">
          <SavedPlaces />
        </div>
      ) : null}

      {completedRide ? <ReceiptCard ride={completedRide} /> : null}

      {viewer ? (
        <section aria-labelledby="ride-history-heading" className="rounded-2xl border border-[#e2e6e3] bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 id="ride-history-heading" className="font-display text-[18px] font-extrabold text-[#14241b]">
              Your rides
            </h2>
            <button type="button" onClick={() => void loadRides()} className="text-[11px] font-bold text-[#0b5c33] underline">
              Refresh
            </button>
          </div>
          {ridesState === "loading" ? (
            <p className="mt-2 flex items-center gap-2 text-[12px] text-[#5d6d64]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading rides…
            </p>
          ) : ridesState === "error" ? (
            <p role="alert" className="mt-2 text-[12px] font-bold text-[#b91c1c]">{ridesError}</p>
          ) : rides.length === 0 ? (
            <p className="mt-2 text-[12px] text-[#5d6d64]">No rides yet. Your first request will appear here.</p>
          ) : (
            <ul className="mt-2 divide-y divide-[#eef1ef]">
              {rides.slice(0, 8).map((ride) => (
                <li key={ride.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-bold text-[#14241b]">
                      {ride.pickupLabel} → {ride.dropoffLabel}
                    </p>
                    <p className="text-[10.5px] text-[#5d6d64]">
                      {ride.rideNumber} · {new Date(ride.requestedAt).toLocaleString()} · {statusText(ride.status)}
                    </p>
                  </div>
                  <span className="text-[12px] font-extrabold text-[#0b5c33]">{money(ride.fareKobo, ride.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

function ActiveTripPanel({
  ride,
  viewer,
  canCancel,
  busy,
  onCancel,
  onRefresh,
  verification
}: {
  ride: ApiRide;
  viewer: { name: string; isDriver: boolean } | null;
  canCancel: boolean;
  busy: string;
  onCancel: () => void;
  onRefresh: () => void;
  verification: RideVerification | null;
}) {
  const [tracking, setTracking] = useState<DriveTracking | null>(null);
  const [trackingState, setTrackingState] = useState<"idle" | "ready" | "error">("idle");
  const [trackingError, setTrackingError] = useState("");
  const [failures, setFailures] = useState(0);
  const lastCapturedRef = useRef<string | null>(null);

  const shouldTrack = ["driver_assigned", "driver_arriving", "in_progress"].includes(ride.status);

  useEffect(() => {
    if (!shouldTrack) {
      setTracking(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const next = await getTracking(ride.id);
        if (cancelled) return;
        // Out-of-order responses can never move the marker backwards.
        if (next.latest && lastCapturedRef.current && next.latest.capturedAt < lastCapturedRef.current) return;
        if (next.latest) lastCapturedRef.current = next.latest.capturedAt;
        setTracking(next);
        setTrackingState("ready");
        setTrackingError("");
        setFailures(0);
      } catch (caught) {
        if (cancelled) return;
        setTrackingError(caught instanceof Error ? caught.message : "Tracking is reconnecting.");
        setTrackingState("error");
        setFailures((count) => count + 1);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 6_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [ride.id, ride.status, shouldTrack]);

  const pickup = tracking?.pickup ?? { label: ride.pickupLabel, address: ride.pickupAddress, lat: 0, lng: 0 };
  const dropoff = tracking?.dropoff ?? { label: ride.dropoffLabel, address: ride.dropoffAddress, lat: 0, lng: 0 };
  const driverPoint =
    tracking?.latest && tracking.latest.lat && tracking.latest.lng
      ? {
          lat: tracking.latest.lat,
          lng: tracking.latest.lng,
          accuracyM: tracking.latest.accuracyM,
          capturedAt: tracking.latest.capturedAt,
          stale: tracking.stale
        }
      : null;

  const driverName = ride.driver?.user?.name ?? "Verified driver";
  const driverPhone = ride.driver?.user?.phone ?? ride.driver?.phone ?? null;
  const shareText = [
    `NaijaDrive trip ${ride.rideNumber}`,
    `${ride.pickupLabel} → ${ride.dropoffLabel}`,
    `Status: ${statusText(ride.status)}`,
    `Fare: ${money(ride.fareKobo, ride.currency)} (${ride.paymentMethod === "wallet" ? "NaijaPay" : "cash"})`
  ].join("\n");

  return (
    <section id="active-trip" aria-labelledby="active-trip-heading" className="scroll-mt-24 rounded-2xl border border-[#0b5c33]/25 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#0b5c33]">Active ride</p>
          <h2 id="active-trip-heading" className="mt-1 font-display text-[21px] font-extrabold text-[#14241b]">
            {statusText(ride.status)}
          </h2>
          <p className="text-[11px] text-[#5d6d64]">{ride.rideNumber}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#eaf5ec] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#0b5c33]">
            {ride.paymentMethod === "wallet" ? "NaijaPay" : "Cash"}
          </span>
          <button type="button" onClick={onRefresh} className="grid h-9 w-9 place-items-center rounded-full border border-[#e2e6e3] text-[#33443a]" aria-label="Refresh ride state">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>

      {ride.status === "requested" ? (
        <p className="mt-3 rounded-xl bg-[#eaf5ec] p-3 text-[11.5px] font-semibold leading-5 text-[#0b5c33]">
          Your request is in the server queue for approved Lagos drivers. Nothing is charged while you
          wait; you can cancel before a trip starts.
        </p>
      ) : null}

      {ride.driver ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-[#f7f8f6] p-3">
            <p className="text-[10px] font-black uppercase tracking-wide text-[#5d6d64]">Your driver</p>
            <p className="mt-1 text-[13px] font-extrabold text-[#14241b]">{driverName}</p>
            <p className="text-[11.5px] text-[#5d6d64]">
              {ride.driver.vehicleMake} {ride.driver.vehicleModel} · {findVehicleClass(ride.vehicleClass)?.label ?? ride.vehicleClass}
            </p>
            <p className="mt-1.5 inline-flex rounded-lg border border-[#14241b]/20 bg-white px-3 py-1 font-display text-[15px] font-extrabold tracking-widest text-[#14241b]">
              {ride.driver.vehiclePlate}
            </p>
            <p className="mt-1.5 text-[10.5px] leading-4 text-[#5d6d64]">
              Match this plate before getting in. NaijaDrive never asks you to pay anything beyond the fare
              shown.
            </p>
            {driverPhone ? (
              <a href={`tel:${driverPhone}`} className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#0b5c33] px-3 text-[11px] font-bold text-white">
                <Phone className="h-3.5 w-3.5" aria-hidden /> Call driver
              </a>
            ) : null}
          </div>
          <div className="rounded-xl bg-[#f7f8f6] p-3">
            <p className="text-[10px] font-black uppercase tracking-wide text-[#5d6d64]">Passenger verification</p>
            {verification ? (
              <>
                <p className="mt-1 text-[11.5px] leading-5 text-[#5d6d64]">
                  Give this 4-digit code to your driver before the trip starts.
                </p>
                <p className="mt-1.5 font-display text-[26px] font-extrabold tracking-[0.3em] text-[#0b5c33]">
                  {verification.code}
                </p>
                <p className="text-[10px] text-[#5d6d64]">
                  {verification.verified ? "Verified by the driver." : "Not verified yet."}
                </p>
              </>
            ) : (
              <p className="mt-1 text-[11.5px] leading-5 text-[#5d6d64]">
                A code appears here once your driver is assigned. If the server has not issued one, the
                driver confirms your name and plate instead.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {shouldTrack ? (
        <div className="mt-4">
          <TripMap
            pickup={pickup.lat && pickup.lng ? { lat: pickup.lat, lng: pickup.lng, label: pickup.label } : null}
            dropoff={dropoff.lat && dropoff.lng ? { lat: dropoff.lat, lng: dropoff.lng, label: dropoff.label } : null}
            driver={driverPoint}
            route={tracking?.route?.geometry ?? null}
            routeUnavailable={Boolean(tracking && !tracking.route && tracking.latest)}
            title={tracking?.leg === "dropoff" ? "Driver heading to your destination" : "Driver heading to your pick-up"}
            caption={
              driverPoint
                ? tracking?.stale
                  ? `Last driver update ${tracking.ageSeconds ?? "—"}s ago · location is stale`
                  : `Driver update ${tracking?.ageSeconds ?? 0}s ago · accuracy ${driverPoint.accuracyM ? `±${Math.round(driverPoint.accuracyM)} m` : "not reported"}`
                : "Waiting for the first driver location update"
            }
            heightClass="h-[260px] sm:h-[330px]"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f7f8f6] px-3 py-2 text-[10.5px] text-[#5d6d64]">
            <span>
              {trackingError
                ? `Reconnecting to tracking… ${failures > 1 ? "The last known state is shown." : ""}`
                : tracking?.latest
                  ? `Location updated ${tracking.ageSeconds ?? "—"}s ago`
                  : "No driver location received yet"}
            </span>
            {tracking?.route ? (
              <span className="font-bold text-[#33443a]">
                {(tracking.route.distanceMeters / 1000).toFixed(1)} km · {formatMinutes(tracking.route.durationSeconds / 60)} to {tracking.leg === "dropoff" ? "destination" : "pick-up"}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <TripTimeline ride={ride} />

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#dfe7df] px-3 text-[11.5px] font-bold text-[#0b5c33]"
        >
          <Share2 className="h-3.5 w-3.5" aria-hidden /> Share trip details
        </a>
        {canCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy === `cancel-${ride.id}`}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#ef4444]/25 bg-[#fee2e2] px-3 text-[11.5px] font-bold text-[#b91c1c] disabled:opacity-50"
          >
            {busy === `cancel-${ride.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <XCircle className="h-3.5 w-3.5" aria-hidden />}
            Cancel ride
          </button>
        ) : (
          <p className="flex items-start gap-1.5 rounded-xl bg-[#f7f8f6] px-3 py-2 text-[10.5px] leading-4 text-[#5d6d64]">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            A trip already in progress cannot be cancelled here. Use support if there is a safety issue.
          </p>
        )}
      </div>
      {viewer?.isDriver ? (
        <Link href="/driver" className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#0b5c33] px-3 text-[11.5px] font-bold text-white">
          Open driver workspace
        </Link>
      ) : null}
    </section>
  );
}

function TripTimeline({ ride }: { ride: ApiRide }) {
  const events = ride.events ?? [];
  if (events.length === 0) return null;
  return (
    <ol className="mt-4 space-y-2.5">
      {events.map((event) => (
        <li key={event.id} className="flex gap-2.5">
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#eaf5ec] text-[#0b5c33]">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-[#14241b]">{event.label}</p>
            <p className="text-[11px] leading-4 text-[#5d6d64]">{event.description}</p>
            <p className="mt-0.5 text-[10px] text-[#5d6d64]">{new Date(event.createdAt).toLocaleString("en-NG")}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ReceiptCard({ ride }: { ride: ApiRide }) {
  const paymentText =
    ride.paymentStatus === "paid"
      ? ride.paymentMethod === "wallet"
        ? "Paid from NaijaPay wallet"
        : "Cash recorded by driver"
      : ride.paymentStatus === "refunded"
        ? "Refunded to NaijaPay wallet"
        : ride.paymentStatus === "partially_refunded"
          ? "Partly refunded to NaijaPay wallet"
          : ride.paymentStatus === "held"
            ? "Held in NaijaPay wallet"
            : ride.paymentMethod === "cash"
              ? "Cash due to driver"
              : "Payment pending";

  return (
    <section aria-labelledby="receipt-heading" className="rounded-2xl border border-[#e2e6e3] bg-white p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eaf5ec] text-[#0b5c33]">
          <ReceiptText className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h2 id="receipt-heading" className="font-display text-[18px] font-extrabold text-[#14241b]">
            Ride receipt
          </h2>
          <p className="text-[11px] text-[#5d6d64]">{ride.rideNumber}</p>
        </div>
      </div>
      <dl className="mt-3 space-y-1.5 text-[12px]">
        <div className="flex justify-between gap-3">
          <dt className="text-[#5d6d64]">Route</dt>
          <dd className="min-w-0 break-words text-right font-semibold">
            {ride.pickupLabel} → {ride.dropoffLabel}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-[#5d6d64]">Completed</dt>
          <dd className="text-right font-semibold">{ride.completedAt ? new Date(ride.completedAt).toLocaleString("en-NG") : "—"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-[#5d6d64]">Fare</dt>
          <dd className="text-right font-extrabold text-[#0b5c33]">{money(ride.fareKobo, ride.currency)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-[#5d6d64]">Payment</dt>
          <dd className="text-right font-semibold">{paymentText}</dd>
        </div>
        {ride.driver ? (
          <div className="flex justify-between gap-3">
            <dt className="text-[#5d6d64]">Driver</dt>
            <dd className="min-w-0 break-words text-right font-semibold">
              {ride.driver.user?.name ?? "Verified driver"} · {ride.driver.vehiclePlate}
            </dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#dfe7df] px-3 text-[11.5px] font-bold text-[#0b5c33]"
        >
          <ReceiptText className="h-3.5 w-3.5" aria-hidden /> Print receipt
        </button>
        <Link href="/orders" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#f2f7f2] px-3 text-[11.5px] font-bold text-[#14241b]">
          View all activity
        </Link>
      </div>
      <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-[#5d6d64]">
        <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
        Fares are recorded in NGN kobo. A wallet fare is marked paid only after the server releases the
        held amount to the driver.
      </p>
    </section>
  );
}

export { statusText };
