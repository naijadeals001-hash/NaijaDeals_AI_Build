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
      {/* ---------------- mobile header ---------------- */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-aura-border bg-aura-canvas/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <button type="button" onClick={() => setSidebarOpen(true)} aria-label="Open menu" className="rounded-lg p-2 text-aura-text">
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <Link href="/" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-aura-mint focus:px-3 focus:py-1 focus:text-aura-canvas">
          NaijaDeals home
        </Link>
        <span className="flex items-center gap-2">
          <AuraOrb size={26} />
          <span className="leading-tight">
            <span className="block text-sm font-extrabold">Aura AI</span>
            <span className="block text-[10px] text-aura-muted">by NaijaDeals</span>
          </span>
        </span>
        <Link href={user ? "/account" : "/login?next=/aura-ai"} aria-label={user ? "Your account" : "Sign in"} className="rounded-full border border-aura-border p-1">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-aura-highlight text-xs font-bold text-aura-mint">
            {user ? user.name.slice(0, 1).toUpperCase() : "?"}
          </span>
        </Link>
      </header>

      <div className="mx-auto flex w-full max-w-[1700px]">
        {/* ---------------- sidebar ---------------- */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-[272px] shrink-0 overflow-y-auto border-r border-aura-border bg-aura-sidebar px-3 py-4 transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between">
            <Link href="/aura-ai" className="flex items-center gap-2.5">
              <AuraOrb size={34} />
              <span className="leading-tight">
                <span className="block font-display text-lg font-extrabold">Aura AI</span>
                <span className="block text-[10px] text-aura-muted">by NaijaDeals</span>
              </span>
            </Link>
            <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Close menu" className="rounded-lg p-1.5 text-aura-muted lg:hidden">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              aura.newConversation();
              setSidebarOpen(false);
            }}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-aura-mint py-2.5 text-sm font-bold text-aura-canvas transition hover:brightness-105"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> New chat
          </button>

          <nav aria-label="Aura sections" className="mt-3 space-y-0.5">
            {[
              { label: "Discover", href: "/aura-ai", icon: Sparkles },
              { label: "Conversations", href: "/aura-ai/conversations", icon: ListChecks },
              { label: "My tasks", href: "/aura-ai/plans", icon: ListChecks },
              { label: "Saved", href: "/aura-ai/saved", icon: Bookmark }
            ].map((item, index) => (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  index === 0 ? "bg-aura-highlight/70 text-aura-mint" : "text-aura-text/80 hover:bg-aura-surface"
                }`}
              >
                <item.icon className="h-4 w-4" aria-hidden="true" /> {item.label}
              </Link>
            ))}
          </nav>

          <p className="mt-3 border-t border-aura-border pt-3 text-[11px] font-semibold uppercase tracking-widest text-aura-muted">History</p>
          <ul className="mt-1 space-y-0.5">
            {aura.conversations.length === 0 && <li className="px-3 py-2 text-xs text-aura-muted">No conversations yet.</li>}
            {aura.conversations.slice(0, 12).map((conversation) => (
              <li key={conversation.id}>
                <button
                  type="button"
                  onClick={() => {
                    void aura.openConversation(conversation.id);
                    setSidebarOpen(false);
                  }}
                  className={`w-full truncate rounded-lg px-3 py-2 text-left text-[13px] transition hover:bg-aura-surface ${
                    aura.conversationId === conversation.id ? "text-aura-mint" : "text-aura-text/75"
                  }`}
                >
                  {conversation.title}
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-4 border-t border-aura-border pt-3">
            <Link href={user ? "/account" : "/login?next=/aura-ai"} className="flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-aura-surface">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-aura-highlight text-sm font-bold text-aura-mint">
                {user ? user.name.slice(0, 1).toUpperCase() : "?"}
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-sm font-semibold">{user?.name ?? "Sign in"}</span>
                <span className="block truncate text-[11px] text-aura-muted">{user?.email ?? "to keep your chats"}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-aura-muted" aria-hidden="true" />
            </Link>
            <Link href="/aura-ai/settings" className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-aura-text/80 hover:bg-aura-surface">
              <Settings className="h-4 w-4" aria-hidden="true" /> Settings
            </Link>
          </div>
        </aside>

        {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}

        {/* ---------------- centre column ---------------- */}
        <main className="flex min-w-0 flex-1 flex-col lg:min-h-dvh">
          <div className="hidden items-center justify-between border-b border-aura-border px-6 py-3 lg:flex">
            <p className="text-sm text-aura-text/85">Your everyday intelligence</p>
            <div className="flex items-center gap-4">
              <Link href="/" className="text-xs font-semibold text-aura-muted transition hover:text-aura-mint">
                ← NaijaDeals
              </Link>
              <p className="text-xs text-aura-muted">{providerReady ? "Connected" : "Not connected"}</p>
            </div>
          </div>

          <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-40 pt-4 sm:px-6 lg:pb-32">
            {!hasConversation ? (
              <DiscoverHero onPrompt={(text) => void aura.send(text)} capabilities={capabilities} />
            ) : (
              <AuraMessages
                messages={aura.messages}
                status={aura.status}
                onRetry={aura.retry}
                onSave={aura.toggleSaved}
                onConfirmAction={confirmAction}
                actionState={actionState}
              />
            )}

            {aura.error && (
              <p className="mt-4 rounded-xl border border-aura-danger/30 bg-aura-danger/10 px-4 py-3 text-sm text-aura-danger" role="alert">
                {aura.error}
              </p>
            )}

            {!hasConversation && (
              <div className="mt-4 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => void aura.send(s.prompt)}
                    className="rounded-full border border-aura-border px-3.5 py-2 text-xs font-semibold text-aura-text/85 transition hover:border-aura-mint/40 hover:text-aura-mint"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Composer stays reachable above the mobile bottom bar. */}
          <div className="fixed inset-x-0 bottom-[68px] z-20 border-t border-aura-border bg-aura-canvas/95 px-4 py-3 backdrop-blur lg:sticky lg:bottom-0 lg:border-0 lg:bg-transparent lg:px-6 lg:pb-4">
            <div className="mx-auto w-full max-w-3xl">
              {!providerReady && (
                <p className="mb-2 rounded-xl border border-aura-gold/30 bg-aura-gold/10 px-3 py-2 text-[11px] text-aura-gold">
                  Aura is not connected to a model in this environment. You can still browse your services below.
                </p>
              )}
              <AuraComposer onSend={(text) => void aura.send(text)} onStop={aura.stop} streaming={aura.streaming} />
            </div>
          </div>
        </main>

        {/* ---------------- right panel ---------------- */}
        <aside className="hidden w-[300px] shrink-0 border-l border-aura-border bg-aura-sidebar px-4 py-4 xl:block">
          <h2 className="font-display text-lg font-extrabold">Your connected world</h2>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {capabilities.slice(0, 8).map((capability) => {
              const Icon = SERVICE_ICONS[capability.id] ?? Store;
              return (
                <Link
                  key={capability.id}
                  href={capability.href}
                  title={capability.state === "empty" ? `${capability.label}: no listings yet` : capability.summary}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-aura-border bg-aura-surface px-1 py-2.5 text-center transition hover:border-aura-mint/40"
                >
                  <Icon className="h-4 w-4 text-aura-mint" aria-hidden="true" />
                  <span className="text-[10px] font-semibold text-aura-text/80">{capability.label.replace("Naija", "")}</span>
                </Link>
              );
            })}
          </div>

          <div className="mt-4 rounded-2xl border border-aura-border bg-aura-surface p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Today&apos;s plan</h3>
              <span className="rounded-full border border-aura-gold/40 px-2 py-0.5 text-[10px] font-bold text-aura-gold">Draft</span>
            </div>
            <ol className="mt-3 space-y-3">
              {[
                { label: "Choose a stay", done: false },
                { label: "Pick a meal", done: false },
                { label: "Arrange a ride", done: false }
              ].map((step, index, all) => (
                <li key={step.label} className="relative flex items-center gap-2.5">
                  {index < all.length - 1 && <span className="absolute left-[7px] top-4 h-4 w-px bg-aura-border" aria-hidden="true" />}
                  <span className={`h-3.5 w-3.5 shrink-0 rounded-full border ${step.done ? "border-aura-mint bg-aura-mint" : "border-aura-muted/60"}`} aria-hidden="true" />
                  <span className="text-[13px] text-aura-text/85">{step.label}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-[11px] text-aura-muted">Ask Aura to plan a day and this fills in with real options.</p>
          </div>

          <div className="mt-4 rounded-2xl border border-aura-mint/20 bg-aura-highlight/50 p-4">
            <h3 className="text-sm font-bold">Make it yours</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-aura-muted">
              Personalisation is off unless you turn it on. Aura only remembers what you choose to save.
            </p>
            <Link href="/aura-ai/settings" className="mt-2.5 inline-flex items-center gap-1 text-xs font-bold text-aura-mint underline">
              Manage privacy <ChevronRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-6 flex items-center gap-3 rounded-xl border border-aura-border/60 px-3 py-3">
            <span className="text-xs leading-snug text-aura-muted">
              <span className="block font-semibold text-aura-gold">Made for life</span>
              across Africa
            </span>
          </div>
        </aside>
      </div>

      {/* ---------------- mobile bottom nav ---------------- */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-aura-border bg-aura-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Aura">
        <ul className="grid grid-cols-4">
          {[
            { label: "Chat", href: "/aura-ai", icon: Sparkles },
            { label: "Explore", href: "/products", icon: Store },
            { label: "Tasks", href: "/aura-ai/plans", icon: ListChecks },
            { label: "Saved", href: "/aura-ai/saved", icon: Bookmark }
          ].map((item, index) => (
            <li key={item.label}>
              <Link href={item.href} className={`flex flex-col items-center gap-1 py-2.5 text-[11px] ${index === 0 ? "text-aura-mint" : "text-aura-muted"}`}>
                <item.icon className="h-5 w-5" aria-hidden="true" />
                {item.label}
                {index === 0 && <span className="h-0.5 w-6 rounded-full bg-aura-mint" aria-hidden="true" />}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** Welcome / discovery state. The big hero lives only here. */
function DiscoverHero({ onPrompt, capabilities }: { onPrompt: (text: string) => void; capabilities: Capability[] }) {
  const tiles = capabilities.filter((c) => ["naijashop", "naijaeats", "naijadrive", "naijagigs", "naijastay", "naijapay", "naijastream", "naijasend"].includes(c.id)).slice(0, 8);
  return (
    <div>
      <section className="relative overflow-hidden rounded-3xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/generated/aura/aura-orbit-backdrop.webp" alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" aria-hidden="true" />
        <div className="absolute inset-0 bg-gradient-to-t from-aura-canvas via-aura-canvas/70 to-transparent" aria-hidden="true" />
        <div className="relative px-1 py-6 sm:px-2 sm:py-8">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-aura-gold/40 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-aura-gold">
            Built around your world
          </span>
          <div className="mt-3 flex items-start justify-between gap-4">
            <h1 className="max-w-md font-display text-[34px] font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
              Less searching.
              <br />
              More living.
            </h1>
            <AuraOrb size={92} className="hidden shrink-0 sm:block" />
          </div>
          <p className="mt-3 max-w-lg text-sm text-aura-text/75 sm:text-base">One conversation connects your NaijaDeals world.</p>
        </div>
      </section>

      {/* Service shortcuts */}
      <div className="mt-3 grid grid-cols-4 gap-2">
        {tiles.map((capability) => {
          const Icon = SERVICE_ICONS[capability.id] ?? Store;
          return (
            <button
              key={capability.id}
              type="button"
              onClick={() => onPrompt(`Show me what's available on ${capability.label}.`)}
              className="flex flex-col items-center gap-1.5 rounded-2xl border border-aura-border bg-aura-surface px-1 py-3 text-center transition hover:border-aura-mint/40"
            >
              <Icon className="h-5 w-5 text-aura-mint" aria-hidden="true" />
              <span className="text-[11px] font-semibold text-aura-text/85">{capability.label.replace("Naija", "")}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
