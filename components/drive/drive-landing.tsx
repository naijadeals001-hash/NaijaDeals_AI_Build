"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bike,
  CalendarClock,
  Car,
  Check,
  ChevronRight,
  LocateFixed,
  Loader2,
  MapPin,
  Package,
  Plane,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Store,
  Users,
  Wallet,
  X
} from "lucide-react";
import { PlacePicker } from "@/components/functional/place-picker";
import { usePlatform } from "@/components/platform/platform-provider";
import { apiClient, type ApiSavedPlace } from "@/lib/api-client";
import {
  DRIVE_CITY,
  findPlace,
  formatDistanceShort,
  nearestPlace,
  type VehicleClassId
} from "@/lib/config/drive";
import { BookingWorkspace } from "./booking-workspace";
import { DriveFooter, DriveHeader } from "./drive-chrome";
import type { ServiceCity } from "./types";

type Viewer = { name: string; isDriver: boolean } | null;

const focus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b5c33]";

const eatsCategories = [
  ["Local favourites", "/naijaeats/restaurants?q=local"],
  ["Breakfast", "/naijaeats/restaurants?q=breakfast"],
  ["Healthy eats", "/naijaeats/restaurants?q=healthy"],
  ["Desserts", "/naijaeats/restaurants?q=dessert"],
  ["Drinks", "/naijaeats/restaurants?q=drinks"]
] as const;

