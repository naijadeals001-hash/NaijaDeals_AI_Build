/**
 * NaijaDrive operating configuration.
 *
 * Rides are only bookable in Lagos in this environment. Places are named pick-up
 * and drop-off points with real coordinates so quotes are computed, not invented.
 * The fare is an estimate locked when the rider requests the ride: base fare plus
 * distance and estimated time for the chosen vehicle class, in NGN kobo.
 *
 * This file is imported by both the server (quote validation) and the client
 * (selectors), so it must stay free of server-only imports.
 */

export const DRIVE_COUNTRY = "NG";
export const DRIVE_CITY = "Lagos";
export const DRIVE_CURRENCY = "NGN";

/**
 * Bookable zones group landmarks along the axes Lagos drivers actually think in.
 * Used for grouping the pick-up search list, never for pricing.
 */
export const DRIVE_ZONES = ["Ikeja", "Mainland", "Island", "Lekki–Ajah"] as const;
export type DriveZone = (typeof DRIVE_ZONES)[number];

export type DrivePlace = {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
  /** Landmark grouping shown in the picker. */
  zone: DriveZone;
  /** Names Lagosians actually type, so search works without exact wording. */
  aliases: string[];
};

export const DRIVE_PLACES: DrivePlace[] = [
  {
    id: "computer-village",
    label: "Computer Village, Ikeja",
    address: "Adeniyi Jones Road, Computer Village, Ikeja, Lagos",
    lat: 6.5965,
    lng: 3.3421,
    zone: "Ikeja",
    aliases: ["CV", "Ikeja market", "phone market", "Otigba"]
  },
  {
    id: "ikeja-city-mall",
    label: "Ikeja City Mall",
    address: "Obafemi Awolowo Way, Alausa, Ikeja, Lagos",
    lat: 6.6026,
    lng: 3.3579,
    zone: "Ikeja",
    aliases: ["ICM", "Alausa mall", "Shoprite Alausa"]
  },
  {
    id: "mmia",
    label: "Murtala Muhammed Airport",
    address: "Murtala Muhammed International Airport, Ikeja, Lagos",
    lat: 6.5774,
    lng: 3.3212,
    zone: "Ikeja",
    aliases: ["airport", "MMIA", "local airport", "international airport", "Ikeja airport"]
  },
  {
    id: "allen-avenue",
    label: "Allen Avenue",
    address: "Allen Avenue, Ikeja, Lagos",
    lat: 6.6006,
    lng: 3.3515,
    zone: "Ikeja",
    aliases: ["Allen", "Allen roundabout"]
  },
  {
    id: "yaba-tejuosho",
    label: "Tejuosho, Yaba",
    address: "Tejuosho Market, Yaba, Lagos",
    lat: 6.5005,
    lng: 3.3755,
    zone: "Mainland",
    aliases: ["Tejuosho", "Yaba market", "Yabatech", "Herbert Macaulay"]
  },
  {
    id: "surulere",
    label: "Surulere, Shoprite",
    address: "Shoprite Surulere, Eric Moore Road, Lagos",
    lat: 6.4969,
    lng: 3.3481,
    zone: "Mainland",
    aliases: ["Surulere", "Eric Moore", "Shoprite Surulere", "Stadium"]
  },
  {
    id: "victoria-island",
    label: "Bar Beach, Victoria Island",
    address: "Bar Beach, Ahmadu Bello Way, Victoria Island, Lagos",
    lat: 6.4281,
    lng: 3.4219,
    zone: "Island",
    aliases: ["VI", "Bar Beach", "Ahmadu Bello Way", "Eko Hotel"]
  },
  {
    id: "lekki-phase-1",
    label: "Lekki Phase 1",
    address: "Admiralty Way, Lekki Phase 1, Lagos",
    lat: 6.4478,
    lng: 3.4723,
    zone: "Lekki–Ajah",
    aliases: ["Lekki 1", "Admiralty Way", "Lekki Phase One"]
  },
  {
    id: "ikoyi-falomo",
    label: "Falomo, Ikoyi",
    address: "Falomo Roundabout, Ikoyi, Lagos",
    lat: 6.449,
    lng: 3.433,
    zone: "Island",
    aliases: ["Falomo", "Ikoyi", "Awolowo Road"]
  },
  {
    id: "gbagada",
    label: "Gbagada",
    address: "Gbagada Expressway, Lagos",
    lat: 6.5556,
    lng: 3.3833,
    zone: "Mainland",
    aliases: ["Gbagada Expressway", "Ifako", "Soluade"]
  },
  {
    id: "maryland",
    label: "Maryland Mall",
    address: "Maryland Mall, Ikorodu Road, Lagos",
    lat: 6.573,
    lng: 3.366,
    zone: "Mainland",
    aliases: ["Maryland", "Ikorodu Road", "Mende"]
  },
  {
    id: "apapa",
    label: "Apapa Wharf",
    address: "Wharf Road, Apapa, Lagos",
    lat: 6.4489,
    lng: 3.3596,
    zone: "Mainland",
    aliases: ["Apapa", "Wharf", "port", "Tin Can"]
  },
  {
    id: "festac",
    label: "Festac Town",
    address: "Festac Town, Amuwo Odofin, Lagos",
    lat: 6.4667,
    lng: 3.2833,
    zone: "Mainland",
    aliases: ["Festac", "Amuwo", "Mile 2", "2nd Avenue"]
  },
  {
    id: "ajah",
    label: "Ajah, Awoyaya",
    address: "Lekki-Epe Expressway, Ajah, Lagos",
    lat: 6.4667,
    lng: 3.5667,
    zone: "Lekki–Ajah",
    aliases: ["Ajah", "Awoyaya", "Lekki-Epe", "Sangotedo", "Abraham Adesanya"]
  }
];

