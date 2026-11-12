import assert from "node:assert/strict";
import {
  EMPTY_DRIVER_COST_INPUTS,
  describeDriverEarnings,
  estimateDriverNet,
  parseKobo,
  type DriverCostInputs
} from "../lib/services/core/driver-economics";

/**
 * Pure-helper checks for the NaijaDrive driver earnings estimate.
 *
 *   npx tsx scripts/driver-economics-check.ts
 *
 * No database, network or credentials are used. Exits 0 only when every check
 * passes.
 */

type Row = { name: string; status: "PASS" | "FAIL"; detail: string };

const rows: Row[] = [];
let failures = 0;

function check(name: string, run: () => string) {
  try {
    rows.push({ name, status: "PASS", detail: run() });
  } catch (error) {
    failures += 1;
    rows.push({
      name,
      status: "FAIL",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function costs(overrides: Partial<DriverCostInputs> = {}): DriverCostInputs {
  return {
    ...EMPTY_DRIVER_COST_INPUTS,
    distanceKm: "100",
    fuelPricePerUnit: "1000",
    consumptionPer100Km: "10",
    maintenancePerDay: "2000",
    insurancePerDay: "1000",
    rentalPerDay: "0",
    ...overrides
  };
}

check("1. Zero online and engaged hours yield no per-hour figure", () => {
  const result = estimateDriverNet({
    grossFareKobo: 500_000,
    onlineSeconds: 0,
    engagedSeconds: 0,
    costs: costs({ distanceKm: "0" })
  });
  assert.equal(result.complete, true);
  assert.equal(result.incomeAvailable, true);
  assert.equal(result.costsComplete, true);
  assert.equal(result.fuelCostKobo, 0);
  assert.equal(result.totalCostKobo, 300_000, "maintenance 2000 + insurance 1000 naira");
  assert.equal(result.netEstimateKobo, 200_000);
  assert.equal(result.netPerOnlineHourKobo, null, "no online time means no online rate");
  assert.equal(result.netPerEngagedHourKobo, null, "no engaged time means no engaged rate");
  assert.equal(result.netPerWorkedHourKobo, null);
  return `net ${result.netEstimateKobo} kobo; both per-hour metrics null`;
});

check("2. Costs above gross produce a negative net and negative rates", () => {
  const result = estimateDriverNet({
    grossFareKobo: 100_000,
    onlineSeconds: 7_200,
    engagedSeconds: 1_800,
    costs: costs({
      distanceKm: "10",
      maintenancePerDay: "200",
      insurancePerDay: "100",
      rentalPerDay: "50"
    })
  });
  assert.equal(result.complete, true);
  assert.equal(result.fuelCostKobo, 100_000, "1 litre at 1000 naira");
  assert.equal(result.totalCostKobo, 135_000);
  assert.equal(result.netEstimateKobo, -35_000);
  assert.equal(result.netPerOnlineHourKobo, -17_500, "350 naira loss over 2 hours");
  assert.equal(result.netPerEngagedHourKobo, -70_000, "350 naira loss over 0.5 hours");
  return `net ${result.netEstimateKobo} kobo; online ${result.netPerOnlineHourKobo}, engaged ${result.netPerEngagedHourKobo} kobo/hour`;
});

check("3. Partial inputs block the net instead of assuming zero costs", () => {
  const result = estimateDriverNet({
    grossFareKobo: 500_000,
    onlineSeconds: 3_600,
    engagedSeconds: 1_800,
    costs: { ...EMPTY_DRIVER_COST_INPUTS, distanceKm: "25", fuelPricePerUnit: "1000", unpaidHours: "1.5" }
  });
  assert.equal(result.complete, false);
  assert.equal(result.costsComplete, false);
  assert.equal(
    JSON.stringify(result.missingFields),
    JSON.stringify(["consumptionPer100Km", "maintenancePerDay", "insurancePerDay", "rentalPerDay"])
  );
  assert.deepEqual(result.invalidFields, []);
  assert.equal(result.fuelCostKobo, null, "fuel cannot be known without consumption");
  assert.equal(result.maintenanceCostKobo, null);
  assert.equal(result.totalCostKobo, null);
  assert.equal(result.netEstimateKobo, null, "no net is invented for partial input");
  assert.equal(result.netPerOnlineHourKobo, null);
  assert.equal(result.netPerEngagedHourKobo, null);
  assert.equal(result.unpaidSeconds, 5_400);
  assert.equal(result.workedSeconds, 9_000);
  assert.equal(result.netPerWorkedHourKobo, null);

  const invalid = estimateDriverNet({
    grossFareKobo: 500_000,
    onlineSeconds: 3_600,
    engagedSeconds: 1_800,
    costs: costs({ distanceKm: "-5" })
  });
  assert.equal(invalid.complete, false);
  assert.deepEqual(invalid.invalidFields, ["distanceKm"]);
  assert.equal(invalid.fields.distanceKm.entered, true);
  assert.equal(invalid.fields.distanceKm.value, null);
  assert.ok(invalid.fields.distanceKm.problem);

  const tooLarge = estimateDriverNet({
    grossFareKobo: 500_000,
    onlineSeconds: 3_600,
    engagedSeconds: 1_800,
    costs: costs({ distanceKm: "6000" })
  });
  assert.deepEqual(tooLarge.invalidFields, ["distanceKm"], "distance above the guard is invalid");

  return `missing ${result.missingFields.join(", ")}; invalid negative and over-limit distance rejected`;
});

check("4. Tips, incentives and scheduled settlement stay explicitly untracked", () => {
  const breakdown = describeDriverEarnings({
    fareReleasedTodayKobo: 250_000,
    cashRecordedTodayKobo: 40_000,
    cashPendingTodayKobo: 10_000,
    walletAvailableKobo: 900_000,
    walletHeldKobo: 0,
    completedTripsToday: 3
  });
  assert.equal(breakdown.grossCompletedFareKobo, 300_000, "gross is only the three fare buckets");
  assert.equal(breakdown.fareReleasedTodayKobo, 250_000);
  assert.equal(breakdown.cashRecordedTodayKobo, 40_000);
  assert.equal(breakdown.cashPendingTodayKobo, 10_000);
  assert.equal(breakdown.walletAvailableKobo, 900_000);
  assert.equal(breakdown.walletHeldKobo, 0);
  assert.equal(breakdown.tipsKobo, null);
  assert.equal(breakdown.tipsTracked, false);
  assert.equal(breakdown.incentivesKobo, null);
  assert.equal(breakdown.incentivesTracked, false);
  assert.equal(breakdown.settlementKobo, null);
  assert.equal(breakdown.settlementTracked, false);

  const unavailable = describeDriverEarnings({
    fareReleasedTodayKobo: null,
    cashRecordedTodayKobo: 40_000,
    cashPendingTodayKobo: 10_000,
    walletAvailableKobo: null,
    walletHeldKobo: null,
    completedTripsToday: 1
  });
  assert.equal(unavailable.grossCompletedFareKobo, null, "a missing bucket is not treated as zero");
  assert.equal(unavailable.walletAvailableKobo, null);

  const noWallet = describeDriverEarnings({
    fareReleasedTodayKobo: 0,
    cashRecordedTodayKobo: 0,
    cashPendingTodayKobo: 0,
    walletAvailableKobo: null,
    walletHeldKobo: null,
    completedTripsToday: 0
  });
  assert.equal(noWallet.grossCompletedFareKobo, 0);
  assert.equal(noWallet.walletAvailableKobo, null);

  assert.equal(parseKobo("0"), 0);
  assert.equal(parseKobo("125000"), 125_000);
  assert.equal(parseKobo("12.5"), null, "kobo values are integers");
  assert.equal(parseKobo(null), null);

  return "gross 300000 kobo from fares only; tips/incentives/settlement null and untracked; missing bucket stays null";
});

check("5. Both per-hour metrics use the correct server-derived denominator", () => {
  const result = estimateDriverNet({
    grossFareKobo: 90_000,
    onlineSeconds: 3_600,
    engagedSeconds: 1_800,
    costs: costs({
      distanceKm: "0",
      fuelPricePerUnit: "0",
      consumptionPer100Km: "0",
      maintenancePerDay: "0",
      insurancePerDay: "0",
      rentalPerDay: "0",
      unpaidHours: "2"
    })
  });
  assert.equal(result.complete, true);
  assert.equal(result.totalCostKobo, 0);
  assert.equal(result.netEstimateKobo, 90_000);
  assert.equal(result.netPerOnlineHourKobo, 90_000, "900 naira over one online hour");
  assert.equal(result.netPerEngagedHourKobo, 180_000, "900 naira over half an engaged hour");
  assert.equal(result.workedSeconds, 10_800, "one online hour plus two unpaid hours");
  assert.equal(result.netPerWorkedHourKobo, 30_000, "900 naira over three worked hours");
  return `online ${result.netPerOnlineHourKobo}, engaged ${result.netPerEngagedHourKobo}, worked ${result.netPerWorkedHourKobo} kobo/hour`;
});

check("6. Fuel formula is exact integer kobo (250 km, 8.5 L/100 km, 900 naira/L)", () => {
  const result = estimateDriverNet({
    grossFareKobo: 5_000_000,
    onlineSeconds: 3_600,
    engagedSeconds: 3_600,
    costs: costs({
      distanceKm: "250",
      fuelPricePerUnit: "900",
      consumptionPer100Km: "8.5",
      maintenancePerDay: "0",
      insurancePerDay: "0",
      rentalPerDay: "0"
    })
  });
  assert.equal(result.fuelCostKobo, 1_912_500, "21.25 litres at 900 naira");
  assert.equal(result.totalCostKobo, 1_912_500);
  assert.equal(result.netEstimateKobo, 3_087_500);
  assert.equal(result.netPerOnlineHourKobo, 3_087_500);
  assert.equal(result.netPerEngagedHourKobo, 3_087_500);
  return `fuel ${result.fuelCostKobo} kobo; net ${result.netEstimateKobo} kobo`;
});

check("7. Missing unpaid time hides only the worked-hour metric", () => {
  const result = estimateDriverNet({
    grossFareKobo: 500_000,
    onlineSeconds: 3_600,
    engagedSeconds: 1_800,
    costs: costs({ distanceKm: "0" })
  });
  assert.equal(result.complete, true);
  assert.equal(result.unpaidSeconds, null);
  assert.equal(result.workedSeconds, null);
  assert.equal(result.netPerWorkedHourKobo, null);
  assert.equal(result.netPerOnlineHourKobo, 200_000);
  assert.equal(result.netPerEngagedHourKobo, 400_000);
  return `online ${result.netPerOnlineHourKobo}, engaged ${result.netPerEngagedHourKobo} kobo/hour; worked-hour null`;
});

check("8. Calculation is deterministic and rounds negatives symmetrically", () => {
  const input = {
    grossFareKobo: 1,
    onlineSeconds: 7_200,
    engagedSeconds: 7_200,
    costs: costs({
      distanceKm: "0",
      fuelPricePerUnit: "0",
      consumptionPer100Km: "0",
      maintenancePerDay: "0",
      insurancePerDay: "0",
      rentalPerDay: "0"
    })
  };
  assert.deepEqual(estimateDriverNet(input), estimateDriverNet(input));

  const rounded = estimateDriverNet(input);
  assert.equal(rounded.netPerOnlineHourKobo, 1, "0.5 kobo/hour rounds away from zero");

  const loss = estimateDriverNet({
    grossFareKobo: 0,
    onlineSeconds: 7_200,
    engagedSeconds: 7_200,
    costs: costs({
      distanceKm: "0",
      fuelPricePerUnit: "0",
      consumptionPer100Km: "0",
      maintenancePerDay: "0.01",
      insurancePerDay: "0",
      rentalPerDay: "0"
    })
  });
  assert.equal(loss.netEstimateKobo, -1, "one kobo of cost with no fare");
  assert.equal(loss.netPerOnlineHourKobo, -1, "-0.5 kobo/hour rounds away from zero");
  return "two identical calls deep-equal; positive and negative half-kobo round away from zero";
});

const passed = rows.length - failures;
for (const row of rows) {
  console.log(`${row.status}  ${row.name}`);
  console.log(`      ${row.detail}`);
}
console.log("");
console.log(`Driver economics pure-helper checks: ${passed} passed, ${failures} failed.`);
if (failures > 0) process.exitCode = 1;
