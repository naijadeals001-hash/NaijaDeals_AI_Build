"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BedDouble,
  Bookmark,
  Calendar,
  Car,
  Check,
  ChevronDown,
  ChevronRight,
  Compass,
  ListChecks,
  Plus,
  ScanSearch,
  Send,
  Settings,
  ShoppingBag,
  Sparkles,
  Briefcase,
  Play,
  Store,
  UtensilsCrossed,
  Wallet,
  FlaskConical,
  ImageIcon
} from "lucide-react";
import { useAura, type AuraCard } from "@/lib/aura/client";
import { AuraOrb } from "./aura-visuals";
import { AuraAfricaMark } from "./aura-africa-mark";
import { AuraEmptyCard, AuraHeroCard, AuraPlanCard } from "./aura-plan-pieces";
import { AuraComposer } from "./aura-composer";
import { AuraMessages } from "./aura-messages";

/**
 * Aura on desktop, reproduced from the approved mockup.
 *
 * Three columns: 225px sidebar, flexible centre, 354px right rail on a 1586px
 * frame. Centre runs hero -> composer -> chips -> conversation. Every figure,
 * name and card comes from the signed-in user and their real conversation; the
 * mockup's "Patrick" and its Abuja example are placeholders, not content.
 */

const SERVICES = [
  { id: "shop", label: "Shop", icon: ShoppingBag },
  { id: "eats", label: "Eats", icon: UtensilsCrossed },
  { id: "drive", label: "Drive", icon: Car },
  { id: "send", label: "Send", icon: Send },
  { id: "gigs", label: "Gigs", icon: Briefcase },
  { id: "stay", label: "Stay", icon: BedDouble },
  { id: "pay", label: "Pay", icon: Wallet },
  { id: "stream", label: "Stream", icon: Play }
];

const CHIPS = [
  { label: "Find something", icon: ScanSearch, prompt: "Help me find something I need on NaijaDeals." },
  { label: "Plan my day", icon: Calendar, prompt: "Plan a relaxed Saturday for two." },
  { label: "Compare options", icon: FlaskConical, prompt: "Compare options for something I want to buy." },
  { label: "Create with Aura", icon: Sparkles, prompt: "Help me write a short, friendly message inviting friends over this weekend." }
];

