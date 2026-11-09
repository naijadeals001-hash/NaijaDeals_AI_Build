/**
 * Android release metadata shown on /install.
 *
 * `available` stays false until a signed APK has actually been built, checksummed
 * and placed in public/downloads/. Never flip this to true without that file:
 * the page would offer a download that cannot complete.
 */
export const APP_RELEASE = {
  available: false,
  version: "1.0.0",
  build: "not built",
  minAndroid: "Android 8.0 (API 26)",
  sizeLabel: "—",
  downloadPath: "/downloads/naijadeals-1.0.0.apk",
  sha256: "Not available — the APK has not been built in this environment (no Android SDK).",
  blocker: "no Android SDK or Gradle on the build machine, and no signing key has been created. See docs/mobile-foundation.md for the exact build steps.",
  releaseNotes: [
    "Shared NaijaDeals app shell for every vertical.",
    "Background location for NaijaDrive and NaijaSend work sessions with a visible tracking notification.",
    "Offline-safe location queue that uploads when connectivity returns.",
    "Deep links into orders, rides and shipments."
  ]
} as const;
