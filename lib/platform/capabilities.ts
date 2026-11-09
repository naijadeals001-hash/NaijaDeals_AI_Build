"use client";

/**
 * Device capability detection, shared by every NaijaDeals vertical.
 *
 * The rule this enforces: a feature is only offered when the current platform
 * can actually perform it. Nothing here claims parity between Android and iOS —
 * `backgroundLocation` is false on iOS PWAs because WebKit does not provide it,
 * and the UI must degrade rather than pretend.
 */

export type Platform = "android" | "ios" | "desktop" | "unknown";

export type Capabilities = {
  platform: Platform;
  standalone: boolean;
  serviceWorker: boolean;
  push: boolean;
  geolocation: boolean;
  /** Dependable location while the app is backgrounded or the screen is locked. */
  backgroundLocation: boolean;
  wakeLock: boolean;
  camera: boolean;
  fileUpload: boolean;
  share: boolean;
  paymentRequest: boolean;
  /** Reason shown to users when a capability is unavailable. */
  notes: Record<string, string>;
};

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/Mac|Win|Linux/i.test(ua)) return "desktop";
  return "unknown";
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return window.matchMedia("(display-mode: standalone)").matches || iosStandalone;
}

export function isNativeShell() {
  if (typeof window === "undefined") return false;
  return Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
}

export function detectCapabilities(): Capabilities {
  const platform = detectPlatform();
  const nativeShell = isNativeShell();
  const secure = typeof window !== "undefined" && window.isSecureContext;
  const notes: Record<string, string> = {};

  const serviceWorker = typeof navigator !== "undefined" && "serviceWorker" in navigator && secure;
  const push = typeof window !== "undefined" && "PushManager" in window && secure;
  const geolocation = typeof navigator !== "undefined" && "geolocation" in navigator && secure;
  const wakeLock = typeof navigator !== "undefined" && "wakeLock" in navigator;
  const share = typeof navigator !== "undefined" && "share" in navigator;
  const paymentRequest = typeof window !== "undefined" && "PaymentRequest" in window;

  // Background location: available in the native Android shell (foreground
  // service), never in an iOS PWA, and not in a browser tab.
  const backgroundLocation = nativeShell && platform === "android";
  if (!backgroundLocation) {
    notes.backgroundLocation =
      platform === "ios"
        ? "iOS does not allow a web app to receive location while the screen is locked or Safari is in the background. Tracking works only while the app is open and visible."
        : nativeShell
          ? "Background tracking requires the Android app."
          : "Background tracking requires the NaijaDeals Android app. In the browser, location updates only while the screen is on and the app is visible.";
  }
  if (!wakeLock) notes.wakeLock = "This browser cannot keep the screen awake automatically. Keep the screen on during an active trip.";
  if (!push) notes.push = "Push notifications are not available in this browser. Status updates appear in the app when it is open.";
  if (!geolocation) notes.geolocation = "Location is unavailable. Check permissions and that the site is served over HTTPS.";
  if (!secure) notes.secureContext = "Location and install features require HTTPS.";

  return {
    platform,
    standalone: isStandalone(),
    serviceWorker,
    push,
    geolocation,
    backgroundLocation,
    wakeLock,
    camera: typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia),
    fileUpload: typeof FileReader !== "undefined",
    share,
    paymentRequest,
    notes
  };
}

/** Human-readable one-liner for a capability, used in tables and settings. */
export function capabilityLabel(cap: keyof Capabilities): string {
  const labels: Record<string, string> = {
    serviceWorker: "Offline & install",
    push: "Push notifications",
    geolocation: "Current location",
    backgroundLocation: "Background location",
    wakeLock: "Screen wake lock",
    camera: "Camera",
    fileUpload: "File upload",
    share: "Native share",
    paymentRequest: "Payment Request API"
  };
  return labels[cap] ?? cap;
}
