"use client";

import { CheckCircle, HeartPulse, AlertTriangle, XCircle, Database } from "lucide-react";

interface PaymentProvider {
  id: string;
  label: string;
  configured: boolean;
  reason?: string;
}

export function EcosystemHealth({
  paymentMethods,
  loadErrors
}: {
  paymentMethods: PaymentProvider[];
  loadErrors: string[];
}) {
  const configured = paymentMethods.filter((method) => method.configured).length;

  return (
    <section className="space-y-4" aria-label="Integration health">
      <div className="rounded-2xl border border-[#21262D] bg-[#161B22] p-5 shadow-soft">
        <div className="mb-4 flex items-center gap-2">
          <HeartPulse className="h-5 w-5 text-[#00E676]" aria-hidden="true" />
          <h2 className="font-display text-base font-extrabold text-[#F0F6FC]">Integration Health</h2>
        </div>

        <div className="mb-4 rounded-xl bg-[#21262D] p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[#8B949E]">Admin endpoints</span>
            <span className={loadErrors.length === 0 ? "font-bold text-[#00E676]" : "font-bold text-crimson"}>
              {loadErrors.length === 0 ? "All responded" : `${loadErrors.length} failed`}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-[#8B949E]">Database</span>
            <span className="flex items-center gap-1.5 font-bold text-[#00E676]">
              <Database className="h-3.5 w-3.5" aria-hidden="true" /> Connected
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-[#8B949E]">Payment providers configured</span>
            <span className="font-bold text-[#F0F6FC]">
              {configured}/{paymentMethods.length}
            </span>
          </div>
        </div>

        <ul className="space-y-2">
          {paymentMethods.length === 0 ? (
            <li className="rounded-lg p-2.5 text-sm text-[#8B949E]">No payment providers reported by the API.</li>
          ) : (
            paymentMethods.map((method) => (
              <li key={method.id} className="flex items-start justify-between gap-3 rounded-lg p-2.5 hover:bg-[#21262D]">
                <div className="flex min-w-0 items-start gap-2">
                  <span className={`mt-0.5 ${method.configured ? "text-[#00E676]" : "text-[#F59E0B]"}`}>
                    {method.configured ? (
                      <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#F0F6FC]">{method.label}</p>
                    {!method.configured && method.reason && (
                      <p className="mt-0.5 text-[11px] text-[#8B949E]">{method.reason}</p>
                    )}
                  </div>
                </div>
                <span className={`shrink-0 text-xs font-medium ${method.configured ? "text-[#00E676]" : "text-[#F59E0B]"}`}>
                  {method.configured ? "Ready" : "Setup"}
                </span>
              </li>
            ))
          )}
        </ul>

        <p className="mt-3 flex items-start gap-2 border-t border-[#21262D] pt-3 text-xs text-[#8B949E]">
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8B949E]" aria-hidden="true" />
          Uptime, latency and queue metrics are not collected in this build, so none are displayed.
        </p>
      </div>
    </section>
  );
}