export function AuraDesktop({
  user,
  aura,
  actionState,
  onConfirmAction
}: {
  user: { name: string; email: string } | null;
  aura: ReturnType<typeof useAura>;
  actionState: { id: string; state: "idle" | "confirming" | "done" | "failed" } | null;
  onConfirmAction: (action: import("@/lib/aura/client").PendingAction) => void;
}) {
  const [accountMenu, setAccountMenu] = useState(false);
  // Read the real personalisation state: both default to off, and the panel
  // must show that rather than a decorative "on" toggle.
  const [prefs, setPrefs] = useState({ personalised: false, useSavedPreferences: false });
  useEffect(() => {
    fetch("/api/aura/preferences", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => b?.preferences && setPrefs({ personalised: Boolean(b.preferences.personalised), useSavedPreferences: Boolean(b.preferences.useSavedPreferences) }))
      .catch(() => {});
  }, []);

  const lastUser = [...aura.messages].reverse().find((m) => m.role === "user");
  // The mockup's row is exactly three cards. Take the first of each kind from the
  // latest turn only, so a long conversation cannot stack dozens of tiles.
  const lastCards: AuraCard[] = [...aura.messages].reverse().find((m) => m.cards?.length)?.cards ?? [];
  const stay = lastCards.find((c) => c.kind === "stay");
  const meal = lastCards.find((c) => c.kind === "meal");
  const ride = lastCards.find((c) => c.kind === "ride");
  const planId = aura.messages.map((m) => m.planId).filter(Boolean).pop() as string | undefined;
  const showResults = Boolean(lastUser);
  const assistantMessages = aura.messages.filter((m) => m.role === "assistant");

  return (
    <div className="flex min-h-dvh bg-aura-canvas aura-type text-white">
      {/* ================= sidebar (225px) ================= */}
      <aside className="flex w-[261px] shrink-0 flex-col border-r border-white/[0.06] bg-aura-sidebar px-4 py-4">
        <Link href="/aura-ai" className="flex items-center gap-2.5">
          <SparkMark size={30} />
          <span className="leading-tight">
            <span className="block font-display text-[19px] font-extrabold tracking-tight">Aura AI</span>
            <span className="block text-[11px] text-white/70">by NaijaDeals</span>
          </span>
        </Link>

        <button
          type="button"
          onClick={aura.newConversation}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-aura-mint py-2.5 text-[14px] font-bold text-aura-canvas transition hover:brightness-105"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> New chat
        </button>

        <nav aria-label="Aura sections" className="mt-3 space-y-0.5">
          {[
            { label: "Discover", href: "/aura-ai", icon: Compass, active: true },
            { label: "Conversations", href: "/aura-ai/conversations", icon: ImageIcon },
            { label: "My tasks", href: "/aura-ai/plans", icon: ListChecks },
            { label: "Saved", href: "/aura-ai/saved", icon: Bookmark }
          ].map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-[13.5px] font-medium transition ${
                item.active ? "bg-white/[0.07] text-white" : "text-white/80 hover:bg-white/[0.04]"
              }`}
            >
              <item.icon className="h-4 w-4" aria-hidden="true" /> {item.label}
            </Link>
          ))}
        </nav>

        <p className="mt-4 border-t border-white/10 pt-3 text-[11.5px] font-medium text-white/55">History</p>
        <ul className="mt-1 space-y-0.5">
          {aura.conversations.length === 0 && <li className="px-2.5 py-1.5 text-[12.5px] text-white/45">No conversations yet</li>}
          {aura.conversations.slice(0, 8).map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => aura.openConversation(c.id)}
                className={`flex w-full items-center gap-2 truncate rounded-md px-2.5 py-1.5 text-left text-[12.5px] transition hover:bg-white/[0.05] ${
                  aura.conversationId === c.id ? "text-aura-mint" : "text-white/75"
                }`}
              >
                <span className="h-1 w-1 shrink-0 rounded-full bg-white/30" aria-hidden="true" />
                {c.title}
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-auto border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={() => setAccountMenu((v) => !v)}
            aria-expanded={accountMenu}
            className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left hover:bg-white/[0.04]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-aura-gold/60 bg-aura-highlight text-[13px] font-bold text-aura-mint">
              {user ? user.name.slice(0, 1).toUpperCase() : "?"}
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{user?.name ?? "Sign in"}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-white/60" aria-hidden="true" />
          </button>
          {accountMenu && (
            <div className="mt-1 space-y-0.5">
              <Link href={user ? "/account" : "/login?next=/aura-ai"} className="block rounded-md px-2.5 py-1.5 text-[12.5px] text-white/80 hover:bg-white/[0.05]">
                {user ? "Account" : "Sign in to save chats"}
              </Link>
              <Link href="/aura-ai/settings" className="block rounded-md px-2.5 py-1.5 text-[12.5px] text-white/80 hover:bg-white/[0.05]">
                Privacy settings
              </Link>
            </div>
          )}
          <Link href="/aura-ai/settings" className="mt-1 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] text-white/80 hover:bg-white/[0.04]">
            <Settings className="h-4 w-4" aria-hidden="true" /> Settings
          </Link>
        </div>
      </aside>

      {/* ================= centre column ================= */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-3">
          <p className="text-[15px] font-medium text-white/90">Your everyday intelligence</p>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-[13px] text-white/60 hover:text-aura-mint">
              ← NaijaDeals
            </Link>
            <span className="flex items-center gap-1.5 text-[13px] text-white/85">
              English <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <span className="h-5 w-px bg-white/20" aria-hidden="true" />
            <Link
              href={user ? "/account" : "/login?next=/aura-ai"}
              aria-label={user ? "Your account" : "Sign in"}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-aura-gold/60 bg-aura-highlight text-[12px] font-bold text-aura-mint"
            >
              {user ? user.name.slice(0, 1).toUpperCase() : "?"}
            </Link>
          </div>
        </div>

        <div className="w-full flex-1 px-[29px] pb-10 pt-[46px]">
          {/* ---------- hero ---------- */}
          {/* Hero: the orb sits in its own green halo that dissolves into the
              canvas, and the headline runs under its left edge — one continuous
              field with no card or visible boundary, exactly as the mockup. */}
          <section className="relative min-h-[196px]">
            <div
              className="pointer-events-none absolute -right-[72px] -top-[34px] h-[330px] w-[330px]"
              style={{ background: "radial-gradient(circle at 55% 45%, rgba(16,92,64,0.55) 0%, rgba(8,40,28,0.35) 42%, rgba(6,21,18,0) 72%)" }}
              aria-hidden="true"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/generated/aura/aura-orb-exact.webp"
              alt=""
              width={248}
              height={248}
              className="pointer-events-none absolute -right-[30px] top-[2px] h-[248px] w-[248px] object-contain"
              style={{
                maskImage: "radial-gradient(circle at 50% 50%, #000 46%, rgba(0,0,0,0.55) 64%, transparent 78%)",
                WebkitMaskImage: "radial-gradient(circle at 50% 50%, #000 46%, rgba(0,0,0,0.55) 64%, transparent 78%)"
              }}
              aria-hidden="true"
            />
            <span className="relative inline-flex rounded-full border border-aura-gold px-3.5 py-[5px] text-[11px] font-bold uppercase tracking-[0.14em] text-aura-gold">
              Built around your world
            </span>
            <h1 className="relative mt-2.5 max-w-[640px] font-display text-[62px] font-extrabold leading-[1.06] tracking-[-0.028em]">
              Less searching.
              <br />
              More living.
            </h1>
            <p className="relative mt-[34px] max-w-[560px] text-[17.5px] text-white/80">One conversation connects your NaijaDeals world.</p>
          </section>

          {/* ---------- composer ---------- */}
          <div className="mt-[8px]">
            <AuraComposer
              onSend={(t) => void aura.send(t)}
              onStop={aura.stop}
              streaming={aura.streaming}
              placeholder="Ask Aura anything, or tell me what you need…"
              variant="desktop"
            />
          </div>

          {/* ---------- chips ---------- */}
          <div className="mt-[21px] flex flex-wrap gap-2.5">
            {CHIPS.map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => void aura.send(chip.prompt)}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-[13px] font-medium text-white/90 transition hover:border-aura-mint/50 hover:text-white"
              >
                <chip.icon className="h-4 w-4" aria-hidden="true" /> {chip.label}
              </button>
            ))}
          </div>

          {/* ---------- conversation ---------- */}
          {lastUser && (
            <div className="mt-5 flex items-start gap-2.5">
              <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-aura-gold/60 bg-aura-highlight text-[11px] font-bold text-aura-mint">
                {user ? user.name.slice(0, 1).toUpperCase() : "?"}
              </span>
              <p className="rounded-lg bg-white/[0.07] px-4 py-2.5 text-[15px] text-white">{lastUser.content}</p>
            </div>
          )}

          {/* ---------- welcome discovery row ----------
              These three cards are fixed presentation pieces from the approved
              mockup. They are shown only before a conversation starts, they are
              labelled as starting points, and each links to the service itself —
              they never claim a property, restaurant or ride was found, priced or
              verified. Real AI results render separately, below. */}
          {!lastUser && (
            <section className="mt-[4px]">
              <div className="flex items-center gap-2.5">
                <SparkMark size={26} />
                <h2 className="text-[19px] font-extrabold">Let&apos;s make a day of it.</h2>
              </div>
              <p className="mt-0.5 text-[14px] text-white/80">
                A quiet stay, great Nigerian food and a ride when you need it — start exploring each service.
              </p>

              <div className="mt-4 grid grid-cols-3 gap-3">
                {([
                  { vertical: "stay" as const, title: "A peaceful Abuja stay", image: "/generated/aura/aura-card-stay.webp", href: "/naijastay?city=Abuja" },
                  { vertical: "meal" as const, title: "Local flavours, delivered", image: "/generated/aura/aura-card-meal.webp", href: "/naijaeats" },
                  { vertical: "ride" as const, title: "A ride on your schedule", image: "/generated/aura/aura-card-ride.webp", href: "/naijadrive" }
                ] as const).map((entry) => (
                  <AuraHeroCard key={entry.vertical} vertical={entry.vertical} title={entry.title} image={entry.image} href={entry.href} />
                ))}
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void aura.send("Plan a relaxed Saturday in Abuja for two.")}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2.5 text-[13px] font-medium text-white/90 hover:border-aura-mint/50"
                >
                  <Sparkles className="h-4 w-4" aria-hidden="true" /> Refine my plan
                </button>
                <Link
                  href="/naijastay?city=Abuja"
                  className="inline-flex items-center gap-2 rounded-lg bg-aura-mint px-5 py-2.5 text-[13px] font-bold text-aura-canvas hover:brightness-105"
                >
                  <Check className="h-4 w-4" aria-hidden="true" /> Review options
                </Link>
                <p className="text-[12.5px] text-white/65">Nothing is booked until you confirm.</p>
              </div>
            </section>
          )}

          {/* ---------- real AI answer ----------
              Everything here comes from the model and its tools against real
              records. Cards appear only when a tool returned them. */}
          {lastUser && (
            <section className="mt-5 space-y-4">
              {assistantMessages.length > 0 && (
                <AuraMessages
                  messages={assistantMessages.slice(-1)}
                  status={aura.status}
                  onRetry={aura.retry}
                  onSave={aura.toggleSaved}
                  onConfirmAction={onConfirmAction}
                  actionState={actionState}
                  variant="desktop"
                />
              )}

              {showResults && (
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { card: stay, vertical: "stay" as const, label: "No Abuja stay matched this request", href: "/naijastay?city=Abuja" },
                    { card: meal, vertical: "meal" as const, label: "No restaurant matched this request", href: "/naijaeats" },
                    { card: ride, vertical: "ride" as const, label: "No ride quote yet", href: "/naijadrive" }
                  ] as const).map((entry) =>
                    entry.card ? (
                      <AuraHeroCard key={entry.vertical} vertical={entry.vertical} title={entry.card.title} image={entry.card.image ?? "/generated/aura/aura-card-stay.webp"} href={entry.card.href ?? entry.href} />
                    ) : (
                      <AuraEmptyCard key={entry.vertical} vertical={entry.vertical} label={entry.label} />
                    )
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void aura.send("Help me refine this plan — change one of the options.")}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2.5 text-[13px] font-medium text-white/90 hover:border-aura-mint/50"
                >
                  <Sparkles className="h-4 w-4" aria-hidden="true" /> Refine my plan
                </button>
                <Link
                  href={planId ? `/aura-ai/plans/${planId}` : "/aura-ai/plans"}
                  className="inline-flex items-center gap-2 rounded-lg bg-aura-mint px-5 py-2.5 text-[13px] font-bold text-aura-canvas hover:brightness-105"
                >
                  <Check className="h-4 w-4" aria-hidden="true" /> Review options
                </Link>
                <p className="text-[12.5px] text-white/65">Nothing is booked until you confirm.</p>
              </div>
            </section>
          )}

          {aura.error && (
            <p className="mt-4 rounded-xl border border-aura-danger/30 bg-aura-danger/10 px-4 py-2.5 text-[13px] text-aura-danger" role="alert">
              {aura.error}
            </p>
          )}
        </div>

        <p className="border-t border-white/[0.06] px-6 py-2 text-center text-[11.5px] text-white/45">
          Check important details. Confirm every payment.
        </p>
      </div>

      {/* ================= right rail (354px) ================= */}
      <aside className="flex w-[353px] shrink-0 flex-col border-l border-white/[0.06] bg-aura-sidebar px-5 py-5">
        <h2 className="font-display text-[21px] font-extrabold leading-tight">Your connected world</h2>

        <div className="mt-3 grid grid-cols-4 gap-2">
          {SERVICES.map((service) => (
            <Link
              key={service.id}
              href={service.id === "pay" ? "/pay" : service.id === "send" ? "/naijasend" : `/${service.id === "gigs" ? "naijagigs" : service.id === "stay" ? "naijastay" : service.id === "stream" ? "naijastream" : `naija${service.id}`}`}
              className="flex flex-col items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] py-2.5 transition hover:border-aura-mint/40"
            >
              <service.icon className="h-[18px] w-[18px] text-white/90" aria-hidden="true" />
              <span className="text-[11.5px] text-white/85">{service.label}</span>
            </Link>
          ))}
        </div>

        <section className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[17px] font-extrabold leading-tight">Today&apos;s plan</h3>
            <span className="shrink-0 rounded-full border border-aura-gold px-2.5 py-[3px] text-[11px] font-bold text-aura-gold">Draft</span>
          </div>
          <ol className="mt-3 space-y-3">
            {[
              { label: "Choose a stay", done: Boolean(stay) },
              { label: "Pick a meal", done: Boolean(meal) },
              { label: "Arrange a ride", done: Boolean(ride) }
            ].map((step, index, all) => (
              <li key={step.label} className="relative flex items-center gap-2.5">
                {index < all.length - 1 && <span className="absolute left-[6px] top-4 h-3.5 w-px bg-white/20" aria-hidden="true" />}
                <span className={`h-3 w-3 shrink-0 rounded-full border ${step.done ? "border-aura-mint bg-aura-mint" : "border-white/40"}`} aria-hidden="true" />
                <span className="text-[13.5px] text-white/90">{step.label}</span>
              </li>
            ))}
          </ol>
          <Link href="/aura-ai/plans" className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-aura-mint">
            Review options <ChevronRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </section>

        <section className="mt-3 rounded-xl bg-aura-highlight p-4">
          <h3 className="text-[17px] font-extrabold">Make it yours</h3>
          <div className="mt-2.5 space-y-2.5">
            {[
              { label: "Personalised suggestions", on: prefs.personalised },
              { label: "Use saved preferences", on: prefs.useSavedPreferences }
            ].map((row) => (
              <Link key={row.label} href="/aura-ai/settings" className="flex items-center justify-between gap-2 text-[13.5px] text-white/90">
                {row.label}
                <span
                  className={`flex h-5 w-9 items-center rounded-full px-0.5 ${row.on ? "justify-end bg-aura-mint" : "justify-start bg-white/25"}`}
                  aria-hidden="true"
                  data-state={row.on ? "on" : "off"}
                >
                  <span className="h-4 w-4 rounded-full bg-aura-canvas" />
                </span>
              </Link>
            ))}
          </div>
          <Link href="/aura-ai/settings" className="mt-3 flex items-center justify-between border-t border-white/15 pt-2.5 text-[13.5px] font-semibold text-white underline decoration-white/40">
            Manage privacy <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>

        <div className="mt-auto pt-6">
          <AuraAfricaMark />
        </div>
      </aside>
    </div>
  );
}

/** The Aura sparkle mark: four-pointed star in mint with a gold lower point. */
function SparkMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id="aura-spark" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#8CFFDA" />
          <stop offset="62%" stopColor="#4FD9A6" />
          <stop offset="100%" stopColor="#D9BC63" />
        </linearGradient>
      </defs>
      <path d="M16 1.5c1.15 7.2 2.4 10.2 4.6 12.1 1.7 1.4 3.9 2.1 8.4 2.4v2.9c-4.5.3-6.7 1-8.4 2.4-2.2 1.9-3.45 4.9-4.6 12.1-1.15-7.2-2.4-10.2-4.6-12.1-1.7-1.4-3.9-2.1-8.4-2.4v-2.9c4.5-.3 6.7-1 8.4-2.4C13.6 11.7 14.85 8.7 16 1.5Z" fill="url(#aura-spark)" />
    </svg>
  );
}

export { Store };
