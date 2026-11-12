/**
 * Pure driver-earnings arithmetic for the NaijaDrive driver workspace.
 *
 * The helper is deterministic and free of server, React and database imports so
 * it can be unit-tested directly and reused by the client component.
 *
 * Ground rules encoded here:
 * - Money is integer Nigerian kobo (minor units). No floating-point amount is
 *   stored; user-entered decimals are converted to whole kobo once.
 * - Time is integer seconds derived by the server (presence events and ride
 *   timestamps). The helper never estimates time.
 * - Income is only the fare value the backend already reports. This build has
 *   no tip, incentive, commission, fee or scheduled-settlement record, so those
 *   figures are reported as `null` / not tracked instead of being fabricated.
 * - Costs are the driver's own local estimates, disclosed as such. They are not
 *   audited and never change what the driver is paid.
 */

export const DRIVER_COST_FIELDS = [
  "distanceKm",
  "fuelPricePerUnit",
  "consumptionPer100Km",
  "maintenancePerDay",
  "insurancePerDay",
  "rentalPerDay",
  "unpaidHours"
] as const;

export type DriverCostField = (typeof DRIVER_COST_FIELDS)[number];

/** Raw text as typed by the driver. An empty string means "not entered". */
export type DriverCostInputs = Record<DriverCostField, string>;

export const EMPTY_DRIVER_COST_INPUTS: DriverCostInputs = {
  distanceKm: "",
  fuelPricePerUnit: "",
  consumptionPer100Km: "",
  maintenancePerDay: "",
  insurancePerDay: "",
  rentalPerDay: "",
  unpaidHours: ""
};

export type DriverCostFieldMeta = {
  field: DriverCostField;
  label: string;
  unit: string;
  hint: string;
  /** Required fields block the net estimate; unpaid time only affects its own metric. */
  required: boolean;
  /** Upper guard so an accidental extra zero cannot overflow the integer maths. */
  maximum: number;
};

export const DRIVER_COST_FIELD_META: readonly DriverCostFieldMeta[] = [
  {
    field: "distanceKm",
    label: "Distance driven today",
    unit: "km",
    hint: "Your own estimate. This workspace does not receive a verified daily distance total.",
    required: true,
    maximum: 5000
  },
  {
    field: "fuelPricePerUnit",
    label: "Fuel or energy price",
    unit: "₦ per litre or kWh",
    hint: "What you paid for petrol, diesel or electricity.",
    required: true,
    maximum: 100_000
  },
  {
    field: "consumptionPer100Km",
    label: "Consumption",
    unit: "litres or kWh / 100 km",
    hint: "Your vehicle's typical consumption over 100 km.",
    required: true,
    maximum: 1000
  },
  {
    field: "maintenancePerDay",
    label: "Maintenance and tyres",
    unit: "₦ per day",
    hint: "Daily share of servicing, tyres, brakes and repairs.",
    required: true,
    maximum: 10_000_000
  },
  {
    field: "insurancePerDay",
    label: "Insurance and licensing",
    unit: "₦ per day",
    hint: "Daily share of insurance, licence and roadworthiness costs.",
    required: true,
    maximum: 10_000_000
  },
  {
    field: "rentalPerDay",
    label: "Rental or finance",
    unit: "₦ per day",
    hint: "Daily rental, lease or vehicle-finance cost. Enter 0 if you own the vehicle outright.",
    required: true,
    maximum: 10_000_000
  },
  {
    field: "unpaidHours",
    label: "Unpaid time today",
    unit: "hours",
    hint: "Cleaning, fuel queues, admin or waiting offline. Used only for the worked-hour estimate.",
    required: false,
    maximum: 24
  }
];

/* ------------------------------------------------------------------ parsing --- */

/**
 * Parse a server kobo value (decimal string or number) without inventing a 0
 * for malformed input. `null` means "not reported" and must stay visibly
 * unavailable in the UI.
 */
