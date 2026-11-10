"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";

type Data = {
  provider: { id: string; model: string; configured: boolean; capabilities: Record<string, boolean> };
  tools: Array<{ name: string; description: string; status: string | null }>;
  usage7d: { turns: number; succeeded: number; failed: number; promptTokens: number; completionTokens: number; toolCalls: number; averageLatencyMs: number };
  recent: Array<{ provider: string; model: string; status: string; latencyMs: number; toolCalls: number; errorCode: string | null; createdAt: string }>;
  conversations: number;
  savedAnswers: number;
  privacy: string;
};

/**
 * Aura administration inside the existing Control Center (dark workspace).
 *
 * Shows provider status, the tool registry and seven-day usage. It deliberately
 * renders no conversation content: counts and latency only.
 */
export function AdminAuraPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const res = await fetch("/api/admin/aura", { credentials: "include" });
    if (!res.ok) {
      setError(res.status === 403 ? "You need the finance:read permission to view Aura administration." : `Could not load Aura status (HTTP ${res.status}).`);
      setData(null);
      return;
    }
    setData(await res.json());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !data) return <p className="rounded-xl bg-[#F85149]/15 px-4 py-3 text-sm text-[#F85149]">{error}</p>;
  if (!data) return <div className="h-40 animate-pulse rounded-2xl bg-[#161B22]" aria-busy="true" />;

  const card = "rounded-2xl border border-[#21262D] bg-[#161B22] p-4";
  const label = "text-xs font-bold uppercase tracking-widest text-[#8B949E]";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-extrabold text-[#E6EDF3]">Aura AI</h2>
          <p className="text-xs text-[#8B949E]">{data.privacy}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#21262D] px-4 py-2 text-xs font-bold text-[#E6EDF3] transition hover:bg-[#0B0E14]"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Refresh
        </button>
      </div>

      <section className={card}>
        <h3 className={label}>Provider</h3>
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-[#E6EDF3]">
          <span className="font-mono">{data.provider.id}</span>
          <span className="font-mono text-xs text-[#8B949E]">{data.provider.model}</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${data.provider.configured ? "bg-[#00E676]/15 text-[#00E676]" : "bg-[#F59E0B]/15 text-[#F59E0B]"}`}>
            {data.provider.configured ? "configured" : "not configured"}
          </span>
        </p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {Object.entries(data.provider.capabilities).map(([capability, enabled]) => (
            <li
              key={capability}
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${enabled ? "bg-[#00E676]/12 text-[#00E676]" : "bg-[#21262D] text-[#8B949E]"}`}
            >
              {capability} {enabled ? "yes" : "no"}
            </li>
          ))}
        </ul>
      </section>

      <section className={card}>
        <h3 className={label}>Usage, last 7 days</h3>
        <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Turns", value: data.usage7d.turns },
            { label: "Succeeded", value: data.usage7d.succeeded },
            { label: "Failed", value: data.usage7d.failed },
            { label: "Tool calls", value: data.usage7d.toolCalls },
            { label: "Prompt tokens", value: data.usage7d.promptTokens.toLocaleString("en-NG") },
            { label: "Completion tokens", value: data.usage7d.completionTokens.toLocaleString("en-NG") },
            { label: "Avg latency", value: `${data.usage7d.averageLatencyMs} ms` },
            { label: "Conversations", value: data.conversations }
          ].map((stat) => (
            <div key={stat.label}>
              <dt className="text-[11px] text-[#8B949E]">{stat.label}</dt>
              <dd className="font-display text-base font-extrabold text-[#E6EDF3]">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={card}>
        <h3 className={label}>Tool registry</h3>
        <ul className="mt-2 divide-y divide-[#21262D]">
          {data.tools.map((tool) => (
            <li key={tool.name} className="py-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-[#E6EDF3]">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#00E676]" aria-hidden="true" />
                <span className="font-mono text-xs">{tool.name}</span>
              </p>
              <p className="mt-0.5 text-[11px] text-[#8B949E]">{tool.description}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={card}>
        <h3 className={label}>Recent turns</h3>
        {data.recent.length === 0 ? (
          <p className="mt-2 text-sm text-[#8B949E]">No turns recorded in the last seven days.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {data.recent.slice(0, 10).map((row, index) => (
              <li key={index} className="flex flex-wrap items-center gap-2 text-xs text-[#E6EDF3]">
                <span className={row.status === "ok" ? "text-[#00E676]" : "text-[#F85149]"}>
                  {row.status === "ok" ? "ok" : (row.errorCode ?? "error")}
                </span>
                <span className="font-mono text-[#8B949E]">{row.model}</span>
                <span className="text-[#8B949E]">{row.latencyMs} ms</span>
                <span className="text-[#8B949E]">{row.toolCalls} tool call(s)</span>
                <span className="ml-auto text-[#8B949E]">{new Date(row.createdAt).toLocaleString("en-NG")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-[#F85149]" role="alert">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" /> {error}
        </p>
      )}
    </div>
  );
}
