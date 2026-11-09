"use client";

import { detectCapabilities, isNativeShell } from "@/lib/platform/capabilities";

/**
 * Shared location layer for NaijaDrive, NaijaSend and delivery workflows.
 *
 * Contract:
 *  - a session must be explicitly started and is bound to one work reference
 *    (`drive:<rideId>` or `send:<shipmentId>`);
 *  - fixes are timestamped on the device, queued, retried and uploaded with a
 *    client-generated id so a retry can never duplicate one;
 *  - `stale` becomes true when no fix has arrived within STALE_AFTER_MS, and the
 *    UI must stop calling the position live at that point;
 *  - nothing here simulates movement. If the platform stops delivering, the
 *    state says so.
 */

export type LocationFix = {
  clientId: string;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  speedMps: number | null;
  headingDeg: number | null;
  capturedAt: string;
  source: "browser" | "native";
};

export type LocationState = {
  active: boolean;
  sessionRef: string | null;
  lastFix: LocationFix | null;
  lastFixAt: number | null;
  stale: boolean;
  queued: number;
  error: string | null;
  mode: "browser" | "native" | "none";
};

const STALE_AFTER_MS = 90_000;
const MAX_QUEUE = 500;
const UPLOAD_BATCH = 50;

function makeId() {
  return `lp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Persisted queue so a reload or crash does not lose unsent fixes. */
type QueueStore = {
  load(): LocationFix[];
  save(fixes: LocationFix[]): void;
  clear(): void;
};

function localStorageQueue(key: string): QueueStore {
  return {
    load() {
      try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as LocationFix[]) : [];
      } catch {
        return [];
      }
    },
    save(fixes) {
      try {
        localStorage.setItem(key, JSON.stringify(fixes.slice(-MAX_QUEUE)));
      } catch {
        /* storage full or unavailable; the in-memory queue still retries */
      }
    },
    clear() {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
  };
}

export type LocationController = {
  state: LocationState;
  subscribe(listener: (state: LocationState) => void): () => void;
  start(sessionRef: string): Promise<void>;
  stop(): void;
  /** Visible-session tracking keeps the screen awake where the platform allows it. */
  requestWakeLock(): Promise<boolean>;
  releaseWakeLock(): Promise<void>;
  flush(): Promise<number>;
};

export function createLocationController(): LocationController {
  const caps = detectCapabilities();
  const store = localStorageQueue("naijadeals:location-queue");
  let queue: LocationFix[] = store.load();
  let state: LocationState = {
    active: false,
    sessionRef: null,
    lastFix: null,
    lastFixAt: null,
    stale: true,
    queued: queue.length,
    error: null,
    mode: isNativeShell() ? "native" : "browser"
  };
  const listeners = new Set<(s: LocationState) => void>();
  let watchId: number | null = null;
  let staleTimer: number | null = null;
  let uploadTimer: number | null = null;
  let wakeSentinel: WakeLockSentinel | null = null;

  const emit = (patch: Partial<LocationState>) => {
    state = { ...state, ...patch, queued: queue.length };
    for (const listener of listeners) listener(state);
  };

  const markStaleIfNeeded = () => {
    const stale = state.lastFixAt === null || Date.now() - state.lastFixAt > STALE_AFTER_MS;
    if (stale !== state.stale) emit({ stale });
  };

  async function upload() {
    if (!queue.length) return 0;
    const batch = queue.slice(0, UPLOAD_BATCH);
    try {
      const response = await fetch("/api/location/pings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionRef: state.sessionRef, fixes: batch })
      });
      if (!response.ok) {
        // 401/403 means the session ended; keep the queue but stop retrying loudly.
        emit({ error: response.status === 401 ? "Sign in again to keep sharing your location." : "Location upload failed; retrying." });
        return 0;
      }
      const sent = new Set(batch.map((fix) => fix.clientId));
      queue = queue.filter((fix) => !sent.has(fix.clientId));
      store.save(queue);
      emit({ error: null });
      return batch.length;
    } catch {
      emit({ error: "No connection. Location updates are queued and will upload when you reconnect." });
      return 0;
    }
  }

  function onPosition(position: GeolocationPosition) {
    const fix: LocationFix = {
      clientId: makeId(),
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracyM: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
      speedMps: position.coords.speed !== null && Number.isFinite(position.coords.speed) ? position.coords.speed : null,
      headingDeg: position.coords.heading !== null && Number.isFinite(position.coords.heading) ? position.coords.heading : null,
      capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
      source: "browser"
    };
    queue = [...queue, fix].slice(-MAX_QUEUE);
    store.save(queue);
    emit({ lastFix: fix, lastFixAt: Date.now(), stale: false, error: null });
    void upload();
  }

  function onError(error: GeolocationPositionError) {
    const message =
      error.code === error.PERMISSION_DENIED
        ? "Location permission was denied. Enable it in your browser settings to share your position."
        : error.code === error.POSITION_UNAVAILABLE
          ? "Your device could not get a GPS fix. Check that location services are on."
          : "Location timed out. We will retry automatically.";
    emit({ error: message });
  }

  return {
    get state() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    async start(sessionRef) {
      if (state.active) this.stop();
      emit({ active: true, sessionRef, error: null, mode: isNativeShell() ? "native" : "browser" });
      void upload();
      uploadTimer = window.setInterval(() => void upload(), 20_000);
      staleTimer = window.setInterval(markStaleIfNeeded, 15_000);

      // Native Android shell: the plugin handles background collection.
      const native = (window as unknown as { NaijaDealsLocation?: { start(options: Record<string, unknown>): Promise<void> } }).NaijaDealsLocation;
      if (isNativeShell() && native) {
        try {
          await native.start({ sessionRef });
          emit({ error: null });
          return;
        } catch {
          emit({ error: "Background tracking could not start. Falling back to visible-session tracking." });
        }
      }

      if (!caps.geolocation) {
        emit({ error: caps.notes.geolocation ?? "Location is not available in this browser." });
        return;
      }
      watchId = navigator.geolocation.watchPosition(onPosition, onError, { enableHighAccuracy: true, maximumAge: 10_000, timeout: 25_000 });
    },
    stop() {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
      if (staleTimer) window.clearInterval(staleTimer);
      if (uploadTimer) window.clearInterval(uploadTimer);
      staleTimer = null;
      uploadTimer = null;
      void this.releaseWakeLock();
      emit({ active: false, sessionRef: null });
    },
    async requestWakeLock() {
      if (!("wakeLock" in navigator)) {
        emit({ error: "This browser cannot keep the screen awake. Keep the app visible during the trip." });
        return false;
      }
      try {
        wakeSentinel = await (navigator as Navigator & { wakeLock: { request(kind: "screen"): Promise<WakeLockSentinel> } }).wakeLock.request("screen");
        wakeSentinel.addEventListener("release", () => {
          wakeSentinel = null;
        });
        return true;
      } catch {
        emit({ error: "The screen lock could not be acquired. Keep the app open during the trip." });
        return false;
      }
    },
    async releaseWakeLock() {
      await wakeSentinel?.release().catch(() => null);
      wakeSentinel = null;
    },
    flush: upload
  };
}

export const LOCATION_STALE_AFTER_MS = STALE_AFTER_MS;