export function parseKobo(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export type DriverCostFieldState = {
  entered: boolean;
  /** Parsed decimal value, or null when blank or invalid. */
  value: number | null;
  problem: string | null;
};

function parseCostField(raw: string, meta: DriverCostFieldMeta): DriverCostFieldState {
  const cleaned = raw.replace(/[,\s]/g, "");
  if (cleaned === "") return { entered: false, value: null, problem: null };
  if (!/^(?:\d+|\d*\.\d+)$/.test(cleaned)) {
    return { entered: true, value: null, problem: "Enter a number, for example 8.5." };
  }
  const value = Number(cleaned);
  if (!Number.isFinite(value)) {
    return { entered: true, value: null, problem: "Enter a valid number." };
  }
  if (value > meta.maximum) {
    return {
      entered: true,
      value: null,
      problem: `Enter a value of ${meta.maximum.toLocaleString("en-NG")} or less.`
    };
  }
  return { entered: true, value, problem: null };
}

/* ------------------------------------------------------------ earnings view --- */

export type DriverEarningsSource = {
  /** Fare value of wallet trips completed today whose hold was released. */
  fareReleasedTodayKobo: number | null;
  /** Cash fares for trips completed today that the driver recorded as collected. */
  cashRecordedTodayKobo: number | null;
  /** Cash fares for trips completed today with no collection recorded yet. */
  cashPendingTodayKobo: number | null;
  /** All-time available balance of the DRIVER ledger wallet; null when none exists. */
  walletAvailableKobo: number | null;
  /** All-time held balance of the DRIVER ledger wallet; null when none exists. */
  walletHeldKobo: number | null;
  completedTripsToday: number;
};

export type DriverEarningsBreakdown = {
  /** Exact sum of the three server fare buckets; null if any bucket is unavailable. */
  grossCompletedFareKobo: number | null;
  fareReleasedTodayKobo: number | null;
  cashRecordedTodayKobo: number | null;
  cashPendingTodayKobo: number | null;
  walletAvailableKobo: number | null;
  walletHeldKobo: number | null;
  completedTripsToday: number;
  /** No tip record exists in this build. No tip is assumed or added to a fare. */
  tipsKobo: null;
  tipsTracked: false;
  /** No incentive, quest or bonus record exists in this build. */
  incentivesKobo: null;
  incentivesTracked: false;
  /** No scheduled settlement queue exists; wallet fares release at completion. */
  settlementKobo: null;
  settlementTracked: false;
};

function koboOrNull(value: number | null): number | null {
  return value !== null && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function describeDriverEarnings(source: DriverEarningsSource): DriverEarningsBreakdown {
  const fareReleased = koboOrNull(source.fareReleasedTodayKobo);
  const cashRecorded = koboOrNull(source.cashRecordedTodayKobo);
  const cashPending = koboOrNull(source.cashPendingTodayKobo);
  const gross =
    fareReleased === null || cashRecorded === null || cashPending === null
      ? null
      : fareReleased + cashRecorded + cashPending;

  return {
    grossCompletedFareKobo: gross,
    fareReleasedTodayKobo: fareReleased,
    cashRecordedTodayKobo: cashRecorded,
    cashPendingTodayKobo: cashPending,
    walletAvailableKobo: koboOrNull(source.walletAvailableKobo),
    walletHeldKobo: koboOrNull(source.walletHeldKobo),
    completedTripsToday: Number.isFinite(source.completedTripsToday)
      ? Math.max(0, Math.floor(source.completedTripsToday))
      : 0,
    tipsKobo: null,
    tipsTracked: false,
    incentivesKobo: null,
    incentivesTracked: false,
    settlementKobo: null,
    settlementTracked: false
  };
}

/* -------------------------------------------------------------- net estimate --- */

/**
 * Fuel or energy cost in kobo.
 *
 * `distanceKm` is kilometres, `consumptionPer100Km` is litres (or kWh) per
 * 100 km and `pricePerUnitNaira` is naira per litre (or kWh). The calculation is
 * done in exact integer space:
 *
 *   kobo = metres × thousandths-of-a-unit-per-100 km × kobo-per-unit / 100 000 000
 *
 * Rounded half away from zero once at the end. Inputs are non-negative and
 * capped by `DRIVER_COST_FIELD_META`, so the result stays a safe integer.
 */
function fuelCostKobo(
  distanceKm: number,
  consumptionPer100Km: number,
  pricePerUnitNaira: number
): number {
  const distanceMetres = Math.round(distanceKm * 1000);
  const consumptionMilliUnits = Math.round(consumptionPer100Km * 1000);
  const priceKoboPerUnit = Math.round(pricePerUnitNaira * 100);
  const numerator =
    BigInt(distanceMetres) * BigInt(consumptionMilliUnits) * BigInt(priceKoboPerUnit);
  return Number((numerator + BigInt(50_000_000)) / BigInt(100_000_000));
}

function nairaToKobo(naira: number): number {
  return Math.round(naira * 100);
}

/** Integer division rounded half away from zero, so negative nets stay symmetric. */
function divideHalfAwayFromZero(numerator: bigint, denominator: bigint): number {
  const negative = numerator < BigInt(0);
  const absolute = negative ? -numerator : numerator;
  const rounded = (absolute + denominator / BigInt(2)) / denominator;
  return Number(negative ? -rounded : rounded);
}

/** Kobo per hour from a kobo total and integer seconds; null when there is no time. */
function koboPerHour(totalKobo: number | null, seconds: number | null): number | null {
  if (totalKobo === null || seconds === null || seconds <= 0) return null;
  return divideHalfAwayFromZero(BigInt(totalKobo) * BigInt(3600), BigInt(seconds));
}

export type DriverCostEstimate = {
  fields: Record<DriverCostField, DriverCostFieldState>;
  /** Required fields left blank, in the order they appear in the form. */
  missingFields: DriverCostField[];
  /** Required fields whose text could not be parsed. */
  invalidFields: DriverCostField[];
  costsComplete: boolean;
  incomeAvailable: boolean;
  /** Every required input is valid and the fare value is available. */
  complete: boolean;
  fuelCostKobo: number | null;
  maintenanceCostKobo: number | null;
  insuranceCostKobo: number | null;
  rentalCostKobo: number | null;
  /** Sum of the four costs; null until every required input is valid. */
  totalCostKobo: number | null;
  /** Gross fare value minus estimated costs; null until complete. */
  netEstimateKobo: number | null;
  /** Server-derived online seconds today, clamped to a non-negative integer. */
  onlineSeconds: number;
  /** Server-derived engaged seconds today (accept to start plus start to end). */
  engagedSeconds: number;
  /** Entered unpaid time in seconds; null when the field is blank or invalid. */
  unpaidSeconds: number | null;
  /** Online plus unpaid seconds; null until both are known. */
  workedSeconds: number | null;
  netPerOnlineHourKobo: number | null;
  netPerEngagedHourKobo: number | null;
  /** Uses online plus unpaid time, so it is only available when unpaid time is entered. */
  netPerWorkedHourKobo: number | null;
};

function safeSeconds(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.floor(value), Number.MAX_SAFE_INTEGER);
}

export function estimateDriverNet(input: {
  /** Fare value of trips completed today, or null when unavailable. */
  grossFareKobo: number | null;
  onlineSeconds: number;
  engagedSeconds: number;
  costs: DriverCostInputs;
}): DriverCostEstimate {
  const fields = {} as Record<DriverCostField, DriverCostFieldState>;
  const missingFields: DriverCostField[] = [];
  const invalidFields: DriverCostField[] = [];

  for (const meta of DRIVER_COST_FIELD_META) {
    const state = parseCostField(input.costs[meta.field] ?? "", meta);
    fields[meta.field] = state;
    if (!meta.required) continue;
    if (!state.entered) missingFields.push(meta.field);
    else if (state.value === null) invalidFields.push(meta.field);
  }

  const distanceKm = fields.distanceKm.value;
  const pricePerUnit = fields.fuelPricePerUnit.value;
  const consumption = fields.consumptionPer100Km.value;
  const fuelCostKobo_ =
    distanceKm !== null && pricePerUnit !== null && consumption !== null
      ? fuelCostKobo(distanceKm, consumption, pricePerUnit)
      : null;
  const maintenanceCostKobo_ =
    fields.maintenancePerDay.value === null ? null : nairaToKobo(fields.maintenancePerDay.value);
  const insuranceCostKobo_ =
    fields.insurancePerDay.value === null ? null : nairaToKobo(fields.insurancePerDay.value);
  const rentalCostKobo_ =
    fields.rentalPerDay.value === null ? null : nairaToKobo(fields.rentalPerDay.value);

  const costsComplete = missingFields.length === 0 && invalidFields.length === 0;
  const totalCostKobo =
    costsComplete &&
    fuelCostKobo_ !== null &&
    maintenanceCostKobo_ !== null &&
    insuranceCostKobo_ !== null &&
    rentalCostKobo_ !== null
      ? fuelCostKobo_ + maintenanceCostKobo_ + insuranceCostKobo_ + rentalCostKobo_
      : null;

  const gross = input.grossFareKobo;
  const incomeAvailable =
    gross !== null && Number.isSafeInteger(gross) && gross >= 0;
  const complete = costsComplete && totalCostKobo !== null && incomeAvailable;
  const netEstimateKobo =
    complete && totalCostKobo !== null && gross !== null ? gross - totalCostKobo : null;

  const onlineSeconds = safeSeconds(input.onlineSeconds);
  const engagedSeconds = safeSeconds(input.engagedSeconds);
  const unpaidSeconds =
    fields.unpaidHours.value === null ? null : Math.round(fields.unpaidHours.value * 3600);
  const workedSeconds = unpaidSeconds === null ? null : onlineSeconds + unpaidSeconds;

  return {
    fields,
    missingFields,
    invalidFields,
    costsComplete,
    incomeAvailable,
    complete,
    fuelCostKobo: fuelCostKobo_,
    maintenanceCostKobo: maintenanceCostKobo_,
    insuranceCostKobo: insuranceCostKobo_,
    rentalCostKobo: rentalCostKobo_,
    totalCostKobo,
    netEstimateKobo,
    onlineSeconds,
    engagedSeconds,
    unpaidSeconds,
    workedSeconds,
    netPerOnlineHourKobo: koboPerHour(netEstimateKobo, onlineSeconds),
    netPerEngagedHourKobo: koboPerHour(netEstimateKobo, engagedSeconds),
    netPerWorkedHourKobo: koboPerHour(netEstimateKobo, workedSeconds)
  };
}
