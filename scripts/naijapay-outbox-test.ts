/**
 * Offline outbox behaviour test.
 *
 * Exercises the outbox module directly with a stubbed localStorage and a stubbed
 * transport, so the rules are checked without a browser:
 *
 *  - the idempotency key survives every retry,
 *  - a queued intent never reports "sent" without server confirmation,
 *  - intents belonging to another account are never replayed,
 *  - expired intents need a fresh confirmation instead of sending blind,
 *  - a rejected revalidation (balance or limits) blocks the send,
 *  - cancelling removes the intent.
 *
 * Usage: npx tsx scripts/naijapay-outbox-test.ts
 */
import { pathToFileURL } from "node:url";
import path from "node:path";

// --- minimal browser shims ------------------------------------------------
const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k)
  }
};
// Node already provides globalThis.crypto.getRandomValues.

let pass = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures.push(`${name}${detail ? ` (${detail})` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const MODULE = pathToFileURL(path.join(process.cwd(), "lib", "pay", "outbox.ts")).href;

(async () => {
  const outbox = await import(MODULE);

  const A = "user-a";
  const B = "user-b";

  console.log("\n1) Queueing");
  const item = outbox.queueIntent({ kind: "transfer", target: "friend@naijadeals.test", amountKobo: "50000", ownerUserId: A, note: "rent" });
  check("intent is queued", item.status === "queued", item.status);
  check("intent carries an idempotency key", typeof item.idempotencyKey === "string" && item.idempotencyKey.length >= 16);
  check("intent stores no session or PIN data", !JSON.stringify(item).match(/pin|password|token|session/i));
  check("listOutbox returns it for its owner", outbox.listOutbox(A).length === 1);
  check("listOutbox hides it from another account", outbox.listOutbox(B).length === 0);

  console.log("\n2) Replay keeps the same key");
  const sentKeys: string[] = [];
  const send = async (payload: { idempotencyKey: string }) => {
    sentKeys.push(payload.idempotencyKey);
    return { ok: true, status: 201, body: { reference: "P2P-first", duplicate: false } };
  };
  const allow = async () => ({ allowed: true });

  const first = await outbox.replayIntent(outbox.listOutbox(A)[0], send, allow);
  check("replay reports sent once the server confirms", first.outcome === "sent", first.outcome);
  check("server reference is recorded", outbox.listOutbox(A)[0]?.reference === "P2P-first");

  const again = await outbox.replayIntent(outbox.listOutbox(A)[0], send, allow);
  check("replaying a sent intent does nothing", again.outcome === "already_sent", again.outcome);
  check("the key never changed across attempts", new Set(sentKeys).size === 1 && sentKeys[0] === item.idempotencyKey);

  console.log("\n3) Account switching");
  const pending = outbox.queueIntent({ kind: "transfer", target: "other@naijadeals.test", amountKobo: "999", ownerUserId: A });
  outbox.pruneForUser(B);
  check("another account cannot see the first account's intents", outbox.listOutbox(B).length === 0);
  // Pruning for A drops A's completed intents but keeps A's pending one.
  const keptForA = outbox.pruneForUser(A);
  check("the owner keeps their pending intent", keptForA.some((i: { id: string }) => i.id === pending.id));
  check("completed intents are pruned", !keptForA.some((i: { status: string }) => i.status === "sent"));

  console.log("\n4) Blocked revalidation");
  const blocked = outbox.queueIntent({ kind: "transfer", target: "friend@naijadeals.test", amountKobo: "999999", ownerUserId: A });
  const refused = await outbox.replayIntent(outbox.listOutbox(A).find((i: { id: string }) => i.id === blocked.id), send, async () => ({ allowed: false, reason: "Balance no longer covers this transfer." }));
  check("a failed revalidation prevents sending", refused.outcome === "needs_confirmation", refused.outcome);
  check("the blocked intent is marked for confirmation", outbox.listOutbox(A).find((i: { id: string }) => i.id === blocked.id)?.status === "needs_confirmation");
  outbox.removeItem(blocked.id);

  console.log("\n5) Expiry");
  const stale = outbox.queueIntent({ kind: "transfer", target: "friend@naijadeals.test", amountKobo: "1000", ownerUserId: A });
  outbox.updateItem(stale.id, { expiresAt: new Date(Date.now() - 60_000).toISOString() });
  const staleSend = async () => {
    throw new Error("must not be called for an expired intent");
  };
  const expired = await outbox.replayIntent(outbox.listOutbox(A).find((i: { id: string }) => i.id === stale.id), staleSend, allow);
  check("an expired intent is not sent", expired.outcome === "expired", expired.outcome);
  outbox.removeItem(stale.id);

  console.log("\n6) Server refusal and offline");
  const refusedItem = outbox.queueIntent({ kind: "transfer", target: "friend@naijadeals.test", amountKobo: "1000", ownerUserId: A });
  const rejected = await outbox.replayIntent(outbox.listOutbox(A).find((i: { id: string }) => i.id === refusedItem.id), async () => ({ ok: false, status: 409, body: { error: "insufficient_funds" } }), allow);
  check("a server rejection marks the intent failed", rejected.outcome === "failed", rejected.outcome);
  outbox.removeItem(refusedItem.id);

  const offlineItem = outbox.queueIntent({ kind: "transfer", target: "friend@naijadeals.test", amountKobo: "1000", ownerUserId: A });
  const offline = await outbox.replayIntent(
    outbox.listOutbox(A).find((i: { id: string }) => i.id === offlineItem.id),
    async () => {
      throw new Error("network down");
    },
    allow
  );
  check("a network failure leaves it queued, not sent", offline.outcome === "offline" && outbox.listOutbox(A).find((i: { id: string }) => i.id === offlineItem.id)?.status === "queued");
  outbox.removeItem(offlineItem.id);

  console.log("\n7) Cancellation and sign-out");
  const cancelTarget = outbox.queueIntent({ kind: "transfer", target: "friend@naijadeals.test", amountKobo: "1000", ownerUserId: A });
  outbox.removeItem(cancelTarget.id);
  check("cancelling removes the intent", outbox.listOutbox(A).every((i: { id: string }) => i.id !== cancelTarget.id));
  outbox.clearOutbox();
  check("sign-out clears every queued intent", outbox.listOutbox(A).length === 0 && outbox.listOutbox(B).length === 0);

  console.log(`\n${pass} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("Failures:\n" + failures.map((f) => " - " + f).join("\n"));
    process.exit(1);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
