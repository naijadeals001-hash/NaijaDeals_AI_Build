import type { StreamEvent, StreamOptions } from "./provider";

/**
 * Deterministic test provider for Aura.
 *
 * Emits the same StreamEvent union the real provider emits, through the same
 * generator seam, so the SSE route, orchestration, tool execution, persistence,
 * authentication and rate limiting all stay in the request path. Nothing here
 * intercepts HTTP or fabricates a browser response.
 *
 * Activation is configuration-only and impossible for a normal user:
 *   AURA_TEST_PROVIDER=1              required
 *   AURA_TEST_ALLOW_PRODUCTION_BUILD=1  additionally required when NODE_ENV is
 *                                       "production", because `next start` sets
 *                                       that even for a local preview build
 * No header, query parameter or session can enable it.
 *
 * Failure and timing are configurable so tests can drive each path:
 *   AURA_TEST_CHUNK_DELAY_MS  default 120
 *   AURA_TEST_FAIL=1          emit an error event instead of text
 *   AURA_TEST_TOOL=<name>     optionally emit one tool_call before the text
 */

const CHUNKS = ["Your ", "Abuja ", "stays ", "are ", "ready ", "to ", "review."];

export function testProviderRefusal(): string | null {
  if (process.env.AURA_TEST_PROVIDER !== "1") return "not_requested";
  if (process.env.NODE_ENV === "production" && process.env.AURA_TEST_ALLOW_PRODUCTION_BUILD !== "1") {
    return "production_build_not_authorised";
  }
  return null;
}

export function testProviderEnabled(): boolean {
  return testProviderRefusal() === null;
}

function delay(ms: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false);
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(!signal?.aborted);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function* streamTestCompletion(options: StreamOptions = { messages: [], tools: [] }): AsyncGenerator<StreamEvent> {
  const refusal = testProviderRefusal();
  if (refusal) {
    yield { type: "error", code: "test_provider_unavailable", message: `The test provider is disabled (${refusal}).` };
    return;
  }

  const chunkDelay = Number(process.env.AURA_TEST_CHUNK_DELAY_MS ?? 120);
  const signal = options.signal;

  if (process.env.AURA_TEST_FAIL === "1") {
    yield { type: "delta", text: "Partial " };
    await delay(chunkDelay, signal);
    if (signal?.aborted) return;
    yield { type: "error", code: "test_provider_failure", message: "Controlled provider failure for testing." };
    return;
  }

  const toolName = process.env.AURA_TEST_TOOL?.trim();
  if (toolName) {
    yield { type: "tool_call", id: "test-call-1", name: toolName, arguments: JSON.stringify({ city: "Abuja" }) };
    const keepGoing = await delay(chunkDelay, signal);
    if (!keepGoing) return;
  }

  for (const text of CHUNKS) {
    const keepGoing = await delay(chunkDelay, signal);
    if (!keepGoing) return; // aborted: no further chunks are emitted
    yield { type: "delta", text };
  }

  const keepGoing = await delay(chunkDelay, signal);
  if (!keepGoing) return;

  yield { type: "usage", promptTokens: 11, completionTokens: CHUNKS.length };
  yield { type: "done", finishReason: "stop" };
}
