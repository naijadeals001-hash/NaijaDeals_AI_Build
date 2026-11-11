"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type BrowserLocationStatus =
  | "idle"
  | "requesting"
  | "active"
  | "denied"
  | "unavailable"
  | "timeout"
  | "unsupported"
  | "error";

export type BrowserFix = {
  lat: number;
  lng: number;
  accuracyM: number;
  capturedAt: number;
  source: "browser";
};

const STALE_AFTER_MS = 90_000;

function messageFor(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return "Location permission was denied. Allow location for this site in your browser settings, then try again.";
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return "Your device could not get a GPS fix. Check that location services are switched on.";
  }
  return "Location timed out. The browser did not return a position in time.";
}

/**
 * Browser-only geolocation for the driver workspace.
 *
 * Every coordinate comes from `navigator.geolocation`; there is no simulated
 * fallback. A denied, unavailable or timed-out request leaves the driver offline
 * with a specific reason. The watch is stopped on unmount and whenever the driver
 * goes offline with no active trip, and the last fix is marked stale after 90 s
 * instead of being presented as live.
 */
export function useBrowserLocation(onFix?: (fix: BrowserFix) => void) {
  const [fix, setFix] = useState<BrowserFix | null>(null);
  const [status, setStatus] = useState<BrowserLocationStatus>("idle");
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const watchRef = useRef<number | null>(null);
  const onFixRef = useRef(onFix);
  onFixRef.current = onFix;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);

  const apply = useCallback((position: GeolocationPosition) => {
    const next: BrowserFix = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracyM: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : 0,
      capturedAt: position.timestamp || Date.now(),
      source: "browser"
    };
    setFix(next);
    setStatus("active");
    setError("");
    onFixRef.current?.(next);
  }, []);

  const fail = useCallback((geoError: GeolocationPositionError) => {
    setStatus(
      geoError.code === geoError.PERMISSION_DENIED
        ? "denied"
        : geoError.code === geoError.POSITION_UNAVAILABLE
          ? "unavailable"
          : "timeout"
    );
    setError(messageFor(geoError));
  }, []);

  const requestOnce = useCallback(async () => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setStatus("unsupported");
      setError("This browser cannot share a location. Use a browser with geolocation support.");
      return null;
    }
    setStatus("requesting");
    setError("");
    return new Promise<BrowserFix | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          apply(position);
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracyM: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : 0,
            capturedAt: position.timestamp || Date.now(),
            source: "browser"
          });
        },
        (geoError) => {
          fail(geoError);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 }
      );
    });
  }, [apply, fail]);

  const startWatch = useCallback(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setStatus("unsupported");
      setError("This browser cannot share a location. Use a browser with geolocation support.");
      return;
    }
    if (watchRef.current !== null) return;
    watchRef.current = navigator.geolocation.watchPosition(apply, fail, {
      enableHighAccuracy: true,
      timeout: 25_000,
      maximumAge: 10_000
    });
    setStatus((current) => (current === "active" ? current : "requesting"));
  }, [apply, fail]);

  const stopWatch = useCallback(() => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    setStatus((current) => (current === "active" ? "idle" : current));
  }, []);

  useEffect(() => () => stopWatch(), [stopWatch]);

  const ageSeconds = fix ? Math.max(0, Math.floor((now - fix.capturedAt) / 1000)) : null;
  const stale = !fix || (ageSeconds !== null && ageSeconds * 1000 > STALE_AFTER_MS);

  return {
    fix,
    status,
    error,
    stale,
    ageSeconds,
    staleAfterSeconds: STALE_AFTER_MS / 1000,
    requestOnce,
    startWatch,
    stopWatch,
    message: error
  };
}
