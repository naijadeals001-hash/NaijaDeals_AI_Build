"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

/**
 * Exchanges a one-time guest access token for an httpOnly cookie and then
 * navigates to the ticket. The token is removed from the address bar before the
 * conversation is shown, so it cannot leak through a referrer.
 */
export function GuestAccessExchange() {
  const params = useSearchParams();
  const router = useRouter();
  const [state, setState] = useState<"working" | "invalid" | "failed">("working");
  const token = params.get("token") ?? "";

  useEffect(() => {
    let cancelled = false;
    async function exchange() {
      if (!token) {
        setState("invalid");
        return;
      }
      try {
        const response = await fetch("/api/support/guest/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token })
        });
        const data = (await response.json().catch(() => ({}))) as { reference?: string };
        if (cancelled) return;
        if (!response.ok || !data.reference) {
          setState("invalid");
          return;
        }
        router.replace(`/support/ticket/${encodeURIComponent(data.reference)}`);
      } catch {
        if (!cancelled) setState("failed");
      }
    }
    exchange();
    return () => {
      cancelled = true;
    };
  }, [router, token]);

  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <div className="rounded-2xl bg-white p-6 ring-1 ring-[#e4ebe2]">
        {state === "working" ? (
          <p role="status" className="text-[13px] text-[#4b5b51]">Opening your private conversation…</p>
        ) : state === "invalid" ? (
          <>
            <h1 className="font-display text-xl font-extrabold">This link is not valid</h1>
            <p className="mt-2 text-[12.5px] leading-6 text-[#4b5b51]">
              The access link is wrong, expired or was revoked. Ask support for a new link from your ticket, or{" "}
              <Link href="/contact" className="font-bold text-[#0b5c33] underline">send a new enquiry</Link>.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-display text-xl font-extrabold">The connection failed</h1>
            <p className="mt-2 text-[12.5px] leading-6 text-[#4b5b51]">Check your connection and open the link again.</p>
          </>
        )}
      </div>
    </main>
  );
}
