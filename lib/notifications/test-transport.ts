import type { NotificationTransport } from "./transports";

/**
 * Deterministic failure seam for the acceptance tests.
 *
 * Guard: this transport only exists when `NODE_ENV !== "production"` AND
 * `NOTIFICATION_TEST_FLAKY` is set to `retry-once`, `fail-once-then-succeed`
 * (alias of retry-once) or `permanent`. With the variable unset — and in every
 * production build regardless of the variable — `flakyTestMode()` returns null
 * and the delivery chain is byte-for-byte the normal one.
 *
 * State is in-memory and keyed on the notification id, so exactly the first
 * send of a given notification fails once. Nothing is logged and no payload is
 * retained; only the ids are held, for the life of the process.
 */

export type FlakyTestMode = "retry-once" | "permanent";

const consumed = new Set<string>();

export function flakyTestMode(): FlakyTestMode | null {
  if (process.env.NODE_ENV === "production") return null;
  const raw = (process.env.NOTIFICATION_TEST_FLAKY ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "permanent") return "permanent";
  if (raw === "retry-once" || raw === "fail-once-then-succeed") return "retry-once";
  return null;
}

/**
 * Wraps the real in-app transport. The first attempt for a notification fails
 * exactly as a provider outage would; later attempts delegate to the real
 * transport, so a recovered message still writes its feed row.
 *
 * The caller must use this as the only transport for the channel: leaving the
 * real transport behind it would let the same call fall through and succeed
 * immediately, which is not the failure being tested.
 */
export function flakyInAppTestTransport(next: NotificationTransport, mode: FlakyTestMode): NotificationTransport {
  return {
    name: "test-flaky",
    channel: "IN_APP",
    configured: () => next.configured(),
    async send(message) {
      if (mode === "permanent") {
        return { ok: false, retryable: false, provider: "test-flaky", error: "test_flaky_permanent" };
      }
      if (!consumed.has(message.notificationId)) {
        consumed.add(message.notificationId);
        return { ok: false, retryable: true, provider: "test-flaky", error: "test_flaky_retry_once" };
      }
      return next.send(message);
    }
  };
}

/** Test-only hook so one scenario can be re-armed inside a long-lived process. */
export function resetFlakyTestState(): void {
  consumed.clear();
}
