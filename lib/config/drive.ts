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

export type DrivePlace = {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
};

export const DRIVE_PLACES: DrivePlace[] = [
  {
    id: "computer-village",
    label: "Computer Village, Ikeja",
    address: "Adeniyi Jones Road, Computer Village, Ikeja, Lagos",
    lat: 6.5965,
    lng: 3.3421
  },
  {
    id: "ikeja-city-mall",
    label: "Ikeja City Mall",
    address: "Obafemi Awolowo Way, Alausa, Ikeja, Lagos",
    lat: 6.6026,
    lng: 3.3579
  },
  {
    id: "mmia",
    label: "Murtala Muhammed Airport",
    address: "Murtala Muhammed International Airport, Ikeja, Lagos",
    lat: 6.5774,
    lng: 3.3212
  },
  {
    id: "allen-avenue",
    label: "Allen Avenue",
    address: "Allen Avenue, Ikeja, Lagos",
    lat: 6.6006,
    lng: 3.3515
  },
  {
    id: "yaba-tejuosho",
    label: "Tejuosho, Yaba",
    address: "Tejuosho Market, Yaba, Lagos",
    lat: 6.5005,
    lng: 3.3755
  },
  {
    id: "surulere",
    label: "Surulere, Shoprite",
    address: "Shoprite Surulere, Eric Moore Road, Lagos",
    lat: 6.4969,
    lng: 3.3481
  },
  {
    id: "victoria-island",
    label: "Bar Beach, Victoria Island",
    address: "Bar Beach, Ahmadu Bello Way, Victoria Island, Lagos",
    lat: 6.4281,
    lng: 3.4219
  },
  {
    id: "lekki-phase-1",
    label: "Lekki Phase 1",
    address: "Admiralty Way, Lekki Phase 1, Lagos",
    lat: 6.4478,
    lng: 3.4723
  },
  {
    id: "ikoyi-falomo",
    label: "Falomo, Ikoyi",
    address: "Falomo Roundabout, Ikoyi, Lagos",
    lat: 6.449,
    lng: 3.433
  },
  {
    id: "gbagada",
    label: "Gbagada",
    address: "Gbagada Expressway, Lagos",
    lat: 6.5556,
    lng: 3.3833
  },
  {
    id: "maryland",
    label: "Maryland Mall",
    address: "Maryland Mall, Ikorodu Road, Lagos",
    lat: 6.573,
    lng: 3.366
  },
  {
    id: "apapa",
    label: "Apapa Wharf",
    address: "Wharf Road, Apapa, Lagos",
    lat: 6.4489,
    lng: 3.3596
  },
  {
    id: "festac",
    label: "Festac Town",
    address: "Festac Town, Amuwo Odofin, Lagos",
    lat: 6.4667,
    lng: 3.2833
  },
  {
    id: "ajah",
    label: "Ajah, Awoyaya",
    address: "Lekki-Epe Expressway, Ajah, Lagos",
    lat: 6.4667,
    lng: 3.5667
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

export type DriveQuote = {
  pickup: DrivePlace;
  dropoff: DrivePlace;
  vehicleClass: VehicleClass;
  distanceMeters: number;
  durationMinutes: number;
  fareKobo: number;
  currency: string;
};

export function findPlace(id: string | null | undefined) {
  return DRIVE_PLACES.find((place) => place.id === id) ?? null;
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
  const rawKobo =
    vehicleClass.baseKobo + vehicleClass.perKmKobo * distanceKm + vehicleClass.perMinuteKobo * durationMinutes;
  // Round to the nearest NGN 50 so the quote reads like a real fare, while staying integer kobo.
  const fareKobo = Math.max(vehicleClass.baseKobo, Math.round(rawKobo / 5000) * 5000);

  return {
    pickup,
    dropoff,
    vehicleClass,
    distanceMeters,
    durationMinutes,
    fareKobo,
    currency: DRIVE_CURRENCY
  };
}
