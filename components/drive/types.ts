import type { ApiDriveQuote, ApiRide, ApiSavedPlace } from "@/lib/api-client";

export type { ApiDriveQuote, ApiRide, ApiSavedPlace };

export type ServiceCity = {
  countryCode: string;
  countryName: string;
  city: string;
  code: string;
  enabled: boolean;
  source: "database" | "configuration";
  updatedAt: string | null;
};

export type DriveRouteStep = {
  instruction: string;
  maneuver: string;
  distanceMeters: number;
  durationSeconds: number;
};

export type DriveRoute = {
  provider: "osrm";
  profile: "driving";
  distanceMeters: number;
  durationSeconds: number;
  geometry: Array<{ lat: number; lng: number }>;
  steps: DriveRouteStep[];
};

export type DrivePublicRoute = {
  pickup: { id: string; label: string; lat: number; lng: number };
  dropoff: { id: string; label: string; lat: number; lng: number };
  route: DriveRoute | null;
  reason: string | null;
};

export type DrivePresence = {
  online: boolean;
  since: string | null;
  lastSeenAt: string | null;
  lastSeenAgeSeconds: number | null;
  expiresAt: string | null;
  stale: boolean;
  heartbeatTtlSeconds: number;
  todayOnlineSeconds: number;
  serviceZone: string;
  activeRideId: string | null;
  eligible: {
    approved: boolean;
    active: boolean;
    vehicle: boolean;
    serviceZone: boolean;
  };
};

export type DriveDriverSummary = {
  todayCompletedTrips: number;
  todayFareReleasedKobo: string;
  todayCashRecordedKobo: string;
  todayCashPendingKobo: string;
  todayPickupSeconds: number;
  todayDrivingSeconds: number;
  todayAvailableSeconds: number;
  walletAvailableKobo: string | null;
  walletHeldKobo: string | null;
  activeTripId: string | null;
};

export type DriverVerification = {
  required: boolean;
  verified: boolean;
  expired: boolean;
  locked: boolean;
  attemptsRemaining: number;
  expiresAt: string | null;
  verifiedAt: string | null;
  /** The ride was assigned before protected pickup verification existed. */
  legacy: boolean;
};

export type DriverBoardRide = ApiRide & {
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  verification?: DriverVerification;
};

export type DriverBoard = {
  driver: {
    id: string;
    status: string;
    active: boolean;
    vehicleClass: string;
    vehicleMake: string;
    vehicleModel: string;
    vehiclePlate: string;
    licenseNumber: string;
    serviceZone: string | null;
    online: boolean;
    foodDeliveryEnabled: boolean;
    foodVehicleType: string;
    insulatedBag: boolean;
    suspendedReason: string | null;
    rating?: ParticipantRatingSummary;
  };
  presence: DrivePresence;
  summary: DriveDriverSummary;
  open: ApiRide[];
  active: DriverBoardRide[];
  recent: ApiRide[];
};

export type DriveTracking = {
  rideId: string;
  rideNumber: string;
  status: string;
  closed: boolean;
  pickup: { label: string; address: string; lat: number; lng: number };
  dropoff: { label: string; address: string; lat: number; lng: number };
  driver: { name: string; vehicleMake: string; vehicleModel: string; vehiclePlate: string } | null;
  serverTime: string;
  leg: "pickup" | "dropoff" | null;
  target?: { label: string; lat: number; lng: number };
  latest: {
    lat: number;
    lng: number;
    accuracyM: number | null;
    speedMps: number | null;
    headingDeg: number | null;
    capturedAt: string;
    source: string;
  } | null;
  stale: boolean;
  ageSeconds: number | null;
  route: DriveRoute | null;
  reason: string | null;
};

export type RideVerification = {
  rideId: string;
  /** Null after verification, expiry, lockout or for a legacy ride. */
  code: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  verified: boolean;
  expired: boolean;
  locked: boolean;
  attemptsRemaining: number;
  required: boolean;
  /** Matched before protected pickup verification existed; no code is required. */
  legacy: boolean;
  verifiedAt?: string | null;
};

export type ParticipantRatingSummary = {
  average: number | null;
  count: number;
};

export type RideRating = {
  score: number;
  feedback: string | null;
  createdAt: string;
};

export type RideRatingState = {
  rideId: string;
  status: string;
  own: RideRating | null;
  canRate: boolean;
  driverSummary: ParticipantRatingSummary;
  customerSummary: ParticipantRatingSummary;
};

export type RideReceipt = {
  rideId: string;
  rideNumber: string;
  status: string;
  currency: string;
  route: {
    pickupLabel: string;
    pickupAddress: string;
    dropoffLabel: string;
    dropoffAddress: string;
    distanceMeters: number;
    durationMinutes: number;
    vehicleClass: string;
  };
  fare: {
    baseKobo: number;
    distanceKobo: number;
    timeKobo: number;
    adjustmentKobo: number;
    totalKobo: number;
    currency: string;
  };
  payment: {
    method: string;
    status: string;
    reference: string | null;
    receiptReference: string;
  };
  adjustments: {
    cancellationFeeKobo: number;
    refundedKobo: number;
    chargedKobo: number;
    cancellationReason: string | null;
  };
  timestamps: {
    requestedAt: string;
    acceptedAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    cancelledAt: string | null;
  };
  driver: {
    userId: string;
    name: string;
    vehicleMake: string;
    vehicleModel: string;
    vehiclePlate: string;
  } | null;
  rider: { id: string; name: string };
  rating: {
    own: RideRating | null;
    canRate: boolean;
    driverSummary: ParticipantRatingSummary;
    customerSummary: ParticipantRatingSummary;
  };
};

export type RideSafetyReport = {
  id: string;
  rideId: string;
  category: string;
  status: string;
  createdAt: string;
};

export type DriverNotification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};
