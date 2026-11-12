"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import {
  ApiRequestError,
  apiClient,
  type ApiRideVerificationState,
  type ApiRideVerificationSupportRow
} from "@/lib/api-client";

const focus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00E676]";

function stateLabel(verification: ApiRideVerificationState) {
  if (verification.legacy) return "Legacy ride · no code required";
  if (verification.verified) return "Passenger verified";
  if (verification.locked) return "Locked after too many attempts";
  if (verification.expired) return "Code expired";
  if (verification.required) return "Awaiting rider code";
  return "No active code record";
}

function stateClasses(verification: ApiRideVerificationState) {
  if (verification.verified) return "border-[#00E676]/40 bg-[#00E676]/10 text-[#00E676]";
  if (verification.locked || verification.expired) return "border-crimson/40 bg-crimson/10 text-crimson";
  if (verification.legacy) return "border-[#8B949E]/40 bg-[#8B949E]/10 text-[#8B949E]";
  return "border-[#58A6FF]/40 bg-[#58A6FF]/10 text-[#58A6FF]";
}

/**
 * Pickup-code support desk inside the existing Control Center.
 *
 * Every row comes from `/api/admin/rides/verification`, which requires
 * `rides:write` and never returns a raw code, salt or hash. Reset rotates the code
 * and clears attempts; verify marks the passenger verified without revealing a
 * code. Both write an AuditLog row with the operator's reason.
 */
