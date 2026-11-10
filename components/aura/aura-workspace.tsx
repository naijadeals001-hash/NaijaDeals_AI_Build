"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  Bookmark,
  Briefcase,
  Car,
  ChevronRight,
  BedDouble,
  ListChecks,
  Menu,
  Plus,
  Send as SendIcon,
  Settings,
  ShoppingBag,
  Sparkles,
  Store,
  UtensilsCrossed,
  Wallet,
  Play,
  X
} from "lucide-react";
import { useAura, type PendingAction } from "@/lib/aura/client";
import { AuraComposer } from "./aura-composer";
import { AuraMessages } from "./aura-messages";
import { AuraOrb } from "./aura-visuals";
import { AuraMobile } from "./aura-mobile";
import { AuraDesktop } from "./aura-desktop";

type Capability = { id: string; label: string; href: string; state: "available" | "empty" | "not_implemented"; summary: string; count: number | null };

const SERVICE_ICONS: Record<string, typeof Store> = {
  naijashop: ShoppingBag,
  naijaeats: UtensilsCrossed,
  naijadrive: Car,
  naijasend: SendIcon,
  naijagigs: Briefcase,
  naijastay: BedDouble,
  naijapay: Wallet,
  naijastream: Play,
  naijafresh: Store
};

const SUGGESTIONS = [
  { label: "Find something", prompt: "Help me find something I need on NaijaDeals." },
  { label: "Plan my day", prompt: "Plan a relaxed Saturday in Abuja for two." },
  { label: "Compare options", prompt: "Compare options for something I want to buy." },
  { label: "Create with Aura", prompt: "Help me write a short message inviting friends over this weekend." }
];

/**
 * Aura AI workspace.
 *
 * Desktop: sidebar, centre column, right context panel — matching the approved
 * mockup. Mobile: compact header, service tiles, conversation, composer above a
 * bottom navigation bar. The large discovery hero appears only on the welcome
 * state, so a long conversation keeps the screen.
 */
export function AuraWorkspace({
  user,
  capabilities,
  providerReady
}: {
  user: { name: string; email: string } | null;
  capabilities: Capability[];
  providerReady: boolean;
}) {
  const aura = useAura();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [actionState, setActionState] = useState<{ id: string; state: "idle" | "confirming" | "done" | "failed" } | null>(null);

  const hasConversation = aura.messages.length > 0;

  const confirmAction = useCallback(async (action: PendingAction) => {
    const actionId = action.id;
    setActionState({ id: actionId, state: "confirming" });
    // The hash comes from the pending action the server issued for this exact
    // review card. Sending it back proves the user approved these details; the
    // server refuses if the proposal changed or expired in between.
    const res = await fetch("/api/aura/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ actionId, inputHash: action.inputHash })
    }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    if (res?.ok && (body?.status === "completed" || body?.status === "already_completed")) {
      setActionState({ id: actionId, state: "done" });
      return;
    }
    setActionState({ id: actionId, state: "failed" });
    aura.setError(body?.error ?? "That could not be confirmed.");
  }, [aura]);

  return (
    <div className="min-h-dvh bg-aura-canvas text-aura-text">
      {/* ---------------- mobile: dedicated screen from the mockup ---------------- */}
      <div className="lg:hidden">
        <AuraMobile
          user={user}
          onOpenMenu={() => setSidebarOpen(true)}
          actionState={actionState}
          onConfirmAction={confirmAction}
          aura={aura}
        />
      </div>

      {/* ---------------- mobile drawer ---------------- */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
          <div className="relative h-full w-[280px] overflow-y-auto bg-aura-sidebar px-4 py-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <AuraOrb size={26} />
                <span className="text-sm font-extrabold">Aura AI</span>
              </span>
              <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Close menu" className="rounded-lg p-2 text-white/80">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                aura.newConversation();
                setSidebarOpen(false);
              }}
              className="mt-4 w-full rounded-lg bg-aura-mint py-2.5 text-sm font-bold text-aura-canvas"
            >
              New chat
            </button>
            <nav className="mt-3 space-y-1" aria-label="Aura sections">
              {[
                { label: "Discover", href: "/aura-ai" },
                { label: "Conversations", href: "/aura-ai/conversations" },
                { label: "My tasks", href: "/aura-ai/plans" },
                { label: "Saved", href: "/aura-ai/saved" },
                { label: "Privacy settings", href: "/aura-ai/settings" },
                { label: "NaijaDeals home", href: "/" }
              ].map((item) => (
                <Link key={item.label} href={item.href} onClick={() => setSidebarOpen(false)} className="block rounded-lg px-3 py-2.5 text-[14px] text-white/85 hover:bg-white/[0.05]">
                  {item.label}
                </Link>
              ))}
            </nav>
            <p className="mt-4 border-t border-white/10 pt-3 text-[11px] font-semibold uppercase tracking-widest text-white/50">History</p>
            <ul className="mt-1">
              {aura.conversations.slice(0, 10).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      void aura.openConversation(c.id);
                      setSidebarOpen(false);
                    }}
                    className="w-full truncate rounded-md px-3 py-2 text-left text-[13px] text-white/75 hover:bg-white/[0.05]"
                  >
                    {c.title}
                  </button>
                </li>
              ))}
              {aura.conversations.length === 0 && <li className="px-3 py-1 text-[12px] text-white/45">No conversations yet</li>}
            </ul>
          </div>
        </div>
      )}

      {/* ---------------- desktop (>=1024px): mockup three-column layout ---------------- */}
      <div className="hidden lg:block">
        <AuraDesktop user={user} aura={aura} actionState={actionState} onConfirmAction={confirmAction} />
      </div>
    </div>
  );
}