export type VehicleClassId = "bike" | "economy" | "comfort" | "xl";

export type VehicleClass = {
  id: VehicleClassId;
  label: string;
  description: string;
  seats: number;
  baseKobo: number;
  perKmKobo: number;
  perMinuteKobo: number;
};

export const VEHICLE_CLASSES: VehicleClass[] = [
  {
    id: "bike",
    label: "Bike",
    description: "One rider, fastest through Lagos traffic.",
    seats: 1,
    baseKobo: 40000,
    perKmKobo: 11000,
    perMinuteKobo: 1500
  },
  {
    id: "economy",
    label: "Economy",
    description: "Everyday saloon car for up to 4 riders.",
    seats: 4,
    baseKobo: 70000,
    perKmKobo: 18000,
    perMinuteKobo: 2500
  },
  {
    id: "comfort",
    label: "Comfort",
    description: "Newer car with more legroom for up to 4 riders.",
    seats: 4,
    baseKobo: 120000,
    perKmKobo: 26000,
    perMinuteKobo: 3500
  },
  {
    id: "xl",
    label: "XL",
    description: "SUV or van for up to 6 riders and extra luggage.",
    seats: 6,
    baseKobo: 180000,
    perKmKobo: 34000,
    perMinuteKobo: 4500
  }
];

export type DriveFareBreakdown = {
  /** Base fare for the chosen class. */
  baseKobo: number;
  /** Distance component before rounding. */
  distanceKobo: number;
  /** Estimated time component before rounding. */
  timeKobo: number;
  /** Rounding applied to reach the quoted fare. May be negative. */
  adjustmentKobo: number;
};

export type DriveQuote = {
  pickup: DrivePlace;
  dropoff: DrivePlace;
  vehicleClass: VehicleClass;
  distanceMeters: number;
  durationMinutes: number;
  fareKobo: number;
  currency: string;
  /**
   * The same fare, itemised. baseKobo + distanceKobo + timeKobo + adjustmentKobo
   * always equals fareKobo exactly, so the rider can check the arithmetic.
   */
  breakdown: DriveFareBreakdown;
};

export function findPlace(id: string | null | undefined) {
  return DRIVE_PLACES.find((place) => place.id === id) ?? null;
}

/** Lowercase, strip accents and collapse whitespace so "Lekki—Ajah" matches "lekki ajah". */
function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Offline landmark search. Runs on bundled data only — no geocoding service, no
 * network round trip — so it keeps working on a 2G connection or with the map
 * tiles switched off entirely.
 */