const faqs = [
  {
    q: "How do I book a ride?",
    a: "Choose a pick-up and destination from the Lagos landmarks, review the server quote, sign in to NaijaDeals if you have not already, then request the ride. Your request enters the driver queue and the fare is locked at request."
  },
  {
    q: "Which payment methods can I use?",
    a: "Cash paid directly to the driver, or your NaijaPay wallet. A wallet fare is held when you request and released to the driver on completion. This flow does not charge a card directly."
  },
  {
    q: "Can I schedule a ride?",
    a: "No. Scheduled rides are not available in this build, so the Schedule control is shown as unavailable rather than storing a date that no dispatch process fulfils."
  },
  {
    q: "Where is NaijaDrive available?",
    a: `Passenger rides are dispatched in ${DRIVE_CITY} only. The service-area checker reads the platform's real city activation records and tells you whether ride dispatch is live there.`
  },
  {
    q: "How is my fare calculated?",
    a: "The server uses a base fare for the chosen class plus distance and estimated time, then rounds to the nearest ₦50. The itemised breakdown is shown before you request. The quote is an estimate; the fare is locked when the server accepts your request."
  },
  {
    q: "How do I know I am getting into the right car?",
    a: "After a driver accepts, your trip page shows their name, vehicle, colour and plate. Once your 4-digit ride code is issued, the driver must enter it before starting the trip."
  },
  {
    q: "How do I get support?",
    a: "Use the NaijaDrive help centre or the active trip page. Support channels are listed only where the platform actually operates them; no response-time promise is invented here."
  },
  {
    q: "Can I become a driver?",
    a: "Driver access currently requires an approved DriverProfile created by the platform team. New driver applications are not open in this build. Approved partners can sign in to the driver workspace."
  }
] as const;

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function DriveLanding({
  viewer,
  serviceCities,
  initial
}: {
  viewer: Viewer;
  serviceCities: ServiceCity[];
  initial: { pickup: string; dropoff: string; vehicleClass: VehicleClassId };
}) {
  const [pickup, setPickup] = useState(initial.pickup);
  const [dropoff, setDropoff] = useState(initial.dropoff);
  const [vehicleClass, setVehicleClass] = useState<VehicleClassId>(initial.vehicleClass);
  const [savedPlaces, setSavedPlaces] = useState<ApiSavedPlace[]>([]);
  const [savedState, setSavedState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [locating, setLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState("");
  const [shortcutNotice, setShortcutNotice] = useState("");
  const [serviceSelection, setServiceSelection] = useState(`NG:${DRIVE_CITY}`);
  const [serviceResult, setServiceResult] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [installDismissed, setInstallDismissed] = useState(false);
  const [showInstallSteps, setShowInstallSteps] = useState(false);
  const platform = usePlatform();

  const pickupPlace = useMemo(() => findPlace(pickup), [pickup]);
  const dropoffPlace = useMemo(() => findPlace(dropoff), [dropoff]);

  // The route and class are seeded by the server from the URL, so a sign-in
  // round-trip or refresh never falls back to default landmarks. Only the
  // dismissible install notice is device state.
  useEffect(() => {
    try {
      setInstallDismissed(window.sessionStorage.getItem("nd_drive_install_dismissed") === "1");
    } catch {
      // Blocked storage must not stop booking.
    }
  }, []);

  useEffect(() => {
    if (!viewer) return;
    setSavedState("loading");
    const load = () => {
      apiClient
        .driveSavedPlaces()
        .then((places) => {
          setSavedPlaces(places);
          setSavedState("ready");
        })
        .catch(() => setSavedState("error"));
    };
    load();
    // Saved places are added inside the booking workspace; refresh the hero
    // shortcuts when the rider returns to this tab.
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [viewer]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("pickup", pickup);
    params.set("dropoff", dropoff);
    params.set("class", vehicleClass);
    const next = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
    window.history.replaceState(null, "", next);
  }, [pickup, dropoff, vehicleClass]);

  const homePlace = savedPlaces.find((place) => place.nickname.trim().toLowerCase() === "home");
  const workPlace = savedPlaces.find((place) => place.nickname.trim().toLowerCase() === "work");

  function applyShortcut(kind: "home" | "work") {
    const saved = kind === "home" ? homePlace : workPlace;
    if (!saved) {
      setShortcutNotice(
        `You have not saved a ${kind === "home" ? "Home" : "Work"} place yet. Add one in Saved places below.`
      );
      scrollTo("saved-places");
      return;
    }
    setDropoff(saved.placeId);
    setShortcutNotice(
      `Destination set to your saved ${kind === "home" ? "Home" : "Work"}: ${findPlace(saved.placeId)?.label ?? saved.placeId}.`
    );
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setLocationNotice("This browser cannot share a location. Pick a Lagos landmark instead.");
      return;
    }
    setLocating(true);
    setLocationNotice("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const nearest = nearestPlace({ lat: position.coords.latitude, lng: position.coords.longitude });
        if (!nearest) {
          setLocationNotice("No bookable landmark was found near your position.");
          return;
        }
        if (nearest.distanceMeters > 25_000) {
          setLocationNotice(
            `You are ${formatDistanceShort(nearest.distanceMeters)} from the nearest bookable Lagos landmark (${nearest.place.label}). NaijaDrive dispatch covers Lagos only; nothing was changed.`
          );
          return;
        }
        setPickup(nearest.place.id);
        setLocationNotice(
          nearest.distanceMeters < 150
            ? `Pick-up set to ${nearest.place.label}, where you are. Accuracy ±${Math.round(position.coords.accuracy)} m.`
            : `Pick-up set to the nearest bookable landmark, ${nearest.place.label}, ${formatDistanceShort(nearest.distanceMeters)} away. Accuracy ±${Math.round(position.coords.accuracy)} m.`
        );
      },
      (error) => {
        setLocating(false);
        setLocationNotice(
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. Pick a landmark instead — booking never requires GPS."
            : error.code === error.POSITION_UNAVAILABLE
              ? "Your device could not get a location fix. Check that location services are on, or pick a landmark."
              : "Location timed out. Pick a landmark or try again."
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  }

  function checkServiceArea() {
    if (serviceCities.length === 0) {
      setServiceResult({
        tone: "warn",
        text: "City activation records could not be loaded, so availability cannot be confirmed. No service claim is made."
      });
      return;
    }
    const [countryCode, city] = serviceSelection.split(":");
    const row = serviceCities.find((entry) => entry.countryCode === countryCode && entry.city === city);
    if (!row) {
      setServiceResult({ tone: "warn", text: "That city is not in the platform catalogue." });
      return;
    }
    const isDriveCity = row.city.toLowerCase() === DRIVE_CITY.toLowerCase();
    if (isDriveCity && row.enabled) {
      setServiceResult({
        tone: "ok",
        text: `${row.city} is activated and NaijaDrive passenger rides are dispatched here. Pick-up and destination use confirmed Lagos landmarks.`
      });
      return;
    }
    if (isDriveCity && !row.enabled) {
      setServiceResult({
        tone: "warn",
        text: `${row.city} is in the NaijaDrive catalogue, but its city activation is currently off in Control Center, so booking is unavailable.`
      });
      return;
    }
    if (row.enabled) {
      setServiceResult({
        tone: "warn",
        text: `${row.city} is activated for NaijaDeals commerce, but NaijaDrive passenger rides are dispatched in ${DRIVE_CITY} only today.`
      });
      return;
    }
    setServiceResult({
      tone: "warn",
      text: `${row.city} is not activated for NaijaDeals services. NaijaDrive does not operate there.`
    });
  }

  function dismissInstall() {
    setInstallDismissed(true);
    try {
      window.sessionStorage.setItem("nd_drive_install_dismissed", "1");
    } catch {
      /* ignore blocked storage */
    }
  }

  const installSteps =
    platform.capabilities.platform === "ios"
      ? [
          "Open this page in Safari.",
          "Tap the Share button.",
          "Choose “Add to Home Screen”, then Add."
        ]
      : platform.capabilities.platform === "android"
        ? [
            "Open the browser menu (⋮).",
            "Choose “Install app” or “Add to Home screen”.",
            "Confirm the install."
          ]
        : [
            "Use the install icon in your browser's address bar, or open the browser menu.",
            "Choose “Install NaijaDrive” / “Install app”.",
            "Confirm the install."
          ];

  return (
    <div className="min-h-screen bg-[#fbfcf9] text-[#14241b]">
      <DriveHeader viewer={viewer} />

      <div className="border-b border-[#eef1ef] bg-[#f7f3e8]">
        <div className="mx-auto flex max-w-[1320px] items-center gap-1.5 px-4 py-1.5 text-[10.5px] font-semibold text-[#5d6d64] sm:px-6 lg:px-8">
          <Link href="/" className="hover:text-[#0b5c33] hover:underline">
            NaijaDeals
          </Link>
          <ChevronRight className="h-3 w-3" aria-hidden />
          <span className="font-bold text-[#0b5c33]">NaijaDrive</span>
        </div>
      </div>

      <main>
        {/* Hero */}
        <section className="bg-[#0b5c33] text-white">
          <div className="mx-auto grid max-w-[1320px] gap-6 px-4 py-7 sm:px-6 lg:grid-cols-[1.04fr_0.96fr] lg:gap-10 lg:px-8 lg:py-10">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10.5px] font-bold">
                <Sparkles className="h-3.5 w-3.5 text-[#8ed14b]" aria-hidden />
                NaijaDrive by NaijaDeals · {DRIVE_CITY}
              </p>
              <h1 className="mt-3 font-display text-[38px] font-extrabold leading-[1.03] tracking-tight sm:text-[50px]">
                Your city. Your move.
              </h1>
              <p className="mt-2 max-w-xl text-[14px] leading-6 text-white/80 sm:text-[15px]">
                Everyday journeys, made easier with NaijaDrive. Real Lagos landmarks, server-calculated
                fares and approved drivers — no simulated live tracking.
              </p>

              <div id="book" className="mt-5 scroll-mt-24 rounded-[16px] bg-white p-3 text-[#14241b] shadow-[0_18px_50px_rgba(0,0,0,0.18)] sm:p-4">
                <div role="group" aria-label="Ride timing" className="grid grid-cols-2 gap-1 rounded-[10px] bg-[#f2f4f1] p-1">
                  <button
                    type="button"
                    aria-pressed="true"
                    className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[8px] bg-[#0b5c33] px-3 text-[12.5px] font-extrabold text-white ${focus}`}
                  >
                    <Car className="h-4 w-4" aria-hidden /> Ride now
                  </button>
                  <button
                    type="button"
                    disabled
                    aria-pressed="false"
                    title="Scheduled rides are not available in this build"
                    className="inline-flex min-h-10 cursor-not-allowed items-center justify-center gap-1.5 rounded-[8px] px-3 text-[12.5px] font-bold text-[#7d8a81]"
                  >
                    <CalendarClock className="h-4 w-4" aria-hidden /> Schedule
                    <span className="sr-only">(not available)</span>
                  </button>
                </div>

                <div className="mt-2 space-y-2">
                  <PlacePicker
                    id="drive-pickup"
                    label="Pick-up location"
                    value={pickup}
                    onChange={(placeId) => {
                      setPickup(placeId);
                      setShortcutNotice("");
                    }}
                    accent="pickup"
                    counterpartId={dropoff}
                    compact
                    placeholder="Enter pick-up location"
                  />
                  <PlacePicker
                    id="drive-dropoff"
                    label="Destination"
                    value={dropoff}
                    onChange={(placeId) => {
                      setDropoff(placeId);
                      setShortcutNotice("");
                    }}
                    accent="dropoff"
                    counterpartId={pickup}
                    compact
                    placeholder="Where are you going?"
                  />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyShortcut("home")}
                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[#dfe7df] px-3 text-[11px] font-bold text-[#33443a] hover:border-[#0b5c33]/40 hover:text-[#0b5c33] ${focus}`}
                  >
                    <MapPin className="h-3.5 w-3.5" aria-hidden /> Home
                  </button>
                  <button
                    type="button"
                    onClick={() => applyShortcut("work")}
                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[#dfe7df] px-3 text-[11px] font-bold text-[#33443a] hover:border-[#0b5c33]/40 hover:text-[#0b5c33] ${focus}`}
                  >
                    <Store className="h-3.5 w-3.5" aria-hidden /> Work
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShortcutNotice("");
                      scrollTo("saved-places");
                    }}
                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[#dfe7df] px-3 text-[11px] font-bold text-[#33443a] hover:border-[#0b5c33]/40 hover:text-[#0b5c33] ${focus}`}
                  >
                    <MapPin className="h-3.5 w-3.5" aria-hidden /> Saved places
                  </button>
                  <button
                    type="button"
                    onClick={useMyLocation}
                    disabled={locating}
                    className={`ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-full px-2 text-[11px] font-bold text-[#0b5c33] hover:bg-[#eaf5ec] disabled:opacity-60 ${focus}`}
                  >
                    {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <LocateFixed className="h-3.5 w-3.5" aria-hidden />}
                    {locating ? "Finding you…" : "Use my location"}
                  </button>
                </div>

                {shortcutNotice ? (
                  <p role="status" className="mt-2 rounded-lg bg-[#f7f3e8] px-2.5 py-2 text-[10.5px] font-semibold leading-4 text-[#6b5a2a]">
                    {shortcutNotice}
                  </p>
                ) : null}
                {locationNotice ? (
                  <p role="status" className="mt-2 rounded-lg bg-[#f2f7f2] px-2.5 py-2 text-[10.5px] font-semibold leading-4 text-[#33443a]">
                    {locationNotice}
                  </p>
                ) : null}

                <button
                  type="button"
                  onClick={() => scrollTo("ride-options")}
                  disabled={!pickupPlace || !dropoffPlace || pickup === dropoff}
                  className={`mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-[#16a34a] px-4 text-[13.5px] font-extrabold text-white hover:bg-[#128a3f] disabled:cursor-not-allowed disabled:opacity-50 ${focus}`}
                >
                  See ride options
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
                <p className="mt-1.5 text-center text-[10px] text-[#7d8a81]">
                  {savedState === "loading"
                    ? "Loading your saved places…"
                    : viewer
                      ? "Quotes are open to everyone. Your account keeps the trip history."
                      : "Sign in when you book. Your route and selected class are kept."}
                </p>
              </div>
            </div>

            <div className="relative min-h-[230px] overflow-hidden rounded-[18px] lg:min-h-[440px]">
              <img
                src="/brand-photography/drive-sedan-lagos.jpg"
                alt="A NaijaDrive driver in a branded green sedan on a Lagos road at sunset (brand illustration)"
                width={1280}
                height={853}
                fetchPriority="high"
                className="absolute inset-0 h-full w-full object-cover object-[63%_55%]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0b3d25]/55 via-transparent to-transparent" />
              <p className="absolute bottom-3 left-3 rounded-full bg-black/40 px-2.5 py-1 text-[9.5px] font-semibold text-white/90 backdrop-blur">
                Brand illustration · Lagos
              </p>
            </div>
          </div>
        </section>

        {/* Live booking/quote workspace */}
        <section className="mx-auto max-w-[1320px] px-4 py-7 sm:px-6 lg:px-8">
          <BookingWorkspace
            viewer={viewer}
            pickup={pickup}
            dropoff={dropoff}
            vehicleClass={vehicleClass}
            onSelectVehicle={setVehicleClass}
          />
          {!viewer ? (
            <section id="saved-places" className="mt-4 scroll-mt-24 rounded-2xl border border-[#e2e6e3] bg-white p-4">
              <h2 className="font-display text-[17px] font-extrabold text-[#14241b]">Saved places</h2>
              <p className="mt-1 text-[11.5px] leading-5 text-[#5d6d64]">
                Home, Work and other nicknames are stored on your NaijaDeals account, not in this
                browser. Sign in to add or use them.
              </p>
              <Link
                href={`/login?next=${encodeURIComponent(`/naijadrive?pickup=${pickup}&dropoff=${dropoff}&class=${vehicleClass}`)}`}
                className={`mt-2 inline-flex min-h-10 items-center rounded-xl bg-[#0b5c33] px-4 text-[11.5px] font-extrabold text-white ${focus}`}
              >
                Sign in to save places
              </Link>
            </section>
          ) : null}
        </section>

        {/* How it works */}
        <section className="bg-[#f7f3e8]">
          <div className="mx-auto max-w-[1320px] px-4 py-8 sm:px-6 lg:px-8">
            <h2 className="font-display text-[24px] font-extrabold text-[#14241b] sm:text-[28px]">
              Your next ride in three simple steps
            </h2>
            <ol className="mt-4 grid gap-4 sm:grid-cols-3">
              {([
                ["1", "Enter your journey", "Tell us where to pick you up and where you are going. Search works from Lagos landmarks and local aliases.", MapPin],
                ["2", "Choose your ride", "Compare real server quotes for Standard, Comfort, XL or Bike. The fare is locked when you request.", Car],
                ["3", "Meet your driver", "Match the approved driver, vehicle and plate. Track the real assigned vehicle, or see an honest offline state.", Users]
              ] as const).map(([number, title, body, Icon]) => {
                const Glyph = Icon as typeof MapPin;
                return (
                  <li key={String(number)} className="rounded-2xl bg-white p-4 ring-1 ring-[#e6ece6]">
                    <div className="flex items-center gap-2">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-[#eaf5ec] font-display text-[13px] font-extrabold text-[#0b5c33]">
                        {number}
                      </span>
                      <Glyph className="h-5 w-5 text-[#0b5c33]" aria-hidden />
                    </div>
                    <h3 className="mt-2 text-[14px] font-extrabold text-[#14241b]">{title}</h3>
                    <p className="mt-1 text-[11.5px] leading-5 text-[#5d6d64]">{body}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* NaijaEats handoff */}
        <section className="bg-[#edf5e8]">
          <div className="mx-auto grid max-w-[1320px] gap-5 px-4 py-8 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:px-8">
            <div>
              <p className="flex items-center gap-1.5 text-[12px] font-extrabold text-[#0b5c33]">
                <Package className="h-4 w-4" aria-hidden /> NaijaEats
              </p>
              <h2 className="mt-1 font-display text-[28px] font-extrabold leading-tight text-[#14241b] sm:text-[34px]">
                Your next meal. Delivered.
              </h2>
              <p className="mt-1.5 max-w-lg text-[12.5px] leading-6 text-[#5d6d64]">
                Discover Nigerian favourites and local restaurants. The delivery address here is separate
                from your ride destination, so ordering food never changes your trip.
              </p>
              <form action="/naijaeats/restaurants" method="get" className="mt-3 flex max-w-lg flex-col gap-2 sm:flex-row">
                <label className="flex min-h-11 flex-1 items-center gap-2 rounded-full border border-[#d7e3d2] bg-white px-3">
                  <span className="sr-only">NaijaEats delivery address</span>
                  <MapPin className="h-4 w-4 shrink-0 text-[#7d8a81]" aria-hidden />
                  <input
                    name="address"
                    type="text"
                    autoComplete="street-address"
                    placeholder="Enter delivery address"
                    className="min-h-10 w-full min-w-0 bg-transparent text-[12.5px] outline-none placeholder:text-[#7d8a81]"
                  />
                </label>
                <button
                  type="submit"
                  className={`inline-flex min-h-11 items-center justify-center rounded-full bg-[#0b5c33] px-5 text-[12.5px] font-extrabold text-white hover:bg-[#0a4a29] ${focus}`}
                >
                  Explore NaijaEats
                </button>
              </form>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {eatsCategories.map(([label, href]) => (
                  <li key={label}>
                    <Link href={href} className="inline-flex min-h-8 items-center rounded-full bg-white px-3 text-[10.5px] font-bold text-[#33443a] ring-1 ring-[#d7e3d2] hover:text-[#0b5c33]">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative min-h-[220px] overflow-hidden rounded-[18px] lg:min-h-[300px]">
              <img
                src="/brand-photography/eats-jollof-delivery.jpg"
                alt="A NaijaEats delivery bag beside a box of jollof rice, grilled chicken and plantain (brand illustration)"
                width={1024}
                height={768}
                className="absolute inset-0 h-full w-full object-cover object-[58%_62%]"
                loading="lazy"
              />
            </div>
          </div>
        </section>

        {/* Safety */}
        <section id="safety" className="scroll-mt-24 bg-white">
          <div className="mx-auto max-w-[1320px] px-4 py-8 sm:px-6 lg:px-8">
            <h2 className="font-display text-[24px] font-extrabold text-[#14241b] sm:text-[28px]">
              Know your ride. Travel with confidence.
            </h2>
            <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="relative min-h-[240px] overflow-hidden rounded-2xl">
                <img
                  src="/brand-photography/drive-suv-lagos.jpg"
                  alt="A NaijaDrive branded SUV in Lagos with a driver beside it (brand illustration)"
                  width={1280}
                  height={853}
                  className="absolute inset-0 h-full w-full object-cover object-[55%_55%]"
                  loading="lazy"
                />
                <p className="absolute bottom-3 left-3 rounded-full bg-black/40 px-2.5 py-1 text-[9.5px] font-semibold text-white/90 backdrop-blur">
                  Brand illustration · Lagos
                </p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                {([
                  [Car, "Driver & vehicle details", "The approved driver's name, vehicle and plate appear only after a real assignment."],
                  [Sparkles, "Share your journey", "Send a text summary of the trip to a trusted contact. It is not a public live link."],
                  [ShieldCheck, "Pickup verification", "When your 4-digit ride code is issued, the driver must enter it before the trip starts."],
                  [Users, "Help when you need it", "Open the trip page or help centre. Support channels are listed only where they actually operate."]
                ] as const).map(([Icon, title, body]) => {
                  const Glyph = Icon as typeof ShieldCheck;
                  return (
                    <li key={String(title)} className="rounded-2xl bg-[#f7f8f6] p-3.5 ring-1 ring-[#e6ece6]">
                      <Glyph className="h-5 w-5 text-[#0b5c33]" aria-hidden />
                      <h3 className="mt-2 text-[13px] font-extrabold text-[#14241b]">{title}</h3>
                      <p className="mt-1 text-[11px] leading-5 text-[#5d6d64]">{body}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>

        {/* Airport journey */}
        <section id="airport" className="scroll-mt-24 bg-[#fbfcf9]">
          <div className="mx-auto max-w-[1320px] px-4 py-8 sm:px-6 lg:px-8">
            <div className="grid overflow-hidden rounded-[20px] bg-[#0b3d25] text-white lg:grid-cols-[0.9fr_1.1fr]">
              <div className="p-5 sm:p-7">
                <p className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-bold">
                  <Plane className="h-3.5 w-3.5 text-[#8ed14b]" aria-hidden /> Airport journey
                </p>
                <h2 className="mt-3 font-display text-[27px] font-extrabold leading-tight sm:text-[32px]">
                  From your doorstep to departures.
                </h2>
                <p className="mt-2 max-w-xl text-[12px] leading-6 text-white/80">
                  Murtala Muhammed International Airport is a bookable Lagos landmark. Airport is a
                  journey type, not a separate vehicle class: you still choose Standard, Comfort, XL or
                  Bike, and the fare comes from the same server quote.
                </p>
                <ul className="mt-3 space-y-1.5 text-[11px] text-white/75">
                  <li className="flex gap-1.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8ed14b]" aria-hidden /> Real airport landmark, not an invented terminal address.</li>
                  <li className="flex gap-1.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8ed14b]" aria-hidden /> No airport surcharge is added by this build.</li>
                  <li className="flex gap-1.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8ed14b]" aria-hidden /> Works for arrivals too — set the airport as your pick-up.</li>
                </ul>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (pickup === "mmia") setPickup("computer-village");
                      setDropoff("mmia");
                      scrollTo("ride-options");
                    }}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#16a34a] px-4 text-[12px] font-extrabold text-white hover:bg-[#128a3f] ${focus}`}
                  >
                    <Plane className="h-4 w-4" aria-hidden /> Plan a ride to the airport
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (dropoff === "mmia") setDropoff("victoria-island");
                      setPickup("mmia");
                      scrollTo("ride-options");
                    }}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/30 px-4 text-[12px] font-bold text-white hover:bg-white/10 ${focus}`}
                  >
                    I am arriving
                  </button>
                </div>
              </div>
              <div className="relative min-h-[220px] lg:min-h-full">
                <img
                  src="/brand-photography/drive-suv-lagos.jpg"
                  alt="A NaijaDrive SUV ready for an airport journey in Lagos (brand illustration)"
                  width={1280}
                  height={853}
                  className="absolute inset-0 h-full w-full object-cover object-[58%_50%]"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-[#0b3d25] via-transparent to-transparent" />
              </div>
            </div>
          </div>
        </section>

        {/* Driver recruitment */}
        <section id="drive-with-us" className="scroll-mt-24 bg-[#0b5c33] text-white">
          <div className="mx-auto grid max-w-[1320px] gap-4 px-4 py-8 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8">
            <div>
              <h2 className="font-display text-[28px] font-extrabold leading-tight sm:text-[34px]">
                Drive your city forward.
              </h2>
              <p className="mt-1.5 max-w-xl text-[12.5px] leading-6 text-white/80">
                Approved NaijaDrive partners can go online, receive passenger ride requests in Lagos and
                keep a server-recorded online history. Food-delivery eligibility is separate.
              </p>
              <div id="driver-requirements" className="mt-3 scroll-mt-24 rounded-xl bg-white/10 p-3 text-[11px] leading-5 text-white/85">
                <p className="font-extrabold text-white">Driver requirements</p>
                <ul className="mt-1 grid gap-1 sm:grid-cols-2">
                  <li>Approved DriverProfile (admin review)</li>
                  <li>Licence number on file</li>
                  <li>Approved vehicle, plate and class</li>
                  <li>Lagos service zone</li>
                  <li>Browser location while online</li>
                  <li>Separate food/parcel eligibility</li>
                </ul>
                <p className="mt-2 text-[10.5px] text-white/65">
                  New driver applications are not open in this build. Only existing approved partners can
                  sign in to the workspace.
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={viewer?.isDriver ? "/driver" : "/login?next=/driver"}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-[12px] font-extrabold text-[#0b5c33] hover:bg-[#f2f7f2] ${focus}`}
                >
                  {viewer?.isDriver ? "Open driver workspace" : "Driver sign in"}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link
                  href="/naijadrive/help#drivers"
                  className={`inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/30 px-4 text-[12px] font-bold text-white hover:bg-white/10 ${focus}`}
                >
                  Driver support
                </Link>
              </div>
            </div>
            <div className="relative min-h-[220px] overflow-hidden rounded-2xl lg:min-h-[300px]">
              <img
                src="/brand-photography/drive-sedan-lagos.jpg"
                alt="A NaijaDrive driver ready for a passenger trip in Lagos (brand illustration)"
                width={1280}
                height={853}
                className="absolute inset-0 h-full w-full object-cover object-[68%_52%]"
                loading="lazy"
              />
            </div>
          </div>
        </section>

        {/* Food and parcel partners */}
        <section className="bg-[#eef5e9]">
          <div className="mx-auto max-w-[1320px] px-4 py-8 sm:px-6 lg:px-8">
            <h2 className="font-display text-[24px] font-extrabold text-[#14241b] sm:text-[28px]">
              Deliver food or parcels
            </h2>
            <p className="mt-1 max-w-2xl text-[12px] leading-6 text-[#5d6d64]">
              Earn with delivery work that is separate from passenger-ride approval. NaijaSend is parcel
              and logistics delivery — not money transfer — and NaijaEats food delivery has its own
              eligibility requirements.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Link href="/naijaeats/courier" className="group flex items-start gap-3 rounded-2xl bg-white p-4 ring-1 ring-[#e6ece6] hover:ring-[#0b5c33]/35">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#eaf5ec] text-[#0b5c33]">
                  <Bike className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-extrabold text-[#14241b]">Deliver food with NaijaEats</span>
                  <span className="mt-1 block text-[11.5px] leading-5 text-[#5d6d64]">
                    Courier and rider work for food orders. Food eligibility is not passenger-ride
                    approval.
                  </span>
                  <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-[#0b5c33]">
                    See NaijaEats courier <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </span>
                </span>
              </Link>
              <Link href="/naijasend/driver/jobs" className="group flex items-start gap-3 rounded-2xl bg-white p-4 ring-1 ring-[#e6ece6] hover:ring-[#0b5c33]/35">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#eaf5ec] text-[#0b5c33]">
                  <Package className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-extrabold text-[#14241b]">Deliver parcels with NaijaSend</span>
                  <span className="mt-1 block text-[11.5px] leading-5 text-[#5d6d64]">
                    Parcel and logistics work across Nigeria. NaijaSend moves packages; it is not a money
                    transfer service.
                  </span>
                  <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-[#0b5c33]">
                    See parcel jobs <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </span>
                </span>
              </Link>
            </div>
          </div>
        </section>

        {/* Ecosystem */}
        <section className="bg-white">
          <div className="mx-auto max-w-[1320px] px-4 py-8 sm:px-6 lg:px-8">
            <h2 className="font-display text-[22px] font-extrabold text-[#14241b] sm:text-[26px]">
              More possibilities. One NaijaDeals.
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
              {([
                ["NaijaSend", "Parcels", "/naijasend", Package],
                ["NaijaShop", "Shopping", "/naijashop", ShoppingBag],
                ["NaijaStay", "Stays", "/naijastay", Store],
                ["NaijaPay", "Payments", "/pay", Wallet]
              ] as const).map(([name, label, href, Icon]) => {
                const Glyph = Icon as typeof Package;
                return (
                  <Link key={String(name)} href={String(href)} className="flex items-center gap-2.5 rounded-xl bg-[#f7f8f6] p-3 ring-1 ring-[#e6ece6] hover:bg-[#eef5e9]">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-white text-[#0b5c33] ring-1 ring-[#e6ece6]">
                      <Glyph className="h-4 w-4" aria-hidden />
                    </span>
                    <span>
                      <span className="block text-[12.5px] font-extrabold text-[#14241b]">{name}</span>
                      <span className="block text-[10px] text-[#5d6d64]">{label}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* Service area */}
        <section id="service-area" className="scroll-mt-24 bg-[#f7f3e8]">
          <div className="mx-auto max-w-[1320px] px-4 py-8 sm:px-6 lg:px-8">
            <div className="grid gap-4 rounded-2xl bg-white p-4 ring-1 ring-[#e6ece6] lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <h2 className="font-display text-[22px] font-extrabold text-[#14241b] sm:text-[26px]">
                  Where will you go next?
                </h2>
                <p className="mt-1 max-w-xl text-[11.5px] leading-5 text-[#5d6d64]">
                  Check the platform&apos;s real country and city activation. NaijaDrive ride dispatch is a
                  separate capability and currently covers {DRIVE_CITY} only.
                </p>
                <label htmlFor="service-city" className="mt-3 block text-[10px] font-black uppercase tracking-wide text-[#5d6d64]">
                  Country and city
                </label>
                <select
                  id="service-city"
                  value={serviceSelection}
                  onChange={(event) => {
                    setServiceSelection(event.target.value);
                    setServiceResult(null);
                  }}
                  className="mt-1 min-h-11 w-full max-w-md rounded-xl border border-[#dfe7df] bg-white px-3 text-[12.5px] font-semibold"
                >
                  {serviceCities.length === 0 ? <option value={`NG:${DRIVE_CITY}`}>{DRIVE_CITY}</option> : null}
                  {serviceCities.map((city) => (
                    <option key={`${city.countryCode}:${city.city}`} value={`${city.countryCode}:${city.city}`}>
                      {city.countryName} · {city.city} {city.enabled ? "(activated)" : "(not activated)"}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={checkServiceArea}
                  className={`mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#16a34a] px-5 text-[12px] font-extrabold text-white hover:bg-[#128a3f] ${focus}`}
                >
                  Check availability
                </button>
                {serviceResult ? (
                  <p
                    role="status"
                    className={`mt-2 rounded-xl px-3 py-2 text-[11.5px] font-semibold leading-5 ${
                      serviceResult.tone === "ok" ? "bg-[#eaf5ec] text-[#0b5c33]" : "bg-[#fff3e8] text-[#a3480f]"
                    }`}
                  >
                    {serviceResult.text}
                  </p>
                ) : null}
                {serviceCities.length === 0 ? (
                  <p className="mt-2 text-[11px] font-semibold text-[#a3480f]">
                    City activation records could not be loaded. The checker will not invent availability.
                  </p>
                ) : null}
              </div>
              <div className="rounded-xl bg-[#f7f8f6] p-3 text-[10.5px] leading-5 text-[#5d6d64]">
                <p className="font-extrabold text-[#14241b]">How this is checked</p>
                <p className="mt-1">
                  Activation comes from Control Center country and city settings. A city can be active
                  for NaijaDeals commerce without having NaijaDrive ride dispatch.
                </p>
                <p className="mt-1">Services vary by location.</p>
              </div>
            </div>
          </div>
        </section>

        {/* PWA install */}
        {!installDismissed ? (
          <section className="bg-[#fbfcf9]">
            <div className="mx-auto max-w-[1320px] px-4 py-6 sm:px-6 lg:px-8">
              <div className="relative flex flex-col gap-3 rounded-2xl bg-[#eef5e9] p-4 ring-1 ring-[#d7e3d2] sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={dismissInstall}
                  aria-label="Dismiss app install offer"
                  className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full text-[#5d6d64] hover:bg-white/70"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-[#0b5c33] ring-1 ring-[#d7e3d2]">
                  <Smartphone className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-[18px] font-extrabold text-[#14241b]">
                    Take NaijaDeals with you.
                  </h2>
                  <p className="mt-0.5 text-[11.5px] leading-5 text-[#5d6d64]">
                    Install the web app for convenient access to NaijaDrive and the rest of the
                    ecosystem. Installation is optional and never blocks the website.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {platform.installed ? (
                    <span className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#0b5c33] px-4 text-[11.5px] font-extrabold text-white">
                      <Check className="h-3.5 w-3.5" aria-hidden /> Installed
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => (platform.canPromptInstall ? void platform.install() : setShowInstallSteps((open) => !open))}
                      className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#0b5c33] px-4 text-[11.5px] font-extrabold text-white hover:bg-[#0a4a29] ${focus}`}
                    >
                      {platform.canPromptInstall ? "Install NaijaDeals" : "How to install"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={dismissInstall}
                    className="inline-flex min-h-10 items-center rounded-xl border border-[#cfdccf] bg-white px-3 text-[11.5px] font-bold text-[#33443a]"
                  >
                    Continue on web
                  </button>
                </div>
                {showInstallSteps || (platform.capabilities.platform === "ios" && !platform.installed) ? (
                  <ol className="w-full list-decimal space-y-0.5 pl-5 text-[10.5px] leading-5 text-[#5d6d64] sm:w-auto sm:basis-full">
                    {installSteps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {/* FAQ */}
        <section id="faq" className="scroll-mt-24 bg-white">
          <div className="mx-auto max-w-[1000px] px-4 py-8 sm:px-6 lg:px-8">
            <h2 className="font-display text-[24px] font-extrabold text-[#14241b] sm:text-[28px]">
              Good questions. Clear answers.
            </h2>
            <div className="mt-3 divide-y divide-[#e6ece6] rounded-2xl ring-1 ring-[#e6ece6]">
              {faqs.map((faq) => (
                <details key={faq.q} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[12.5px] font-bold text-[#14241b] marker:content-none">
                    {faq.q}
                    <ChevronRight className="h-4 w-4 shrink-0 text-[#5d6d64] transition group-open:rotate-90" aria-hidden />
                  </summary>
                  <p className="px-4 pb-3 text-[11.5px] leading-6 text-[#5d6d64]">{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

      </main>

      <DriveFooter />
    </div>
  );
}
