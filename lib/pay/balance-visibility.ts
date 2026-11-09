/**
 * Shared balance-privacy preference for the NaijaPay surfaces.
 *
 * The customer's choice must not reset when they move between the landing card
 * and the wallet screen, so both read and write one key.
 */
export const BALANCE_VISIBILITY_KEY = "naijapay.balanceVisible";

export function readBalanceVisibility(): boolean | null {
  try {
    const stored = window.localStorage.getItem(BALANCE_VISIBILITY_KEY);
    if (stored === "hidden") return false;
    if (stored === "shown") return true;
  } catch {
    // Storage can be unavailable in private mode; the caller keeps its default.
  }
  return null;
}

export function writeBalanceVisibility(visible: boolean) {
  try {
    window.localStorage.setItem(BALANCE_VISIBILITY_KEY, visible ? "shown" : "hidden");
  } catch {
    // Preference is a convenience, not a requirement.
  }
}
