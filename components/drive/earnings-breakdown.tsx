"use client";

import { useId, useMemo, useState } from "react";
import { Banknote, Clock, Fuel, Info, RotateCcw, Wallet } from "lucide-react";
import { koboToNaira } from "@/lib/api-client";
import {
  DRIVER_COST_FIELD_META,
  EMPTY_DRIVER_COST_INPUTS,
  describeDriverEarnings,
  estimateDriverNet,
  parseKobo,
  type DriverCostField,
  type DriverCostInputs
} from "@/lib/services/core/driver-economics";
import type { DriveDriverSummary, DrivePresence } from "./types";

const focus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b5c33]";

function money(value: number | null) {
  return value === null ? "—" : koboToNaira(value);
}

function signedMoney(value: number) {
  return value < 0 ? `−${koboToNaira(Math.abs(value))}` : koboToNaira(value);
}

function perHour(value: number) {
  return `${signedMoney(value)}/hour`;
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/**
 * Driver earnings surface: server-recorded fares and balances, explicit
 * "not tracked" states, and a cost-adjusted net estimate built only from the
 * driver's own local inputs. Nothing here changes or predicts driver pay.
 */
export function EarningsBreakdown({
  summary,
  presence
}: {
  summary: DriveDriverSummary;
  presence: DrivePresence;
}) {
  const baseId = useId();
  const [costs, setCosts] = useState<DriverCostInputs>({ ...EMPTY_DRIVER_COST_INPUTS });

  const earnings = useMemo(
    () =>
      describeDriverEarnings({
        fareReleasedTodayKobo: parseKobo(summary.todayFareReleasedKobo),
        cashRecordedTodayKobo: parseKobo(summary.todayCashRecordedKobo),
        cashPendingTodayKobo: parseKobo(summary.todayCashPendingKobo),
        walletAvailableKobo:
          summary.walletAvailableKobo === null ? null : parseKobo(summary.walletAvailableKobo),
        walletHeldKobo: summary.walletHeldKobo === null ? null : parseKobo(summary.walletHeldKobo),
        completedTripsToday: summary.todayCompletedTrips
      }),
    [summary]
  );

  const engagedSeconds = summary.todayPickupSeconds + summary.todayDrivingSeconds;
  const estimate = useMemo(
    () =>
      estimateDriverNet({
        grossFareKobo: earnings.grossCompletedFareKobo,
        onlineSeconds: presence.todayOnlineSeconds,
        engagedSeconds,
        costs
      }),
    [costs, earnings.grossCompletedFareKobo, engagedSeconds, presence.todayOnlineSeconds]
  );

  const hasWallet = summary.walletAvailableKobo !== null || summary.walletHeldKobo !== null;
  const hasInput = DRIVER_COST_FIELD_META.some((meta) => costs[meta.field].trim() !== "");
  const labelFor = (field: DriverCostField) => {
    const meta = DRIVER_COST_FIELD_META.find((row) => row.field === field);
    return meta ? meta.label : field;
  };
  const missingLabels = estimate.missingFields.map(labelFor);
  const invalidLabels = estimate.invalidFields.map(labelFor);
  const pending = earnings.cashPendingTodayKobo ?? 0;

  function update(field: DriverCostField, value: string) {
    setCosts((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="space-y-3">
      <section aria-labelledby="earnings-today-heading" className="rounded-xl bg-white p-4 ring-1 ring-[#e6ece6]">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 id="earnings-today-heading" className="text-[14px] font-extrabold text-[#14241b]">
              Fares today
            </h2>
            <p className="mt-0.5 text-[10.5px] leading-4 text-[#5d6d64]">
              Trips completed today in West Africa Time, from server records.
            </p>
          </div>
          <span className="rounded-full bg-[#eaf5ec] px-2.5 py-1 text-[10px] font-bold text-[#0b5c33]">
            {earnings.completedTripsToday} completed
          </span>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <MoneyStat
            label="Gross completed fares"
            value={
              earnings.grossCompletedFareKobo === null ? "Not available" : money(earnings.grossCompletedFareKobo)
            }
            note={
              earnings.grossCompletedFareKobo === null
                ? "The server did not report every fare bucket, so no total is shown."
                : "Wallet released + cash collected + cash not yet recorded. The full fare belongs to you in this build; no commission is deducted."
            }
          />
          <MoneyStat
            label="Released to your wallet"
            value={money(earnings.fareReleasedTodayKobo)}
            note="Wallet fares the server released to your DRIVER wallet when those trips completed."
          />
          <MoneyStat
            label="Cash collected"
            value={money(earnings.cashRecordedTodayKobo)}
            note="Cash fares you confirmed as collected today."
          />
          <MoneyStat
            label="Cash not yet recorded"
            value={money(earnings.cashPendingTodayKobo)}
            tone={pending > 0 ? "warn" : "default"}
            note="Completed cash trips with no collection recorded. This is a recording gap, not money held by NaijaDeals."
          />
        </div>

        <ul className="mt-3 space-y-1.5">
          <UntrackedRow
            term="Tips"
            state="Not tracked"
            note="No tip record exists in this build. Fare figures never include an assumed tip."
          />
          <UntrackedRow
            term="Bonuses and incentives"
            state="Not tracked"
            note="No incentive, quest or bonus programme is configured."
          />
          <UntrackedRow
            term="Pending settlement"
            state="No separate settlement"
            note="Wallet fares are released to your DRIVER wallet when a trip completes. No settlement schedule or pending-settlement balance exists."
          />
        </ul>
      </section>

      <section aria-labelledby="earnings-balance-heading" className="rounded-xl bg-white p-4 ring-1 ring-[#e6ece6]">
        <div className="flex items-start gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#eaf5ec] text-[#0b5c33]">
            <Wallet className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="earnings-balance-heading" className="text-[14px] font-extrabold text-[#14241b]">
              Wallet balances
            </h2>
            <p className="text-[10.5px] leading-4 text-[#5d6d64]">
              All-time DRIVER ledger balances, separate from today&apos;s fare flow.
            </p>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <MoneyStat
            label="Available balance"
            value={hasWallet ? money(earnings.walletAvailableKobo) : "No DRIVER wallet"}
            note="Available funds in the wallet with ownerType DRIVER. This is not a promise that a payout can be requested."
          />
          <MoneyStat
            label="Held balance"
            value={hasWallet ? money(earnings.walletHeldKobo) : "No DRIVER wallet"}
            note="Held funds recorded on the same driver wallet. No settlement queue feeds this balance."
          />
        </div>
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-[#fff3e8] px-3 py-2 text-[10.5px] leading-4 text-[#7a5a35]">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Payout requests and settlement schedules are not configured for this wallet in this build. The
          balance is real ledger data; it is not a promise that a payout can be requested yet.
        </p>
      </section>

      <section aria-labelledby="earnings-estimate-heading" className="rounded-xl bg-white p-4 ring-1 ring-[#e6ece6]">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#eaf5ec] text-[#0b5c33]">
              <Fuel className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 id="earnings-estimate-heading" className="text-[14px] font-extrabold text-[#14241b]">
                Cost-adjusted net estimate
              </h2>
              <p className="text-[10.5px] leading-4 text-[#5d6d64]">
                Your own inputs, your own estimate. Not audited by NaijaDeals.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCosts({ ...EMPTY_DRIVER_COST_INPUTS })}
            disabled={!hasInput}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#dfe7df] px-2.5 text-[10.5px] font-bold text-[#0b5c33] disabled:opacity-50 ${focus}`}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Clear estimates
          </button>
        </div>

        <fieldset className="mt-3 rounded-lg bg-[#f7f8f6] p-3">
          <legend className="px-1 text-[10px] font-black uppercase tracking-wide text-[#5d6d64]">
            Daily assumptions
          </legend>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {DRIVER_COST_FIELD_META.map((meta) => {
              const fieldId = `${baseId}-${meta.field}`;
              const state = estimate.fields[meta.field];
              const hintId = `${fieldId}-hint`;
              const errorId = `${fieldId}-error`;
              return (
                <div key={meta.field} className="min-w-0">
                  <label htmlFor={fieldId} className="block text-[11px] font-bold text-[#14241b]">
                    {meta.label}
                    {meta.required ? (
                      <span className="text-[#5d6d64]"> (required)</span>
                    ) : (
                      <span className="font-medium text-[#5d6d64]"> (optional)</span>
                    )}
                  </label>
                  <div className="mt-1 flex min-h-11 items-center rounded-lg border border-[#dfe7df] bg-white focus-within:border-[#0b5c33] focus-within:ring-2 focus-within:ring-[#0b5c33]/20">
                    <input
                      id={fieldId}
                      value={costs[meta.field]}
                      onChange={(event) => update(meta.field, event.target.value)}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0"
                      aria-required={meta.required || undefined}
                      aria-invalid={state.problem ? true : undefined}
                      aria-describedby={state.problem ? `${hintId} ${errorId}` : hintId}
                      className="min-h-11 w-full min-w-0 rounded-lg bg-transparent px-3 text-[12px] font-semibold text-[#14241b] outline-none placeholder:text-[#8a938d]"
                    />
                    <span className="shrink-0 pr-3 text-[9.5px] font-semibold text-[#5d6d64]">{meta.unit}</span>
                  </div>
                  <p id={hintId} className="mt-1 text-[9.5px] leading-4 text-[#5d6d64]">
                    {meta.hint}
                  </p>
                  {state.problem ? (
                    <p id={errorId} role="alert" className="mt-0.5 text-[10px] font-bold text-[#b91c1c]">
                      {state.problem}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[9.5px] leading-4 text-[#5d6d64]">
            The workspace does not receive a verified daily distance total, so distance is your own
            estimate. Blank fields are not treated as zero: the net estimate stays hidden until every
            required assumption is entered.
          </p>
        </fieldset>

        {missingLabels.length > 0 || invalidLabels.length > 0 ? (
          <p role="status" className="mt-3 rounded-lg bg-[#fff3e8] px-3 py-2 text-[10.5px] font-semibold leading-4 text-[#a3480f]">
            {missingLabels.length > 0 ? <span>Still needed: {missingLabels.join(", ")}. </span> : null}
            {invalidLabels.length > 0 ? <span>Check: {invalidLabels.join(", ")}. </span> : null}
            No net figure is shown until these assumptions are valid.
          </p>
        ) : null}

        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <MoneyStat
            label="Estimated costs"
            value={estimate.totalCostKobo === null ? "Not complete" : money(estimate.totalCostKobo)}
            note={`Fuel ${estimate.fuelCostKobo === null ? "not entered" : money(estimate.fuelCostKobo)} · Maintenance ${
              estimate.maintenanceCostKobo === null ? "not entered" : money(estimate.maintenanceCostKobo)
            } · Insurance ${
              estimate.insuranceCostKobo === null ? "not entered" : money(estimate.insuranceCostKobo)
            } · Rental ${estimate.rentalCostKobo === null ? "not entered" : money(estimate.rentalCostKobo)}`}
          />
          <MoneyStat
            label="Net estimate"
            value={estimate.netEstimateKobo === null ? "Not available" : signedMoney(estimate.netEstimateKobo)}
            tone={estimate.netEstimateKobo !== null && estimate.netEstimateKobo < 0 ? "warn" : "default"}
            note={
              estimate.netEstimateKobo === null
                ? estimate.incomeAvailable
                  ? "Complete the daily assumptions to see a net figure."
                  : "The server did not report today's fare total."
                : estimate.netEstimateKobo < 0
                  ? `Your estimated costs exceed fares by ${money(Math.abs(estimate.netEstimateKobo))}.`
                  : "Completed fares minus your estimated costs. This is not a payout amount."
            }
          />
          <MoneyStat
            label="Net per online hour"
            value={estimate.netPerOnlineHourKobo === null ? "Not available" : perHour(estimate.netPerOnlineHourKobo)}
            tone={estimate.netPerOnlineHourKobo !== null && estimate.netPerOnlineHourKobo < 0 ? "warn" : "default"}
            note={
              estimate.netPerOnlineHourKobo !== null
                ? `Based on ${formatDuration(estimate.onlineSeconds)} online today from server records.`
                : estimate.onlineSeconds <= 0
                  ? "No online time has been recorded today, so this rate is undefined."
                  : "Complete the assumptions and fare figure to calculate this rate."
            }
          />
          <MoneyStat
            label="Net per engaged trip hour"
            value={estimate.netPerEngagedHourKobo === null ? "Not available" : perHour(estimate.netPerEngagedHourKobo)}
            tone={estimate.netPerEngagedHourKobo !== null && estimate.netPerEngagedHourKobo < 0 ? "warn" : "default"}
            note={
              estimate.netPerEngagedHourKobo !== null
                ? `Based on ${formatDuration(estimate.engagedSeconds)} engaged today (accept to trip end).`
                : estimate.engagedSeconds <= 0
                  ? "No engaged trip time has been recorded today, so this rate is undefined."
                  : "Complete the assumptions and fare figure to calculate this rate."
            }
          />
        </div>

        {estimate.netPerWorkedHourKobo !== null ? (
          <div className="mt-2 rounded-lg bg-[#eaf5ec] px-3 py-2">
            <p className="text-[10.5px] font-bold text-[#0b5c33]">
              Net per worked hour:{" "}
              <span className="font-display text-[14px] font-extrabold">
                {perHour(estimate.netPerWorkedHourKobo)}
              </span>
            </p>
            <p className="mt-0.5 text-[9.5px] leading-4 text-[#5d6d64]">
              Based on {formatDuration(estimate.onlineSeconds)} online plus{" "}
              {formatDuration(estimate.unpaidSeconds ?? 0)} of unpaid time you entered.
            </p>
          </div>
        ) : null}

        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-[#f2f7f2] px-3 py-2 text-[9.5px] leading-4 text-[#5d6d64]">
          <Clock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          Server time today: online {formatDuration(presence.todayOnlineSeconds)} · engaged{" "}
          {formatDuration(engagedSeconds)} (accept to trip end). Engaged time includes any trip still in
          progress, while fare figures count completed trips only, so a busy unfinished day can lower the
          engaged rate.
        </p>

        <p className="mt-2 text-[9.5px] leading-4 text-[#5d6d64]">
          These figures are calculated in this browser from numbers you typed, kept only for this session,
          and never sent to NaijaDeals. They are not audited, they do not change what you are paid, and taxes
          are not calculated or withheld here.
        </p>
      </section>

      <section aria-labelledby="earnings-model-heading" className="rounded-xl bg-white p-4 ring-1 ring-[#e6ece6]">
        <h2 id="earnings-model-heading" className="text-[14px] font-extrabold text-[#14241b]">
          How these figures are produced
        </h2>
        <ul className="mt-2 space-y-1.5 text-[10.5px] leading-5 text-[#5d6d64]">
          <li className="flex items-start gap-2">
            <Banknote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0b5c33]" aria-hidden />
            Fares are the server&apos;s recorded fare value for trips completed today. This build releases the
            full fare to the driver, so no commission or platform fee is introduced by this page.
          </li>
          <li className="flex items-start gap-2">
            <Wallet className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0b5c33]" aria-hidden />
            Wallet fares settle to the driver wallet when a trip completes; cash is recorded by the driver.
            There is no separate pending-settlement balance to show.
          </li>
          <li className="flex items-start gap-2">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0b5c33]" aria-hidden />
            Online and engaged time come from server presence events and ride timestamps. Distance, fuel or
            energy, maintenance, insurance, rental and unpaid time are your own estimates.
          </li>
          <li className="flex items-start gap-2">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0b5c33]" aria-hidden />
            Tips, bonuses and taxes are not tracked or calculated in this build, so they are never assumed
            in a fare or a net figure.
          </li>
        </ul>
      </section>
    </div>
  );
}

function MoneyStat({
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
    <div className="min-w-0 rounded-lg bg-[#f7f8f6] p-3">
      <p className="text-[10px] font-black uppercase tracking-wide text-[#5d6d64]">{label}</p>
      <p
        className={`mt-1 break-words font-display text-[19px] font-extrabold leading-tight sm:text-[21px] ${
          tone === "warn" ? "text-[#a3480f]" : "text-[#14241b]"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-[10px] leading-4 text-[#5d6d64]">{note}</p>
    </div>
  );
}

function UntrackedRow({ term, state, note }: { term: string; state: string; note: string }) {
  return (
    <li className="rounded-lg border border-dashed border-[#dfe7df] p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <p className="text-[11px] font-extrabold text-[#14241b]">{term}</p>
        <span className="rounded-full bg-[#f2f7f2] px-2 py-0.5 text-[9.5px] font-bold text-[#5d6d64]">
          {state}
        </span>
      </div>
      <p className="mt-1 text-[10.5px] leading-4 text-[#5d6d64]">{note}</p>
    </li>
  );
}
