"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  Car,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
  ShieldCheck,
  UserRound
} from "lucide-react";
import { apiClient, koboToNaira, type ApiDriverBoard, type ApiRide } from "@/lib/api-client";
import { ReceiptCard } from "@/components/functional/drive-page";

const activeStatuses = ["driver_assigned", "driver_arriving", "in_progress"];

export function DriverDashboard() {
  const [board, setBoard] = useState<ApiDriverBoard | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "forbidden">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await apiClient.driverRides();
      setBoard(data);
      setState("ready");
      setError("");
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 401 || status === 403) {
        setState("forbidden");
        setError(err instanceof Error ? err.message : "Driver access is required.");
      } else {
        setState("error");
        setError(err instanceof Error ? err.message : "Unable to load the driver board.");
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!board || board.active.length === 0) return;
    const timer = window.setInterval(() => void load(), 10000);
    return () => window.clearInterval(timer);
  }, [board, load]);

  async function run(key: string, action: () => Promise<unknown>, message: string) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy("");
    }
  }

  if (state === "loading") {
    return (
      <div className="grid min-h-64 place-items-center rounded-2xl border border-border-soft bg-canvas">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading driver board" />
      </div>
    );
  }

  if (state === "forbidden") {
    return (
      <div className="rounded-2xl border border-border-soft bg-canvas p-8 text-center">
        <ShieldCheck className="mx-auto mb-3 h-9 w-9 text-primary" aria-hidden="true" />
        <h1 className="font-display text-2xl font-extrabold">Driver access required</h1>
        <p className="mt-2 text-sm text-muted">
          {error || "This account has no approved NaijaDrive driver profile."}
        </p>
        <Link href="/naijadrive" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-white">
          Back to NaijaDrive
        </Link>
      </div>
    );
  }

  if (state === "error" || !board) {
    return (
      <div role="alert" className="rounded-xl border border-crimson/30 bg-crimson-soft p-4 font-bold text-crimson">
        <AlertCircle className="mb-1 h-4 w-4" aria-hidden="true" />
        {error || "Driver board unavailable."}
        <button type="button" onClick={() => void load()} className="mt-3 block min-h-10 rounded-lg border border-crimson/30 px-3 text-xs font-bold">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-4">
      <header className="rounded-3xl bg-night p-5 text-white sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold">
              <Car className="h-3.5 w-3.5 text-primary-live" aria-hidden="true" />
              Approved driver · {board.driver.vehicleClass}
            </p>
            <h1 className="mt-3 font-display text-3xl font-extrabold">Driver board</h1>
            <p className="mt-1 text-sm text-white/75">
              {board.driver.vehicleMake} {board.driver.vehicleModel} · {board.driver.vehiclePlate}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/25 px-4 text-sm font-bold text-white"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh
            </button>
            <Link
              href="/naijadrive"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-extrabold text-night"
            >
              Rider view
              <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      {notice ? <div role="status" className="rounded-xl bg-primary-soft p-3 text-sm font-bold text-primary">{notice}</div> : null}
      {error ? (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-crimson/30 bg-crimson-soft p-3 text-sm font-bold text-crimson">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      ) : null}

      <section aria-labelledby="active-heading">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="active-heading" className="font-display text-xl font-extrabold">
              Active rides
            </h2>
            <p className="text-sm text-muted">Only rides assigned to this driver appear here.</p>
          </div>
          <span className="rounded-full bg-canvas px-3 py-1 text-xs font-bold text-muted ring-1 ring-border-soft">
            {board.active.length}
          </span>
        </div>

        {board.active.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-border-soft bg-canvas p-4 text-sm text-muted">
            No active ride. Accept a request below to start a trip.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {board.active.map((ride) => (
              <DriverActiveRide
                key={ride.id}
                ride={ride}
                busy={busy}
                onAction={(next, message) =>
                  void run(
                    `${ride.id}-${next}`,
                    () => apiClient.driverRideStatus(ride.id, next),
                    message
                  )
                }
                onRelease={() =>
                  void run(
                    `${ride.id}-release`,
                    () => apiClient.driverReleaseRide(ride.id, "Driver released the ride."),
                    "Ride released back to the open queue."
                  )
                }
                onCash={() =>
                  void run(
                    `${ride.id}-cash`,
                    () => apiClient.driverCashCollected(ride.id),
                    "Cash fare recorded."
                  )
                }
                onExpired={() => void load()}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="open-heading">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="open-heading" className="font-display text-xl font-extrabold">
              Open requests
            </h2>
            <p className="text-sm text-muted">Real rider requests waiting for a driver in Lagos.</p>
          </div>
          <span className="rounded-full bg-canvas px-3 py-1 text-xs font-bold text-muted ring-1 ring-border-soft">
            {board.open.length}
          </span>
        </div>

        {board.open.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-border-soft bg-canvas p-4 text-sm text-muted">
            No open requests right now. This board refreshes every 10 seconds while you have an active
            ride; tap Refresh at any time.
          </p>
        ) : (
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {board.open.map((ride) => (
              <li key={ride.id} className="flex flex-col rounded-2xl border border-border-soft bg-canvas p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-extrabold">
                      {ride.pickupLabel} → {ride.dropoffLabel}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {ride.rideNumber} · {(ride.distanceMeters / 1000).toFixed(1)} km · about{" "}
                      {ride.durationMinutes} min
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-primary-soft px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-primary">
                    {ride.vehicleClass}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
                    {koboToNaira(ride.fareKobo, ride.currency)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    {ride.paymentMethod === "wallet" ? <Banknote className="h-3.5 w-3.5" aria-hidden="true" /> : <Banknote className="h-3.5 w-3.5" aria-hidden="true" />}
                    {ride.paymentMethod === "wallet" ? "NaijaPay held" : "Cash fare"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    {new Date(ride.requestedAt).toLocaleTimeString()}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void run(`${ride.id}-accept`, () => apiClient.driverAcceptRide(ride.id), "Ride accepted.")
                  }
                  disabled={busy === `${ride.id}-accept`}
                  className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-white disabled:opacity-50"
                >
                  {busy === `${ride.id}-accept` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                  Accept ride
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent-driver-heading">
        <h2 id="recent-driver-heading" className="font-display text-xl font-extrabold">
          Recent trips
        </h2>
        {board.recent.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-border-soft bg-canvas p-4 text-sm text-muted">
            Completed and cancelled trips will appear here with their receipt state.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {board.recent.map((ride) =>
              ride.status === "completed" ? (
                <div key={ride.id} className="space-y-2">
                  <ReceiptCard ride={ride} />
                  {ride.paymentMethod === "cash" && ride.paymentStatus === "pending" ? (
                    <button
                      type="button"
                      onClick={() =>
                        void run(
                          `${ride.id}-cash`,
                          () => apiClient.driverCashCollected(ride.id),
                          "Cash fare recorded."
                        )
                      }
                      disabled={busy === `${ride.id}-cash`}
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {busy === `${ride.id}-cash` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Banknote className="h-4 w-4" aria-hidden="true" />}
                      Record cash received
                    </button>
                  ) : null}
                </div>
              ) : (
                <div key={ride.id} className="rounded-2xl border border-border-soft bg-canvas p-4">
                  <p className="text-sm font-bold">
                    {ride.pickupLabel} → {ride.dropoffLabel}
                  </p>
                  <p className="text-xs text-muted">
                    {ride.rideNumber} · cancelled · {ride.cancellationReason ?? "No reason recorded."}
                  </p>
                </div>
              )
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function DriverActiveRide({
  ride,
  busy,
  onAction,
  onRelease,
  onCash,
  onExpired
}: {
  ride: ApiRide;
  busy: string;
  onAction: (next: "driver_arriving" | "in_progress" | "completed", message: string) => void;
  onRelease: () => void;
  onCash: () => void;
  onExpired: () => void;
}) {
  const isActive = activeStatuses.includes(ride.status);

  /* A live clock so the deadline ticks down between board refreshes. It only runs
   * while a deadline is actually pending. */
  const [now, setNow] = useState(() => Date.now());
  const expiryNotified = useRef(false);

  useEffect(() => {
    if (!ride.assignmentExpiresAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [ride.assignmentExpiresAt]);

  useEffect(() => {
    expiryNotified.current = false;
    setNow(Date.now());
  }, [ride.assignmentExpiresAt]);

  const deadline = ride.assignmentExpiresAt ? new Date(ride.assignmentExpiresAt).getTime() : null;
  const remainingSeconds = deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
  const expired = remainingSeconds !== null && remainingSeconds <= 0;

  /* The server releases expired assignments the next time the board is read. Ask the
   * parent to refresh exactly once when this ride crosses its deadline, so the rider
   * is not left looking at a stale assignment. */
  useEffect(() => {
    if (!expired || expiryNotified.current) return;
    expiryNotified.current = true;
    onExpired();
  }, [expired, onExpired]);

  const nextAction =
    ride.status === "driver_assigned"
      ? { status: "driver_arriving" as const, label: "I have arrived", message: "Arrival recorded." }
      : ride.status === "driver_arriving"
        ? { status: "in_progress" as const, label: "Start trip", message: "Trip started." }
        : ride.status === "in_progress"
          ? { status: "completed" as const, label: "Complete trip", message: "Trip completed and receipt created." }
          : null;

  const deadlineVisible =
    remainingSeconds !== null && (ride.status === "driver_assigned" || ride.status === "driver_arriving");

  return (
    <article className="rounded-2xl border border-primary/20 bg-canvas p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-primary">{ride.status.replaceAll("_", " ")}</p>
          <h3 className="mt-1 font-display text-lg font-extrabold">
            {ride.pickupLabel} → {ride.dropoffLabel}
          </h3>
          <p className="text-xs text-muted">{ride.rideNumber}</p>
        </div>
        <span className="shrink-0 rounded-full bg-surface-low px-2.5 py-1 text-xs font-bold text-primary">
          {koboToNaira(ride.fareKobo, ride.currency)}
        </span>
      </div>

      <div className="mt-3 rounded-xl bg-surface-low p-3 text-sm">
        <p className="flex items-center gap-2 font-bold">
          <UserRound className="h-4 w-4 text-primary" aria-hidden="true" />
          {ride.rider?.name ?? "Rider"}
        </p>
        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          {ride.pickupAddress}
        </p>
        {ride.rider?.phone ? <p className="mt-1 text-xs font-semibold">{ride.rider.phone}</p> : null}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {nextAction ? (
          <button
            type="button"
            onClick={() => onAction(nextAction.status, nextAction.message)}
            disabled={busy === `${ride.id}-${nextAction.status}`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-white disabled:opacity-50"
          >
            {busy === `${ride.id}-${nextAction.status}` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
            {nextAction.label}
          </button>
        ) : null}
        {isActive && ride.status !== "in_progress" ? (
          <button
            type="button"
            onClick={onRelease}
            disabled={busy === `${ride.id}-release`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border-soft px-4 text-sm font-bold text-muted disabled:opacity-50"
          >
            {busy === `${ride.id}-release` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Release ride
          </button>
        ) : null}
        {/* Assignment deadline: live countdown, then an explicit expired state. */}
        {deadlineVisible ? (
          <p
            role="status"
            aria-live="polite"
            className={`sm:col-span-2 rounded-lg px-2 py-1.5 text-[11px] font-bold ${
              expired ? "bg-crimson-soft text-crimson" : "bg-surface-low text-muted"
            }`}
          >
            {expired
              ? "Deadline passed with no update. The ride returns to the open queue automatically, another driver can accept it, and nothing extra is charged to the rider."
              : `${remainingSeconds} s left to update this ride. If no progress is made, it returns to the open queue automatically.`}
          </p>
        ) : null}
      </div>

      {ride.status === "completed" && ride.paymentMethod === "cash" && ride.paymentStatus === "pending" ? (
        <button
          type="button"
          onClick={onCash}
          disabled={busy === `${ride.id}-cash`}
          className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy === `${ride.id}-cash` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Banknote className="h-4 w-4" aria-hidden="true" />}
          Record cash received
        </button>
      ) : null}

      {ride.events ? (
        <ol className="mt-4 space-y-2">
          {ride.events.map((event) => (
            <li key={event.id} className="flex gap-2 text-xs">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
              <span>
                <span className="font-bold">{event.label}</span> · {new Date(event.createdAt).toLocaleTimeString()}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </article>
  );
}
