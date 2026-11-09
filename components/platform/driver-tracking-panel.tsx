"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, LocateFixed, MonitorSmartphone, Pause, Play } from "lucide-react";
import { usePlatform } from "@/components/platform/platform-provider";
import { createLocationController, LOCATION_STALE_AFTER_MS, type LocationState } from "@/lib/platform/location";

/**
 * Driver tracking panel.
 *
 * Starts only on an explicit action and stops when the session ends. It never
 * describes a position as live once it is stale: after LOCATION_STALE_AFTER_MS
 * the panel shows the exact last-update time and says tracking has stopped.
 * Dispatch eligibility is decided on the server from the same timestamps.
 */
export function DriverTrackingPanel({ sessionRef, label }: { sessionRef: string; label: string }) {
  const { capabilities, online } = usePlatform();
  const controller = useMemo(() => createLocationController(), []);
  const [state, setState] = useState<LocationState>(controller.state);
  const [wakeHeld, setWakeHeld] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => controller.subscribe(setState), [controller]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => () => controller.stop(), [controller]);

  const ago = state.lastFixAt ? Math.round((now - state.lastFixAt) / 1000) : null;
  const live = state.active && !state.stale && state.lastFixAt !== null;

  return (
    <section aria-labelledby="tracking" className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
      <div className="flex items-center justify-between gap-2">
        <h2 id="tracking" className="font-display text-[14px] font-extrabold">Location sharing</h2>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${live ? "bg-[#e8f3e4] text-[#0b5c33]" : state.active ? "bg-[#fff3e8] text-[#a3480f]" : "bg-[#f2f0ea] text-[#6b7a70]"}`}>
          {live ? "Live" : state.active ? "Stale" : "Off"}
        </span>
      </div>
      <p className="mt-0.5 text-[10.5px] leading-4 text-[#6b7a70]">For {label}. Tracking runs only while you have this session active.</p>

      {state.active ? (
        <div className="mt-2 space-y-1.5 text-[11px]">
          <p className="flex items-center gap-1.5">
            <LocateFixed className={`h-3.5 w-3.5 ${live ? "text-[#0b8f47]" : "text-[#a3480f]"}`} aria-hidden />
            {state.lastFixAt ? (
              live ? `Updated ${ago}s ago` : `Last update ${ago}s ago — location is stale`
            ) : (
              "Waiting for the first location fix"
            )}
          </p>
          {state.lastFix?.accuracyM ? <p className="text-[#5d6d64]">Accuracy ±{Math.round(state.lastFix.accuracyM)} m</p> : null}
          <p className="text-[#5d6d64]">{state.queued ? `${state.queued} update${state.queued === 1 ? "" : "s"} waiting to upload` : "All updates uploaded"}{online ? "" : " · offline, will retry"}</p>
          <p className="text-[10px] text-[#6b7a70]">
            Source: {state.mode === "native" ? "Android background service" : "this browser, while the app is open"}
          </p>
        </div>
      ) : null}

      {!capabilities.backgroundLocation ? (
        <p className="mt-2 rounded-lg bg-[#fff3e8] p-2 text-[10.5px] leading-4 text-[#a3480f]">
          <AlertTriangle className="mr-1 inline h-3 w-3" aria-hidden />
          {capabilities.notes.backgroundLocation}
        </p>
      ) : null}

      {state.error ? <p role="alert" className="mt-1.5 rounded-lg bg-[#fff3e8] p-2 text-[10.5px] font-semibold text-[#a3480f]">{state.error}</p> : null}

      <div className="mt-2 flex flex-wrap gap-1.5">
        {state.active ? (
          <button type="button" onClick={() => controller.stop()} className="flex items-center gap-1 rounded-full bg-[#a3480f] px-3 py-1.5 text-[11px] font-extrabold text-white"><Pause className="h-3.5 w-3.5" aria-hidden /> Stop sharing</button>
        ) : (
          <button type="button" onClick={() => void controller.start(sessionRef)} className="flex items-center gap-1 rounded-full bg-[#0b5c33] px-3 py-1.5 text-[11px] font-extrabold text-white"><Play className="h-3.5 w-3.5" aria-hidden /> Start sharing location</button>
        )}
        {capabilities.wakeLock && state.active ? (
          <button
            type="button"
            onClick={async () => {
              if (wakeHeld) {
                await controller.releaseWakeLock();
                setWakeHeld(false);
              } else {
                setWakeHeld(await controller.requestWakeLock());
              }
            }}
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-extrabold text-[#0b5c33] ring-1 ring-[#cfe3ca]"
          >
            <MonitorSmartphone className="h-3.5 w-3.5" aria-hidden /> {wakeHeld ? "Release screen lock" : "Keep screen awake"}
          </button>
        ) : null}
      </div>
      {wakeHeld ? <p className="mt-1 text-[9.5px] leading-4 text-[#6b7a70]">The screen stays on, which uses noticeably more battery. Release it when you pause.</p> : null}
      <p className="mt-1.5 text-[9.5px] leading-4 text-[#9aa59e]">
        Location is shared with dispatch only while this session is active, marked stale after {Math.round(LOCATION_STALE_AFTER_MS / 1000)}s without an update, and kept for {30} days.
      </p>
    </section>
  );
}
