"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeftRight,
  ArrowRight,
  Banknote,
  Bike,
  CalendarClock,
  Car,
  Package,
  CheckCircle2,
  Clock,
  Loader2,
  LocateFixed,
  Navigation,
  ReceiptText,
  Share2,
  ShieldCheck,
  Users,
  Wallet,
  XCircle
} from "lucide-react";
import {
  ApiRequestError,
  apiClient,
  koboToNaira,
  type ApiDriveQuote,
  type ApiRide
} from "@/lib/api-client";
import {
  DRIVE_CITY,
  VEHICLE_CLASSES,
  findPlace,
  formatDistanceShort,
  nearestPlace,
  type VehicleClassId
} from "@/lib/config/drive";
import { DriveMap } from "./drive-map";
import { PlacePicker } from "./place-picker";
import { SavedPlaces } from "./saved-places";

type Viewer = { name: string; isDriver: boolean } | null;
type LoadState = "idle" | "loading" | "ready" | "error";

const activeStatuses = ["requested", "driver_assigned", "driver_arriving", "in_progress"];

function isActive(ride: ApiRide) {
  return activeStatuses.includes(ride.status);
}

const vehicleIcon: Record<string, typeof Car> = {
  bike: Bike,
  economy: Car,
  comfort: Car,
  xl: Users
};

