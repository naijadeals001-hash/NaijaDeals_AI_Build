/**
 * Aura AI provider abstraction.
 *
 * One server-side interface, so the product is not welded to a single vendor:
 * streaming deltas, structured tool calls, cancellation, timeouts, bounded
 * retries and usage reporting. Credentials stay server-side and are never sent
 * to the browser.
 *
 * Verified capability of the configured provider (DeepSeek, 2026-11-05): text
 * completion, SSE streaming and function/tool calling. Live web access, image
 * understanding and audio are NOT implemented here and must not be advertised
 * anywhere in the product.
 */

export type ChatRole = "system" | "user" | "assistant" | "tool";

export type ToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ProviderMessage = {
  role: ChatRole;
  content: string;
  /** For assistant messages that issued tool calls. */
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  /** For tool result messages. */
  toolCallId?: string;
  name?: string;
};

export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "tool_call"; id: string; name: string; arguments: string }
  | { type: "usage"; promptTokens: number; completionTokens: number }
  | { type: "done"; finishReason: string }
  | { type: "error"; code: string; message: string };

export type ProviderInfo = {
  id: string;
  model: string;
  configured: boolean;
  supportsStreaming: boolean;
  supportsTools: boolean;
  /** Everything the product may claim. Kept explicit on purpose. */
  capabilities: {
    streaming: boolean;
    toolCalling: boolean;
    webAccess: boolean;
    imageInput: boolean;
    audioInput: boolean;
    speechOutput: boolean;
  };
};

const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_ATTEMPTS = 2;

export function providerConfigured() {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

export function providerInfo(): ProviderInfo {
  return {
    id: "deepseek",
    model: process.env.AURA_MODEL?.trim() || "deepseek-chat",
    configured: providerConfigured(),
    supportsStreaming: true,
    supportsTools: true,
    capabilities: {
      streaming: true,
      toolCalling: true,
      webAccess: false,
      imageInput: false,
      audioInput: false,
      speechOutput: false
    }
  };
}

/** Split a buffer into SSE frames, tolerating chunk boundaries. */
function splitFrames(buffer: string): string[] {
  return buffer.split("\n\n");
}

export type StreamOptions = {
  messages: ProviderMessage[];
  tools: ToolSpec[];
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
};

/**
 * One completion, streamed.
 *
 * Retries only when nothing has been emitted yet: re-playing a partially
 * streamed answer would duplicate text on screen.
 */
export async function* streamCompletion(options: StreamOptions): AsyncGenerator<StreamEvent> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    yield { type: "error", code: "provider_not_configured", message: "No AI provider is configured for this environment." };
    return;
  }
  const model = providerInfo().model;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let attempt = 0;
  let emitted = false;

  while (attempt < MAX_ATTEMPTS) {
    attempt += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // Propagate caller cancellation (the Stop button) into the provider request.
    const onAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onAbort);

    try {
      const res = await fetch(`${process.env.AURA_API_BASE?.trim() || "https://api.deepseek.com"}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          stream: true,
          stream_options: { include_usage: true },
          temperature: options.temperature ?? 0.4,
          max_tokens: options.maxTokens ?? 900,
          messages: options.messages.map((m) => ({
            role: m.role,
            content: m.content,
            ...(m.toolCalls?.length
              ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.arguments } })) }
              : {}),
            ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
            ...(m.role === "tool" && m.name ? { name: m.name } : {})
          })),
          ...(options.tools.length
            ? {
                tools: options.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
                tool_choice: "auto"
              }
            : {})
        }),
        signal: controller.signal
      });

      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => "");
        const retryable = res.status === 429 || res.status >= 500;
        if (retryable && attempt < MAX_ATTEMPTS && !emitted) {
          await new Promise((r) => setTimeout(r, 400 * attempt));
          continue;
        }
        yield {
          type: "error",
          code: res.status === 401 ? "provider_unauthorized" : `provider_${res.status}`,
          message: res.status === 401 ? "The AI provider rejected its credentials." : "The AI provider is unavailable right now."
        };
        if (body) void body;
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      // Tool calls arrive split across chunks and are keyed by index.
      const toolAccum = new Map<number, { id: string; name: string; arguments: string }>();
      let finishReason = "stop";
      let promptTokens = 0;
      let completionTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = splitFrames(buffer);
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          for (const line of frame.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            let json: {
              choices?: Array<{
                delta?: { content?: string; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> };
                finish_reason?: string;
              }>;
              usage?: { prompt_tokens?: number; completion_tokens?: number };
            };
            try {
              json = JSON.parse(payload);
            } catch {
              continue;
            }
            if (json.usage) {
              promptTokens = json.usage.prompt_tokens ?? 0;
              completionTokens = json.usage.completion_tokens ?? 0;
            }
            const choice = json.choices?.[0];
            if (!choice) continue;
            if (choice.delta?.content) {
              emitted = true;
              yield { type: "delta", text: choice.delta.content };
            }
            for (const call of choice.delta?.tool_calls ?? []) {
              const current = toolAccum.get(call.index) ?? { id: call.id ?? `call_${call.index}`, name: "", arguments: "" };
              if (call.id) current.id = call.id;
              if (call.function?.name) current.name = call.function.name;
              if (call.function?.arguments) current.arguments += call.function.arguments;
              toolAccum.set(call.index, current);
            }
            if (choice.finish_reason) finishReason = choice.finish_reason;
          }
        }
      }

      for (const call of toolAccum.values()) {
        emitted = true;
        yield { type: "tool_call", id: call.id, name: call.name, arguments: call.arguments };
      }
      if (promptTokens || completionTokens) yield { type: "usage", promptTokens, completionTokens };
      yield { type: "done", finishReason: toolAccum.size ? "tool_calls" : finishReason };
      return;
    } catch (error) {
      const aborted = (error as Error).name === "AbortError";
      if (aborted && options.signal?.aborted) {
        yield { type: "done", finishReason: "cancelled" };
        return;
      }
      if (attempt < MAX_ATTEMPTS && !emitted && !aborted) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
        continue;
      }
      yield {
        type: "error",
        code: aborted ? "provider_timeout" : "provider_unreachable",
        message: aborted ? "The AI provider took too long to respond." : "The AI provider could not be reached."
      };
      return;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    }
  }
}
