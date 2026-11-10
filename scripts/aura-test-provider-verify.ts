import "dotenv/config";
import { streamCompletion, type StreamEvent } from "../lib/aura/provider";
import { streamTestCompletion, testProviderEnabled, testProviderRefusal } from "../lib/aura/test-provider";

/**
 * Focused checks for the deterministic Aura test provider.
 *
 *   npx tsx scripts/aura-test-provider-verify.ts
 *
 * No network and no paid model: outbound fetch is replaced with a spy that
 * fails loudly if anything tries to reach a provider.
 */

const rows: { name: string; status: "PASS" | "FAIL"; detail: string }[] = [];
function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}
async function check(name: string, run: () => Promise<string>) {
  try {
    rows.push({ name, status: "PASS", detail: await run() });
  } catch (error) {
    rows.push({ name, status: "FAIL", detail: error instanceof Error ? error.message : String(error) });
  }
}

const ALLOWED = new Set(["delta", "tool_call", "usage", "done", "error"]);
let fetchCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
  fetchCalls += 1;
  throw new Error(`outbound_fetch_blocked:${String(args[0]).slice(0, 60)}`);
}) as typeof fetch;

async function collect(options: { signal?: AbortSignal } = {}): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of streamTestCompletion({ messages: [], tools: [], ...options })) events.push(event);
  return events;
}

async function main() {
  process.env.AURA_TEST_PROVIDER = "1";
  process.env.AURA_TEST_CHUNK_DELAY_MS = "25";
  delete process.env.AURA_TEST_FAIL;
  delete process.env.AURA_TEST_TOOL;

  await check("1. chunks arrive in order before completion", async () => {
    const events = await collect();
    const deltas = events.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text);
    assert(deltas.length >= 3, `only ${deltas.length} chunks`);
    const doneIndex = events.findIndex((e) => e.type === "done");
    assert(doneIndex === events.length - 1, "done is not the last event");
    assert(events.slice(doneIndex + 1).length === 0, "events emitted after done");
    return `${deltas.length} chunks then done: "${deltas.join("")}"`;
  });

  await check("2. events match the real StreamEvent contract", async () => {
    const events = await collect();
    for (const event of events) assert(ALLOWED.has(event.type), `unknown event type ${event.type}`);
    const usage = events.find((e) => e.type === "usage") as { promptTokens: number; completionTokens: number } | undefined;
    assert(usage && typeof usage.promptTokens === "number", "usage event missing or malformed");
    return `types: ${[...new Set(events.map((e) => e.type))].join(", ")}`;
  });

  await check("3. cancellation mid-delay stops later chunks", async () => {
    const controller = new AbortController();
    const events: StreamEvent[] = [];
    let count = 0;
    for await (const event of streamTestCompletion({ messages: [], tools: [], signal: controller.signal })) {
      events.push(event);
      count += 1;
      if (count === 2) controller.abort();
    }
    const deltas = events.filter((e) => e.type === "delta").length;
    assert(deltas <= 2, `${deltas} deltas after abort at 2`);
    assert(!events.some((e) => e.type === "done"), "done emitted after abort");
    return `aborted after 2 events, no done, ${events.length} total`;
  });

  await check("4. controlled failure follows the error contract", async () => {
    process.env.AURA_TEST_FAIL = "1";
    try {
      const events = await collect();
      const error = events.find((e) => e.type === "error") as { code: string; message: string } | undefined;
      if (!error) throw new Error("no error event");
      assert(error.code === "test_provider_failure", `code ${error.code}`);
      assert(!events.some((e) => e.type === "done"), "done emitted after error");
      return `error ${error.code}, no done`;
    } finally {
      delete process.env.AURA_TEST_FAIL;
    }
  });

  await check("5. production build is refused without explicit authorisation", async () => {
    const saved = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      delete process.env.AURA_TEST_ALLOW_PRODUCTION_BUILD;
      assert(!testProviderEnabled(), "enabled in a production build");
      assert(testProviderRefusal() === "production_build_not_authorised", `refusal ${testProviderRefusal()}`);
      process.env.AURA_TEST_ALLOW_PRODUCTION_BUILD = "1";
      assert(testProviderEnabled(), "not enabled for the authorised local test build");
      return "refused in production, allowed with the explicit build flag";
    } finally {
      if (saved === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved;
      delete process.env.AURA_TEST_ALLOW_PRODUCTION_BUILD;
    }
  });

  await check("6. no outbound model request occurs", async () => {
    assert(fetchCalls === 0, `${fetchCalls} outbound fetch calls`);
    // And the real generator refuses to reach out when no key is configured.
    process.env.AURA_TEST_PROVIDER = "0";
    delete process.env.DEEPSEEK_API_KEY;
    const events: StreamEvent[] = [];
    for await (const event of streamCompletion({ messages: [], tools: [] })) events.push(event);
    assert(events[0]?.type === "error", "real provider did not fail closed");
    assert(fetchCalls === 0, `${fetchCalls} fetches after real-provider attempt`);
    return `0 fetch calls, real provider fails closed with ${(events[0] as { code?: string }).code}`;
  });

  globalThis.fetch = realFetch;

  const width = Math.max(...rows.map((row) => row.name.length));
  for (const row of rows) console.log(`${row.status.padEnd(4)} ${row.name.padEnd(width)}  ${row.detail}`);
  const failed = rows.filter((row) => row.status === "FAIL").length;
  console.log(`\n${rows.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  globalThis.fetch = realFetch;
  console.error("crashed:", error);
  process.exit(1);
});