export function AdminDriveVerification({ canModerate }: { canModerate: boolean }) {
  const [rows, setRows] = useState<ApiRideVerificationSupportRow[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const result = await apiClient.adminRideVerificationQueue();
      setRows(result.rides);
      setState("ready");
    } catch (caught) {
      setState("error");
      setError(caught instanceof Error ? caught.message : "Unable to load the pickup-verification queue.");
    }
  }, []);

  useEffect(() => {
    if (canModerate) void load();
  }, [canModerate, load]);

  if (!canModerate) return null;

  async function act(row: ApiRideVerificationSupportRow, action: "reset" | "verify") {
    const reason = (reasons[row.rideId] ?? "").trim();
    setRowErrors((current) => ({ ...current, [row.rideId]: "" }));
    setNotice("");
    if (reason.length < 3 || reason.length > 300) {
      setRowErrors((current) => ({
        ...current,
        [row.rideId]: "Enter a reason between 3 and 300 characters. It is written to the audit log."
      }));
      return;
    }
    setBusy(`${row.rideId}:${action}`);
    try {
      await apiClient.adminRideVerificationAction(row.rideId, action, reason);
      setReasons((current) => ({ ...current, [row.rideId]: "" }));
      setNotice(
        action === "reset"
          ? `Pickup code reset for ${row.rideNumber}. The rider sees the new code on their trip screen.`
          : `Passenger marked verified for ${row.rideNumber}. The driver can start the trip.`
      );
      await load();
    } catch (caught) {
      const message =
        caught instanceof ApiRequestError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : "The support action failed.";
      setRowErrors((current) => ({ ...current, [row.rideId]: message }));
    } finally {
      setBusy("");
    }
  }

  return (
    <section aria-labelledby="drive-verification-heading" className="rounded-xl border border-[#21262D] bg-[#161B22] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="drive-verification-heading" className="flex items-center gap-2 font-display text-base font-extrabold text-[#F0F6FC]">
            <ShieldCheck className="h-4 w-4 text-[#00E676]" aria-hidden />
            Pickup-code support
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-[#8B949E]">
            Assigned NaijaDrive trips that have not started. A reset rotates the code and clears attempts;
            verify marks the passenger verified. Raw codes are never shown here, and every action requires a
            reason and writes an audit row. Requires the <code className="text-[#F0F6FC]">rides:write</code>{" "}
            permission.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={state === "loading"}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#21262D] bg-[#0B0E14] px-2.5 text-xs font-bold text-[#F0F6FC] hover:bg-[#21262D] disabled:opacity-50 ${focus}`}
        >
          {state === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
          Refresh
        </button>
      </div>

      {notice ? (
        <p role="status" className="mt-3 flex items-start gap-1.5 rounded-lg border border-[#00E676]/30 bg-[#00E676]/10 p-2 text-xs text-[#00E676]">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {notice}
        </p>
      ) : null}
      {state === "error" ? (
        <p role="alert" className="mt-3 flex items-start gap-1.5 rounded-lg border border-crimson/30 bg-crimson/10 p-2 text-xs text-crimson">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      {state === "loading" && rows.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-[#8B949E]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading assigned trips…
        </p>
      ) : rows.length === 0 && state === "ready" ? (
        <p className="mt-3 rounded-lg border border-dashed border-[#21262D] p-3 text-xs text-[#8B949E]">
          No assigned trips are waiting at the pick-up. This is a real empty state, not a placeholder.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((row) => {
            const verification = row.verification;
            const reasonId = `verification-reason-${row.rideId}`;
            const errorId = `verification-error-${row.rideId}`;
            const rowError = rowErrors[row.rideId];
            return (
              <li key={row.rideId} className="rounded-lg border border-[#21262D] bg-[#0B0E14] p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#F0F6FC]">{row.rideNumber}</p>
                    <p className="mt-0.5 text-xs text-[#8B949E]">
                      {row.rider.name} · {row.driver?.name ?? "Unassigned"}
                      {row.driver?.vehiclePlate ? ` · ${row.driver.vehiclePlate}` : ""}
                    </p>
                  </div>
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${stateClasses(verification)}`}>
                    {stateLabel(verification)}
                  </span>
                </div>

                <dl className="mt-2 grid gap-1 text-[11px] text-[#8B949E] sm:grid-cols-2">
                  <div className="flex gap-1">
                    <dt className="font-bold text-[#F0F6FC]">Trip status:</dt>
                    <dd>{row.status.replaceAll("_", " ")}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="font-bold text-[#F0F6FC]">Attempts:</dt>
                    <dd>{verification.required ? `${verification.attemptsRemaining} remaining` : "—"}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="font-bold text-[#F0F6FC]">Code expires:</dt>
                    <dd>
                      {verification.expiresAt
                        ? new Date(verification.expiresAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })
                        : "No active code"}
                    </dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="font-bold text-[#F0F6FC]">Verified:</dt>
                    <dd>
                      {verification.verifiedAt
                        ? new Date(verification.verifiedAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })
                        : "Not yet"}
                    </dd>
                  </div>
                </dl>

                {verification.verified ? (
                  <p className="mt-2 text-[11px] text-[#8B949E]">
                    This passenger is verified. No further pickup-code action is needed.
                  </p>
                ) : verification.legacy ? (
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <div className="min-w-[200px] flex-1">
                      <label htmlFor={reasonId} className="block text-[10px] font-bold text-[#8B949E]">
                        Reason for issuing a code (required)
                      </label>
                      <input
                        id={reasonId}
                        value={reasons[row.rideId] ?? ""}
                        onChange={(event) =>
                          setReasons((current) => ({ ...current, [row.rideId]: event.target.value.slice(0, 300) }))
                        }
                        maxLength={300}
                        placeholder="e.g. Rider reports an unsafe driver before start"
                        aria-invalid={Boolean(rowError)}
                        aria-describedby={rowError ? errorId : undefined}
                        className={`mt-0.5 min-h-9 w-full rounded-lg border border-[#21262D] bg-[#161B22] px-2 text-xs text-[#F0F6FC] ${focus}`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void act(row, "reset")}
                      disabled={busy === `${row.rideId}:reset`}
                      className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#00E676]/40 bg-[#00E676]/10 px-2.5 text-xs font-bold text-[#00E676] hover:bg-[#00E676]/20 disabled:opacity-50 ${focus}`}
                    >
                      {busy === `${row.rideId}:reset` ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                      Issue pickup code
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    <div>
                      <label htmlFor={reasonId} className="block text-[10px] font-bold text-[#8B949E]">
                        Reason for this support action (required, written to audit log)
                      </label>
                      <input
                        id={reasonId}
                        value={reasons[row.rideId] ?? ""}
                        onChange={(event) =>
                          setReasons((current) => ({ ...current, [row.rideId]: event.target.value.slice(0, 300) }))
                        }
                        maxLength={300}
                        placeholder="e.g. Code expired during a long wait"
                        aria-invalid={Boolean(rowError)}
                        aria-describedby={rowError ? errorId : undefined}
                        className={`mt-0.5 min-h-9 w-full rounded-lg border border-[#21262D] bg-[#161B22] px-2 text-xs text-[#F0F6FC] ${focus}`}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void act(row, "reset")}
                        disabled={busy === `${row.rideId}:reset`}
                        className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#58A6FF]/40 bg-[#58A6FF]/10 px-2.5 text-xs font-bold text-[#58A6FF] hover:bg-[#58A6FF]/20 disabled:opacity-50 ${focus}`}
                      >
                        {busy === `${row.rideId}:reset` ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                        Reset code
                      </button>
                      <button
                        type="button"
                        onClick={() => void act(row, "verify")}
                        disabled={busy === `${row.rideId}:verify`}
                        className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#00E676]/40 bg-[#00E676]/10 px-2.5 text-xs font-bold text-[#00E676] hover:bg-[#00E676]/20 disabled:opacity-50 ${focus}`}
                      >
                        {busy === `${row.rideId}:verify` ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                        Mark passenger verified
                      </button>
                    </div>
                  </div>
                )}
                {rowError ? (
                  <p id={errorId} role="alert" className="mt-1.5 text-[11px] font-bold text-crimson">
                    {rowError}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
