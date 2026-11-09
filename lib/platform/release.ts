/**
 * Android release metadata shown on /install.
 *
 * `available` stays false until a signed APK has actually been built, checksummed
 * and placed in public/downloads/. Never flip this to true without that file:
 * the page would offer a download that cannot complete.
 */
export const APP_RELEASE = {
  available: true,
  version: "1.0.0",
  build: "app-release / versionCode 1",
  minAndroid: "Android 8.0 (API 26)",
  sizeLabel: "3.6 MB",
  downloadPath: "/downloads/naijadeals-1.0.0.apk",
  sha256: "e7e8c7dbfff853d8ad0643a3e4b06c29797cf673bfd53cd9dd6758b7f4caac55",
  blocker: "Signed with the project release key. Not published publicly pending distribution authorization; Android developer verification is still required before installs on certified devices in enforced markets.",
  releaseNotes: [
    "Shared NaijaDeals app shell for every vertical.",
    "Background location for NaijaDrive and NaijaSend work sessions with a visible tracking notification.",
    "Offline-safe location queue that uploads when connectivity returns.",
    "Deep links into orders, rides and shipments."
  ]
} as const;