export function searchPlaces(query: string, places: DrivePlace[] = DRIVE_PLACES): DrivePlace[] {
  const needle = normalize(query);
  if (!needle) return places;

  const scored: Array<{ place: DrivePlace; score: number }> = [];
  for (const place of places) {
    const label = normalize(place.label);
    const aliasHit = place.aliases.some((alias) => normalize(alias).includes(needle));
    const addressHit = normalize(place.address).includes(needle);
    const zoneHit = normalize(place.zone).includes(needle);

    let score: number | null = null;
    if (label.startsWith(needle)) score = 0;
    else if (label.includes(needle)) score = 1;
    else if (aliasHit) score = 2;
    else if (zoneHit) score = 3;
    else if (addressHit) score = 4;
    if (score !== null) scored.push({ place, score });
  }

  return scored.sort((a, b) => a.score - b.score || a.place.label.localeCompare(b.place.label)).map((entry) => entry.place);
}

/**
 * Snap real device coordinates to the closest bookable landmark. NaijaDrive books
 * between named places, so this never invents an address: it reports the landmark
 * that was actually nearest and how far away it is.
 */
export function nearestPlace(
  point: { lat: number; lng: number },
  places: DrivePlace[] = DRIVE_PLACES
): { place: DrivePlace; distanceMeters: number } | null {
  let best: { place: DrivePlace; distanceMeters: number } | null = null;
  for (const place of places) {
    const distanceMeters = haversineMeters(point, place);
    if (!best || distanceMeters < best.distanceMeters) best = { place, distanceMeters };
  }
  return best;
}

/** Short human distance used in the picker and map: "350 m" or "2.4 km". */
export function formatDistanceShort(meters: number) {
  if (!Number.isFinite(meters) || meters < 0) return "—";
  if (meters < 950) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function findVehicleClass(id: string | null | undefined) {
  return VEHICLE_CLASSES.find((vehicle) => vehicle.id === id) ?? null;
}

/** Great-circle distance in metres between two coordinates. */
export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const earthRadius = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

/** Lagos road distance is longer than the straight line; 1.35 is a conservative road factor. */
const ROAD_FACTOR = 1.35;
/** Average city speed used only to estimate duration. */
const AVERAGE_KMH = 22;

export function quoteDrive(input: {
  pickupId: string | null | undefined;
  dropoffId: string | null | undefined;
  vehicleClassId: string | null | undefined;
}): DriveQuote | null {
  const pickup = findPlace(input.pickupId);
  const dropoff = findPlace(input.dropoffId);
  const vehicleClass = findVehicleClass(input.vehicleClassId);
  if (!pickup || !dropoff || !vehicleClass) return null;
  if (pickup.id === dropoff.id) return null;

  const distanceMeters = Math.round(haversineMeters(pickup, dropoff) * ROAD_FACTOR);
  const distanceKm = distanceMeters / 1000;
  const durationMinutes = Math.max(4, Math.ceil((distanceKm / AVERAGE_KMH) * 60) + 3);
  const distanceKobo = Math.round(vehicleClass.perKmKobo * distanceKm);
  const timeKobo = vehicleClass.perMinuteKobo * durationMinutes;
  const rawKobo = vehicleClass.baseKobo + distanceKobo + timeKobo;
  // Round to the nearest NGN 50 so the quote reads like a real fare, while staying integer kobo.
  const fareKobo = Math.max(vehicleClass.baseKobo, Math.round(rawKobo / 5000) * 5000);

  return {
    pickup,
    dropoff,
    vehicleClass,
    distanceMeters,
    durationMinutes,
    fareKobo,
    currency: DRIVE_CURRENCY,
    breakdown: {
      baseKobo: vehicleClass.baseKobo,
      distanceKobo,
      timeKobo,
      adjustmentKobo: fareKobo - rawKobo
    }
  };
}

/* ------------------------------------------------------------------ timing --- */

/**
 * How long an assigned driver has to make the next move before the ride returns to
 * the open queue. Lagos traffic is real, so this is deliberately generous: the point
 * is to stop a silent driver parking a rider forever, not to punish a slow one.
 */
export const DRIVE_ASSIGNMENT_GRACE_MINUTES = 10;

/** Deadline for the next driver action. `null` means nothing is pending. */
export function nextAssignmentDeadline(now: Date = new Date()) {
  return new Date(now.getTime() + DRIVE_ASSIGNMENT_GRACE_MINUTES * 60 * 1000);
}