export function DrivePage({ viewer }: { viewer: Viewer }) {
  const router = useRouter();
  const [pickup, setPickup] = useState("computer-village");
  const [dropoff, setDropoff] = useState("victoria-island");
  const [vehicleClass, setVehicleClass] = useState<VehicleClassId>("economy");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "wallet">("cash");
  const [quote, setQuote] = useState<ApiDriveQuote | null>(null);
  const [quoteState, setQuoteState] = useState<LoadState>("idle");
  const [quoteError, setQuoteError] = useState("");
  const [rides, setRides] = useState<ApiRide[]>([]);
  const [ridesState, setRidesState] = useState<LoadState>("idle");
  const [ridesError, setRidesError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [lowData, setLowData] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState("");

  const pickupPlace = useMemo(() => findPlace(pickup), [pickup]);
  const dropoffPlace = useMemo(() => findPlace(dropoff), [dropoff]);

  const activeRide = useMemo(() => rides.find(isActive) ?? null, [rides]);
  const lastCompleted = useMemo(() => rides.find((ride) => ride.status === "completed") ?? null, [rides]);
  const recent = useMemo(() => rides.filter((ride) => ride.status !== "completed" || ride.id !== lastCompleted?.id).slice(0, 6), [rides, lastCompleted]);

  const loadRides = useCallback(async () => {
    if (!viewer) return;
    try {
      const data = await apiClient.driveRides();
      setRides(data);
      setRidesState("ready");
      setRidesError("");
    } catch (err) {
      setRidesState("error");
      setRidesError(err instanceof Error ? err.message : "Unable to load your rides.");
    }
  }, [viewer]);

  useEffect(() => {
    void loadRides();
  }, [loadRides]);

  useEffect(() => {
    if (!viewer || !activeRide) return;
    const timer = window.setInterval(() => {
      void loadRides();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [activeRide, loadRides, viewer]);

  // Device-local preferences only. Nothing here is server state.
  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem("nd_drive_recent") ?? "[]");
      if (Array.isArray(stored)) {
        setRecentIds(
          stored
            .filter((item): item is string => typeof item === "string" && Boolean(findPlace(item)))
            .slice(0, 5)
        );
      }
      setLowData(window.localStorage.getItem("nd_drive_low_data") === "1");
    } catch {
      // Storage can be blocked; booking must still work without it.
    }
  }, []);

  function rememberPlace(placeId: string) {
    setRecentIds((current) => {
      const next = [placeId, ...current.filter((id) => id !== placeId)].slice(0, 5);
      try {
        window.localStorage.setItem("nd_drive_recent", JSON.stringify(next));
      } catch {
        // Ignore a full or blocked storage area.
      }
      return next;
    });
  }

  function changeLowData(next: boolean) {
    setLowData(next);
    try {
      window.localStorage.setItem("nd_drive_low_data", next ? "1" : "0");
    } catch {
      // Ignore a full or blocked storage area.
    }
  }

  /**
   * Snap the device position to the nearest bookable landmark. The coordinates are
   * real, from the browser; the landmark is the closest one we can actually price.
   * No address is invented and nothing is booked automatically.
   */
  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setLocationNotice("This browser cannot share your location. Pick a landmark instead.");
      return;
    }
    setLocating(true);
    setLocationNotice("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const nearest = nearestPlace({ lat: position.coords.latitude, lng: position.coords.longitude });
        if (!nearest) {
          setLocationNotice("Your position is outside the landmarks NaijaDrive can book from.");
          return;
        }
        if (nearest.distanceMeters > 25000) {
          setLocationNotice(
            `You are ${formatDistanceShort(nearest.distanceMeters)} from the nearest bookable landmark (${nearest.place.label}). NaijaDrive only books inside Lagos, so nothing was changed.`
          );
          return;
        }
        setPickup(nearest.place.id);
        rememberPlace(nearest.place.id);
        setLocationNotice(
          nearest.distanceMeters < 150
            ? `Pick-up set to ${nearest.place.label}, where you are.`
            : `NaijaDrive books between named landmarks, so pick-up is set to the nearest one: ${nearest.place.label}, ${formatDistanceShort(nearest.distanceMeters)} from your position.`
        );
      },
      (geoError) => {
        setLocating(false);
        setLocationNotice(
          geoError.code === geoError.PERMISSION_DENIED
            ? "Location permission was denied. Pick a landmark instead — booking never needs your GPS."
            : "Your location could not be read. Pick a landmark instead."
        );
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }

  useEffect(() => {
    if (pickup === dropoff) {
      setQuote(null);
      setQuoteState("error");
      setQuoteError("Pick-up and drop-off must be different places.");
      return;
    }
    let cancelled = false;
    setQuoteState("loading");
    setQuoteError("");
    apiClient
      .driveQuote(pickup, dropoff, vehicleClass)
      .then((data) => {
        if (cancelled) return;
        setQuote(data);
        setQuoteState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setQuote(null);
        setQuoteState("error");
        setQuoteError(err instanceof Error ? err.message : "Unable to calculate this fare.");
      });
    return () => {
      cancelled = true;
    };
  }, [pickup, dropoff, vehicleClass]);

  function swapPlaces() {
    setPickup(dropoff);
    setDropoff(pickup);
  }

  function requireSignIn() {
    if (viewer) return false;
    router.push("/login?next=/naijadrive");
    return true;
  }

  async function requestRide() {
    if (requireSignIn()) return;
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
      rememberPlace(pickup);
      rememberPlace(dropoff);
      setNotice(`Ride ${ride.rideNumber} requested. A driver can now accept it.`);
    } catch (err) {
      if (err instanceof ApiRequestError) setError(err.message);
      else setError(err instanceof Error ? err.message : "Unable to request this ride.");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to cancel this ride.");
    } finally {
      setBusy("");
    }
  }

  const canCancel = activeRide && ["requested", "driver_assigned", "driver_arriving"].includes(activeRide.status);

  return (
    <div className="space-y-6 pb-4">
      <section className="overflow-hidden rounded-3xl bg-night text-white">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
          <div className="p-5 sm:p-8">
            <p className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold">
              <Navigation className="h-3.5 w-3.5 text-primary-live" aria-hidden="true" />
              {DRIVE_CITY}, Nigeria
            </p>
            <h1 className="mt-4 font-display text-3xl font-extrabold leading-tight sm:text-4xl">
              Request a ride, get around {DRIVE_CITY} with NaijaDrive
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/75 sm:text-base">
              Book a verified Lagos driver, see the fare before you request, and follow real server
              events from request to receipt. No simulated driver movement is shown.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold">
              <span className="rounded-full bg-white/10 px-3 py-1.5">Fare locked at request</span>
              <span className="rounded-full bg-white/10 px-3 py-1.5">Cash or NaijaPay</span>
              <span className="rounded-full bg-white/10 px-3 py-1.5">Cancel before the trip starts</span>
            </div>
            {viewer?.isDriver ? (
              <Link
                href="/driver"
                className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary-live px-4 text-sm font-extrabold text-night"
              >
                Open driver dashboard
                <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
          <div className="relative min-h-48 lg:min-h-full">
            <img
              src="/brand-photography/drive-sedan-lagos.jpg"
              alt="A green NaijaDrive sedan with its driver on a Lagos road at sunset (brand illustration)"
              width={1024}
              height={768}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-night/60 to-transparent lg:bg-gradient-to-r lg:from-night lg:to-transparent" />
          </div>
        </div>
      </section>

      <nav aria-label="NaijaDrive services" className="flex flex-wrap items-center gap-2 rounded-2xl border border-border-soft bg-canvas p-2">
        <span aria-current="page" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-white">
          <Car className="h-4 w-4" aria-hidden="true" />
          Ride
        </span>
        <span aria-disabled="true" title="Bike rides are not available in this build" className="inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold text-muted/60">
          <Bike className="h-4 w-4" aria-hidden="true" />
          Bike
        </span>
        <Link href="/naijasend" className="inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold text-muted transition hover:bg-surface-low hover:text-primary">
          <Package className="h-4 w-4" aria-hidden="true" />
          Package
        </Link>
        <span aria-disabled="true" title="Scheduled rides are not available in this build" className="inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold text-muted/60">
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
          Schedule
        </span>
        <span className="ml-auto hidden text-[11px] font-semibold text-muted sm:inline">
          Bike and scheduled rides are not available yet.
        </span>
      </nav>

      {!viewer ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary-soft p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-extrabold text-primary">Sign in to request a ride</p>
            <p className="text-sm text-muted">Quotes are open to everyone. Booking needs your NaijaDeals account.</p>
          </div>
          <Link href="/login?next=/naijadrive" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-white">
            Sign in
          </Link>
        </div>
      ) : null}

      {notice ? (
        <div role="status" className="rounded-xl bg-primary-soft p-3 text-sm font-bold text-primary">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-crimson/30 bg-crimson-soft p-3 text-sm font-bold text-crimson">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <section aria-labelledby="book-heading" className="min-w-0 rounded-2xl border border-border-soft bg-canvas p-4 sm:p-5">
          <h2 id="book-heading" className="font-display text-xl font-extrabold">
            Where are you going?
          </h2>
          <p className="mt-1 text-sm text-muted">
            Search a Lagos landmark, or use your location to snap to the nearest one. Every fare is
            calculated by the server from the two points and the vehicle class.
          </p>

          <div className="mt-4 space-y-3">
            <PlacePicker
              id="drive-pickup"
              label="Pick-up"
              value={pickup}
              onChange={(placeId) => {
                setPickup(placeId);
                rememberPlace(placeId);
              }}
              accent="pickup"
              recentIds={recentIds}
              counterpartId={dropoff}
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={useMyLocation}
                disabled={locating}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border-soft bg-canvas px-3 text-xs font-bold text-muted transition hover:border-primary/40 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
              >
                {locating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {locating ? "Finding you…" : "Use my location"}
              </button>

              <button
                type="button"
                onClick={swapPlaces}
                aria-label="Swap pick-up and drop-off"
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border-soft bg-canvas px-3 text-xs font-bold text-muted transition hover:border-primary/40 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
                Swap
              </button>
            </div>

            {locationNotice ? (
              <p role="status" className="rounded-xl bg-surface-low p-2.5 text-[11px] font-semibold leading-snug text-muted">
                {locationNotice}
              </p>
            ) : null}

            <PlacePicker
              id="drive-dropoff"
              label="Drop-off"
              value={dropoff}
              onChange={(placeId) => {
                setDropoff(placeId);
                rememberPlace(placeId);
              }}
              accent="dropoff"
              recentIds={recentIds}
              counterpartId={pickup}
            />
          </div>

          <div className="mt-4">
            <DriveMap
              pickup={pickupPlace}
              dropoff={dropoffPlace}
              roadDistanceMeters={quote?.distanceMeters ?? null}
              lowData={lowData}
              onLowDataChange={changeLowData}
            />
          </div>

          <fieldset className="mt-5">
            <legend className="text-xs font-black uppercase tracking-wide text-muted">Vehicle class</legend>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {VEHICLE_CLASSES.map((vehicle) => {
                const Icon = vehicleIcon[vehicle.id] ?? Car;
                const active = vehicleClass === vehicle.id;
                return (
                  <label
                    key={vehicle.id}
                    className={`flex min-h-24 cursor-pointer flex-col rounded-xl border p-3 text-left transition ${
                      active ? "border-primary bg-primary-soft" : "border-border-soft bg-surface-low hover:border-primary/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="vehicle-class"
                      value={vehicle.id}
                      checked={active}
                      onChange={() => setVehicleClass(vehicle.id)}
                      className="sr-only"
                    />
                    <Icon className={`h-5 w-5 ${active ? "text-primary" : "text-muted"}`} aria-hidden="true" />
                    <span className="mt-2 text-sm font-extrabold">{vehicle.label}</span>
                    <span className="mt-0.5 text-[11px] leading-snug text-muted">{vehicle.description}</span>
                    <span className="mt-auto pt-1 text-[11px] font-bold text-muted">{vehicle.seats} seat{vehicle.seats === 1 ? "" : "s"}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="mt-5">
            <legend className="text-xs font-black uppercase tracking-wide text-muted">Payment</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${paymentMethod === "cash" ? "border-primary bg-primary-soft" : "border-border-soft bg-surface-low"}`}>
                <input
                  type="radio"
                  name="payment-method"
                  value="cash"
                  checked={paymentMethod === "cash"}
                  onChange={() => setPaymentMethod("cash")}
                  className="sr-only"
                />
                <Banknote className={`mt-0.5 h-5 w-5 shrink-0 ${paymentMethod === "cash" ? "text-primary" : "text-muted"}`} aria-hidden="true" />
                <span>
                  <span className="block text-sm font-extrabold">Cash to driver</span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted">
                    The receipt stays marked cash due until the driver records collection.
                  </span>
                </span>
              </label>
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${paymentMethod === "wallet" ? "border-primary bg-primary-soft" : "border-border-soft bg-surface-low"}`}>
                <input
                  type="radio"
                  name="payment-method"
                  value="wallet"
                  checked={paymentMethod === "wallet"}
                  onChange={() => setPaymentMethod("wallet")}
                  className="sr-only"
                />
                <Wallet className={`mt-0.5 h-5 w-5 shrink-0 ${paymentMethod === "wallet" ? "text-primary" : "text-muted"}`} aria-hidden="true" />
                <span>
                  <span className="block text-sm font-extrabold">NaijaPay wallet</span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted">
                    Fare is held at request and paid to the driver on completion. Cancel before the trip
                    starts and the hold is returned.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          <div aria-live="polite" className="mt-5 rounded-2xl border border-border-soft bg-surface-low p-4">
            {quoteState === "loading" ? (
              <p className="flex items-center gap-2 text-sm font-bold text-muted">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Calculating fare…
              </p>
            ) : quoteState === "error" ? (
              <p className="flex items-start gap-2 text-sm font-bold text-crimson">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {quoteError}
              </p>
            ) : quote ? (
              <>
                <RouteChips from={quote.pickup.label} to={quote.dropoff.label} />
                <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-muted">Estimated fare</p>
                    <p className="font-display text-3xl font-extrabold text-primary">{koboToNaira(quote.fareKobo, quote.currency)}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-3 text-xs font-semibold text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
                        {(quote.distanceMeters / 1000).toFixed(1)} km
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        about {quote.durationMinutes} min
                      </span>
                      <span>{quote.vehicleClass.label}</span>
                    </p>
                  </div>
                  <p className="text-[11px] leading-snug text-muted">
                    Estimate includes a road-distance factor. The fare is locked when you request.
                  </p>
                </div>
              </>
            ) : null}
          </div>

          <button
            type="button"
            onClick={requestRide}
            disabled={!quote || quoteState !== "ready" || busy === "request" || Boolean(activeRide)}
            className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-extrabold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "request" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Car className="h-4 w-4" aria-hidden="true" />}
            {activeRide ? "Finish or cancel your active ride first" : viewer ? "Request ride" : "Sign in to request"}
          </button>
          <p className="mt-2 text-center text-[11px] text-muted">
            No card is charged here. Cash is paid to the driver; wallet fares are held by NaijaPay.
          </p>
        </section>

        <div className="min-w-0 space-y-5">
          {activeRide ? (
            <ActiveRideCard ride={activeRide} busy={busy} canCancel={Boolean(canCancel)} onCancel={() => void cancelRide(activeRide)} />
          ) : (
            <section className="rounded-2xl border border-border-soft bg-canvas p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                  <Car className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="font-display text-lg font-extrabold">No active ride</h2>
                  <p className="mt-1 text-sm text-muted">
                    Request a ride to see its real status timeline here. Driver details appear only after
                    a verified driver accepts.
                  </p>
                </div>
              </div>
            </section>
          )}

          {lastCompleted ? <ReceiptCard ride={lastCompleted} /> : null}

          {quote && quoteState === "ready" ? <FareBreakdown quote={quote} /> : null}

          {viewer ? <SavedPlaces /> : null}

          {viewer ? (
            <section aria-labelledby="recent-heading" className="rounded-2xl border border-border-soft bg-canvas p-4">
              <h2 id="recent-heading" className="font-display text-lg font-extrabold">
                Your rides
              </h2>
              {ridesState === "loading" ? (
                <p className="mt-3 flex items-center gap-2 text-sm text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Loading rides…
                </p>
              ) : ridesState === "error" ? (
                <div className="mt-3">
                  <p className="text-sm font-bold text-crimson">{ridesError}</p>
                  <button type="button" onClick={() => void loadRides()} className="mt-2 min-h-10 rounded-lg border border-border-soft px-3 text-xs font-bold">
                    Retry
                  </button>
                </div>
              ) : recent.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No rides yet. Your first request will appear here.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {recent.map((ride) => (
                    <li key={ride.id} className="rounded-xl bg-surface-low p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">
                            {ride.pickupLabel} → {ride.dropoffLabel}
                          </p>
                          <p className="mt-0.5 text-xs text-muted">
                            {ride.rideNumber} · {new Date(ride.requestedAt).toLocaleString()}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-canvas px-2 py-1 text-[10px] font-black uppercase tracking-wide text-muted">
                          {ride.status.replaceAll("_", " ")}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-bold text-primary">{koboToNaira(ride.fareKobo, ride.currency)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ActiveRideCard({
  ride,
  busy,
  canCancel,
  onCancel
}: {
  ride: ApiRide;
  busy: string;
  canCancel: boolean;
  onCancel: () => void;
}) {
  // The server writes a "released" event when a driver hands the ride back. That is
  // the automatic reassignment both major competitors get wrong, so the rider is told
  // it happened rather than being left to notice the driver name changed.
  const wasReassigned = (ride.events ?? []).some((event) => /released/i.test(event.label));
  const shareText = [
    `NaijaDrive trip ${ride.rideNumber}`,
    `${ride.pickupLabel} → ${ride.dropoffLabel}`,
    `Status: ${ride.status.replaceAll("_", " ")}`,
    `Fare: ${koboToNaira(ride.fareKobo, ride.currency)} (${ride.paymentMethod === "wallet" ? "NaijaPay" : "cash"})`
  ].join("\n");

  return (
    <section aria-labelledby="active-ride-heading" className="rounded-2xl border border-primary/20 bg-canvas p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-primary">Active ride</p>
          <h2 id="active-ride-heading" className="mt-1 font-display text-xl font-extrabold">
            {ride.status.replaceAll("_", " ")}
          </h2>
          <p className="text-xs text-muted">{ride.rideNumber}</p>
        </div>
        <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-primary">
          {ride.paymentMethod === "wallet" ? "NaijaPay" : "Cash"}
        </span>
      </div>

      <div className="mt-4 rounded-xl bg-surface-low p-3">
        <RouteChips from={ride.pickupLabel} to={ride.dropoffLabel} />
        <p className="mt-2 text-sm font-extrabold text-primary">{koboToNaira(ride.fareKobo, ride.currency)}</p>
      </div>

      {ride.status === "requested" ? (
        <p className="mt-3 rounded-xl border border-primary/20 bg-primary-soft p-3 text-xs font-semibold leading-snug text-primary">
          {wasReassigned
            ? "A driver released this ride, so it went straight back to approved drivers automatically. You do not need to request again, and you will not be charged twice."
            : "Your request is open to approved Lagos drivers. Cancel any time before the trip starts and no fare is charged."}
        </p>
      ) : null}

      {ride.driver ? (
        <div className="mt-4 rounded-xl bg-surface-low p-3">
          <p className="text-xs font-black uppercase tracking-wide text-muted">Your driver</p>
          <p className="mt-1 text-sm font-extrabold">
            {ride.driver.user?.name ?? "Verified driver"}
          </p>
          <p className="text-xs text-muted">
            {ride.driver.vehicleMake} {ride.driver.vehicleModel}
          </p>
          <p className="mt-2 inline-flex items-center rounded-lg border border-ink/20 bg-canvas px-3 py-1.5 font-display text-base font-extrabold tracking-widest">
            {ride.driver.vehiclePlate}
          </p>
          <p className="mt-2 text-[11px] leading-snug text-muted">
            Match this plate before you get in. NaijaDrive never asks you to pay a driver anything other
            than the fare shown above.
          </p>
          {ride.driver.user?.phone ? (
            <a
              href={`tel:${ride.driver.user.phone}`}
              className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-canvas px-3 text-xs font-bold text-primary"
            >
              <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
              Call {ride.driver.user.phone}
            </a>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-surface-low p-3 text-sm text-muted">
          Waiting for an approved driver to accept. This page refreshes from server events every 10
          seconds.
        </p>
      )}

      {ride.assignmentExpiresAt && (ride.status === "driver_assigned" || ride.status === "driver_arriving") ? (
        <AssignmentDeadline deadline={ride.assignmentExpiresAt} status={ride.status} />
      ) : null}

      <RideTimeline ride={ride} />
      <a
        href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border-soft bg-canvas px-4 text-sm font-bold text-primary"
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
        Share this trip
      </a>

      {canCancel ? (
        <button
          type="button"
          onClick={onCancel}
          disabled={busy === `cancel-${ride.id}`}
          className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-crimson/30 bg-crimson-soft px-4 text-sm font-bold text-crimson disabled:opacity-50"
        >
          {busy === `cancel-${ride.id}` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />}
          Cancel ride
        </button>
      ) : (
        <p className="mt-2 flex items-start gap-2 rounded-xl bg-surface-low p-3 text-xs text-muted">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          A trip already in progress cannot be cancelled from this page. Contact support if there is a
          safety issue.
        </p>
      )}
    </section>
  );
}

/**
 * Itemised fare. Competitors show a single number before you book and the breakdown
 * only afterwards; this shows the arithmetic up front, from the server's own quote.
 * The four parts always sum to the quoted total.
 */
function FareBreakdown({ quote }: { quote: ApiDriveQuote }) {
  const parts = quote.breakdown;
  if (!parts) return null;

  const rows = [
    { label: `Base fare · ${quote.vehicleClass.label}`, value: parts.baseKobo },
    { label: `Distance · ${(quote.distanceMeters / 1000).toFixed(1)} km`, value: parts.distanceKobo },
    { label: `Time · about ${quote.durationMinutes} min`, value: parts.timeKobo }
  ];

  return (
    <section aria-labelledby="fare-breakdown-heading" className="rounded-2xl border border-border-soft bg-canvas p-4 sm:p-5">
      <h2 id="fare-breakdown-heading" className="font-display text-lg font-extrabold">
        How this fare is built
      </h2>
      <p className="mt-1 text-xs text-muted">
        Calculated by the server from these two landmarks. The same number is recalculated when you
        request, and that is the amount locked for the trip.
      </p>

      <dl className="mt-3 space-y-2 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-muted">{row.label}</dt>
            <dd className="shrink-0 font-semibold">{koboToNaira(row.value, quote.currency)}</dd>
          </div>
        ))}
        {parts.adjustmentKobo !== 0 ? (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted">Rounded to the nearest ₦50</dt>
            <dd className="shrink-0 font-semibold">
              {parts.adjustmentKobo < 0 ? "−" : "+"}
              {koboToNaira(Math.abs(parts.adjustmentKobo), quote.currency)}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-border-soft pt-3">
        <span className="text-sm font-extrabold">Total</span>
        <span className="font-display text-xl font-extrabold text-primary">
          {koboToNaira(quote.fareKobo, quote.currency)}
        </span>
      </div>
    </section>
  );
}

/**
 * Trip endpoints encoded three ways at once — shape, colour and a text label — so the
 * route survives colour blindness and a greyscale printout. Encoding the ends with a
 * colour alone is the specific defect this avoids.
 */
function RouteChips({ from, to }: { from: string; to: string }) {
  return (
    <ul className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-xs font-bold">
      <li className="flex min-w-0 items-center gap-1.5">
        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary ring-2 ring-primary/25" />
        <span className="shrink-0 text-[10px] font-black uppercase tracking-wide text-muted">Pick-up</span>
        <span className="min-w-0 break-words">{from}</span>
      </li>
      <li aria-hidden="true" className="text-muted">
        →
      </li>
      <li className="flex min-w-0 items-center gap-1.5">
        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[2px] bg-night" />
        <span className="shrink-0 text-[10px] font-black uppercase tracking-wide text-muted">Drop-off</span>
        <span className="min-w-0 break-words">{to}</span>
      </li>
    </ul>
  );
}

/**
 * The rider's view of the driver's response deadline. The server releases a stale
 * assignment the next time the ride is read, so this mirrors that rule honestly:
 * a countdown while the clock runs, then an explicit "back in the queue" state.
 */
function AssignmentDeadline({ deadline, status }: { deadline: string; status: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 1000));
  const expired = remaining <= 0;
  const target = status === "driver_assigned" ? "arrive" : "start the trip";
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const clock = minutes > 0 ? `${minutes} min ${String(seconds).padStart(2, "0")} s` : `${seconds} s`;

  return (
    <p
      role="status"
      aria-live="polite"
      className={`mt-4 rounded-xl px-3 py-2 text-xs font-bold leading-snug ${
        expired ? "bg-crimson-soft text-crimson" : "bg-surface-low text-muted"
      }`}
    >
      {expired
        ? "The driver missed the update deadline. The ride returns to approved drivers automatically — you are not charged extra and do not need to request again."
        : `Your driver has ${clock} to ${target}. If they miss it, the ride returns to the open queue automatically.`}
    </p>
  );
}

function RideTimeline({ ride }: { ride: ApiRide }) {
  const events = ride.events ?? [];
  if (events.length === 0) return null;
  return (
    <ol className="mt-4 space-y-3">
      {events.map((event) => (
        <li key={event.id} className="flex gap-3">
          <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold">{event.label}</p>
            <p className="text-xs text-muted">{event.description}</p>
            <p className="mt-0.5 text-[11px] text-muted">{new Date(event.createdAt).toLocaleString()}</p>
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
        : ride.paymentStatus === "held"
          ? "Held in NaijaPay wallet"
          : ride.paymentMethod === "cash"
            ? "Cash due to driver"
            : "Payment pending";

  return (
    <section aria-labelledby="receipt-heading" className="rounded-2xl border border-border-soft bg-canvas p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
          <ReceiptText className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="receipt-heading" className="font-display text-lg font-extrabold">
            Ride receipt
          </h2>
          <p className="text-xs text-muted">{ride.rideNumber}</p>
        </div>
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Route</dt>
          <dd className="min-w-0 break-words text-right font-semibold">
            {ride.pickupLabel} → {ride.dropoffLabel}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Completed</dt>
          <dd className="text-right font-semibold">
            {ride.completedAt ? new Date(ride.completedAt).toLocaleString() : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Fare</dt>
          <dd className="text-right font-extrabold text-primary">{koboToNaira(ride.fareKobo, ride.currency)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Payment</dt>
          <dd className="text-right font-semibold">{paymentText}</dd>
        </div>
        {ride.driver ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Driver</dt>
            <dd className="min-w-0 break-words text-right font-semibold">
              {ride.driver.user?.name ?? "Verified driver"} · {ride.driver.vehiclePlate}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border-soft px-4 text-sm font-bold text-primary"
        >
          <ReceiptText className="h-4 w-4" aria-hidden="true" />
          Print receipt
        </button>
        <Link
          href="/orders"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-surface-low px-4 text-sm font-bold"
        >
          View all activity
          <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
      </div>
      <p className="mt-3 flex items-start gap-2 text-[11px] text-muted">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Fares are recorded in NGN kobo. A wallet fare is only marked paid after the server releases the
        held amount to the driver.
      </p>
    </section>
  );
}
