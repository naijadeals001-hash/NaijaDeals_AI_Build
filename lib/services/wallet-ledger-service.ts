import type { LedgerEntry, ServiceResult } from "@/lib/services/types";

export async function listLedgerEntries(walletId: string): ServiceResult<LedgerEntry[]> {
  // TODO(backend): Replace with append-only ledger API. Never compute balances from mutable client state.
  return [
    { id: "led_001", walletId, type: "hold", amountKobo: 4250000, reference: "Balogun Watch Pro escrow" },
    { id: "led_002", walletId, type: "refund", amountKobo: 820000, reference: "Damaged phone case dispute" }
  ];
}

export async function appendLedgerEntry(entry: Omit<LedgerEntry, "id">): ServiceResult<LedgerEntry> {
  // TODO(backend): Enforce idempotency keys, double-entry accounting, and signed webhook reconciliation.
  return { id: "led_demo_new", ...entry };
}
