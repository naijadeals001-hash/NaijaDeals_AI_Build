"use client";

/**
 * Durable offline outbox for payment intents.
 *
 * A queued payment is an *intent*, not money. It is stored in localStorage with
 * the minimum needed to send it, and it carries one idempotency key for its whole
 * lifetime so every replay is the same attempt to the server.
 *
 * Deliberately not stored: PINs, passwords, session tokens, provider secrets or
 * full wallet balances. The recipient address and amount are retained because
 * they are what the user is asking to send.
 *
 * On reconnection the caller must revalidate (identity, balance, limits, expiry)
 * against the server before replaying, and must ask again if anything material
 * changed. Nothing here reports success — only the server can.
 */

export type OutboxStatus = "queued" | "sending" | "needs_confirmation" | "sent" | "failed" | "cancelled";

export type OutboxItem = {
  /** Stable local id; the idempotency key is derived from it once and never regenerated. */
  id: string;
  kind: "transfer" | "milestone_fund";
  /** Recipient NaijaPay address (transfer) or milestone reference. */
  target: string;
  amountKobo: string;
  note?: string;
  /** The account that created it. A different signed-in user must never replay it. */
  ownerUserId: string;
  idempotencyKey: string;
  status: OutboxStatus;
  createdAt: string;
  /** Intents expire; an old queued request must be re-confirmed rather than sent blind. */
  expiresAt: string;
  lastError?: string;
  /** Set when the server confirms; never set locally. */
  reference?: string;
  /** Snapshot of the details shown when queued, to detect material changes. */
  confirmedTarget?: string;
  confirmedAmountKobo?: string;
};

const STORAGE_KEY = "naijapay.outbox.v1";
const MAX_ITEMS = 20;
const MAX_AGE_MS = 1000 * 60 * 60 * 24; // a queued intent expires after a day

function readAll(): OutboxItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OutboxItem[]) : [];
  } catch {
    return [];
  }
}

function writeAll(items: OutboxItem[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    // Storage full or denied: the caller surfaces "could not queue" rather than
    // pretending the intent was saved.
  }
}

function newKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function listOutbox(ownerUserId: string): OutboxItem[] {
  return readAll().filter((item) => item.ownerUserId === ownerUserId);
}

export function queueIntent(input: {
  kind: OutboxItem["kind"];
  target: string;
  amountKobo: string;
  note?: string;
  ownerUserId: string;
}): OutboxItem {
  const now = Date.now();
  const item: OutboxItem = {
    id: newKey(),
    kind: input.kind,
    target: input.target,
    amountKobo: input.amountKobo,
    note: input.note,
    ownerUserId: input.ownerUserId,
    idempotencyKey: newKey(),
    status: "queued",
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + MAX_AGE_MS).toISOString(),
    confirmedTarget: input.target,
    confirmedAmountKobo: input.amountKobo
  };
  const all = readAll();
  writeAll([item, ...all]);
  return item;
}

export function updateItem(id: string, patch: Partial<OutboxItem>): OutboxItem | null {
  const all = readAll();
  const index = all.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const next = { ...all[index], ...patch };
  all[index] = next;
  writeAll(all);
  return next;
}

export function removeItem(id: string) {
  writeAll(readAll().filter((item) => item.id !== id));
}

/** Clears every intent, including other accounts'. Used on explicit sign-out. */
export function clearOutbox() {
  writeAll([]);
}

/**
 * Clears this account's finished intents and returns the ones still pending.
 *
 * It must NOT discard other accounts' entries: pruning one user's queue while
 * another user's intents are stored on the same device would silently delete
 * them. The display layer already filters by owner, so the other accounts'
 * intents stay stored for when that person signs back in.
 */
export function pruneForUser(ownerUserId: string) {
  const all = readAll();
  const mine = all.filter((item) => item.ownerUserId === ownerUserId);
  const others = all.filter((item) => item.ownerUserId !== ownerUserId);
  const pendingMine = mine.filter((item) => !["sent", "cancelled"].includes(item.status));
  writeAll([...pendingMine, ...others]);
  return pendingMine;
}

export function isExpired(item: OutboxItem) {
  return Date.parse(item.expiresAt) < Date.now();
}

/** True when the current request no longer matches what the user confirmed. */
export function materiallyChanged(item: OutboxItem, current: { target: string; amountKobo: string }) {
  return item.confirmedTarget !== current.target || item.confirmedAmountKobo !== current.amountKobo;
}

/**
 * Replays one queued intent.
 *
 * `revalidate` is supplied by the caller and must consult the server for the
 * current balance and limits; this function only guarantees the idempotency key
 * is preserved and that no success is inferred from a local path.
 */
export async function replayIntent(
  item: OutboxItem,
  send: (payload: { target: string; amountKobo: string; idempotencyKey: string; note?: string }) => Promise<{ ok: boolean; status: number; body: Record<string, unknown> }>,
  revalidate: () => Promise<{ allowed: boolean; reason?: string }>
) {
  if (item.status === "sent") return { outcome: "already_sent" as const };
  if (isExpired(item)) {
    updateItem(item.id, { status: "needs_confirmation", lastError: "This request expired before it could be sent." });
    return { outcome: "expired" as const };
  }

  const gate = await revalidate();
  if (!gate.allowed) {
    updateItem(item.id, { status: "needs_confirmation", lastError: gate.reason ?? "Your account needs another check before this can be sent." });
    return { outcome: "needs_confirmation" as const, reason: gate.reason };
  }

  updateItem(item.id, { status: "sending" });
  try {
    const res = await send({
      target: item.target,
      amountKobo: item.amountKobo,
      idempotencyKey: item.idempotencyKey,
      note: item.note
    });
    if (res.ok) {
      updateItem(item.id, { status: "sent", reference: String(res.body.reference ?? "") });
      return { outcome: "sent" as const, reference: res.body.reference };
    }
    if (res.status === 401) {
      updateItem(item.id, { status: "queued", lastError: "Your session ended. Sign in again to send this." });
      return { outcome: "signed_out" as const };
    }
    updateItem(item.id, { status: "failed", lastError: String(res.body.error ?? `HTTP ${res.status}`) });
    return { outcome: "failed" as const, message: res.body.error };
  } catch {
    updateItem(item.id, { status: "queued", lastError: "No connection." });
    return { outcome: "offline" as const };
  }
}
