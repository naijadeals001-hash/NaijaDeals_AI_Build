"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUp, Bookmark, Car, Compass, ListChecks, Menu, MessageCircle, Paperclip, Mic, MoreHorizontal, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { useAura } from "@/lib/aura/client";
import { AuraHeroCard, AuraPlanCard, AuraRideStrip } from "./aura-plan-pieces";
import { AuraComposer } from "./aura-composer";
import { AuraLanguageSelect } from "./aura-language-select";
import { AuraMessages } from "./aura-messages";

/**
 * Aura on a phone, reproduced from the approved mobile mockup.
 *
 * Structure, top to bottom: compact header (menu, orb + wordmark, avatar), the
 * discovery block (gold badge, two-line headline with the orb beside it, one-line
 * subtitle), four service tiles, the conversation, and a persistent composer
 * above a four-item bottom bar. Once a conversation starts the hero shrinks so
 * messages and actions get the screen, as the directive requires.
 */

const TILES = [
  { key: "shop", label: "Shop", icon: ShoppingBag, href: "/naijashop", prompt: "Show me what's available on NaijaShop." },
  { key: "eats", label: "Eats", icon: UtensilsCrossed, href: "/naijaeats", prompt: "Show me food available on NaijaEats." },
  { key: "drive", label: "Drive", icon: Car, href: "/naijadrive", prompt: "Help me estimate a ride with NaijaDrive." },
  { key: "more", label: "More", icon: MoreHorizontal, href: "/products", prompt: "What else can you help me with across NaijaDeals?" }
];

export function AuraMobile({
  user,
  onOpenMenu,
  actionState,
  onConfirmAction,
  aura
}: {
  user: { name: string; email: string } | null;
  onOpenMenu: () => void;
  actionState: { id: string; state: "idle" | "confirming" | "done" | "failed" } | null;
  onConfirmAction: (action: import("@/lib/aura/client").PendingAction) => void;
  aura: ReturnType<typeof useAura>;
}) {
  const [draft, setDraft] = useState("");
  const [showPlan, setShowPlan] = useState(true);
  const [notice, setNotice] = useState("");
  // Aura opens on the welcome composition and stays there until the person asks
  // something. Auto-sending a prompt on load started a conversation the user never
  // requested and replaced the discovery screen with a wall of text.
  const active = aura.messages.length > 0;

  const lastUser = [...aura.messages].reverse().find((m) => m.role === "user");
  const stayCard = aura.messages.flatMap((m) => m.cards ?? []).find((c) => c.kind === "stay");
  const mealCard = aura.messages.flatMap((m) => m.cards ?? []).find((c) => c.kind === "meal");
  const planId = aura.messages.map((m) => m.planId).filter(Boolean).pop() as string | undefined;
  const hasCards = Boolean(stayCard || mealCard);

  function submit() {
    const text = draft.trim();
    if (!text || aura.streaming) return;
    setDraft("");
    void aura.send(text);
  }

  return (
    <div className="min-h-dvh bg-aura-canvas aura-type text-white">
      {/* ---------- header ---------- */}
      <header className="flex items-center justify-between px-4 pt-[18px]">
        <button type="button" onClick={onOpenMenu} aria-label="Open menu" className="rounded-lg p-1.5">
          <Menu className="h-[22px] w-[22px]" aria-hidden="true" />
        </button>
        <Link href="/aura-ai" className="flex items-center gap-2">
          <SparkleMark size={30} />
          <span className="leading-tight">
            <span className="block font-display text-[21px] font-extrabold tracking-tight">Aura AI</span>
            <span className="block text-[12px] text-white/75">by NaijaDeals</span>
          </span>
        </Link>
        <div className="flex items-center gap-1.5">
          <AuraLanguageSelect compact />
        </div>
        <Link
          href={user ? "/account" : "/login?next=/aura-ai"}
          aria-label={user ? `Your account, ${user.name}` : "Sign in"}
          className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-aura-gold/70 bg-aura-highlight text-[13px] font-bold text-aura-mint"
        >
          {user ? user.name.slice(0, 1).toUpperCase() : "?"}
        </Link>
      </header>

      <div className="overflow-x-clip px-4 pb-[206px]">
        {/* ---------- discovery ---------- */}
        {!active ? (
          <section data-aura="hero" className="relative mt-[8px]">
            <div
              className="pointer-events-none absolute -right-10 -top-8 h-[230px] w-[230px]"
              style={{ background: "radial-gradient(circle at 55% 45%, rgba(16,92,64,0.55) 0%, rgba(8,40,28,0.32) 42%, rgba(6,21,18,0) 74%)" }}
              aria-hidden="true"
            />
            {/* The orb sits beside the headline and overlaps it slightly, as in the mockup. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/generated/aura/aura-orb-exact.webp"
              alt=""
              width={190}
              height={190}
              className="pointer-events-none absolute -right-12 -top-8 h-[206px] w-[206px] object-contain"
              style={{
                maskImage: "radial-gradient(circle at 50% 50%, #000 46%, rgba(0,0,0,0.55) 64%, transparent 78%)",
                WebkitMaskImage: "radial-gradient(circle at 50% 50%, #000 46%, rgba(0,0,0,0.55) 64%, transparent 78%)"
              }}
              aria-hidden="true"
            />
            <span className="relative inline-flex rounded-full border border-aura-gold px-[10px] py-[4px] text-[10px] font-bold uppercase tracking-[0.08em] text-aura-gold">
              Built around your world
            </span>
            <h1 className="relative mt-[11px] font-extrabold text-[27px] leading-[1.06] tracking-[-0.03em]">
              Less searching.
              <br />
              More living.
            </h1>
            <p className="relative mt-[7px] text-[13px] leading-snug text-white/85">One conversation. Your NaijaDeals world.</p>
          </section>
        ) : (
          /* Conversation state: no large hero, just the identity line. */
          <div className="mt-3 flex items-center gap-2">
            <SparkleMark size={22} />
            <p className="text-[13px] text-white/70">Aura is helping you across NaijaDeals</p>
          </div>
        )}

        {/* ---------- four service tiles ---------- */}
        <div data-aura="tiles" className="mt-[8px] grid w-full grid-cols-4 gap-[5px]">
          {TILES.map((tile) => (
            <button
              key={tile.key}
              type="button"
              onClick={() => (tile.key === "more" ? (window.location.href = tile.href) : void aura.send(tile.prompt))}
              className="flex h-[46px] flex-col items-center justify-center gap-[3px] rounded-[8px] border border-aura-border bg-aura-surface/55 transition active:scale-[0.98]"
            >
              <tile.icon className="h-[15px] w-[15px] text-aura-gold" aria-hidden="true" />
              <span className="text-[10.5px] font-semibold text-white/90">{tile.label}</span>
            </button>
          ))}
        </div>

        {/* ---------- conversation ---------- */}
        {active && (
          <div className="mt-5">
            {lastUser && (
              <div className="flex items-start gap-2.5">
                <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-aura-gold/60 bg-aura-highlight text-[12px] font-bold text-aura-mint">
                  {user ? user.name.slice(0, 1).toUpperCase() : "?"}
                </span>
                <p className="flex-1 rounded-xl border border-aura-border bg-aura-surface/60 px-4 py-3 text-[15px] leading-snug text-white">{lastUser.content}</p>
              </div>
            )}

            <div className="mt-4">
              <AuraMessages
                messages={aura.messages.filter((m) => m.role === "assistant")}
                status={aura.status}
                onRetry={aura.retry}
                onSave={aura.toggleSaved}
                onConfirmAction={onConfirmAction}
                actionState={actionState}
              />
            </div>

            {hasCards && (
              <section className="mt-5">
                <div className="flex items-center gap-2">
                  <SparkleMark size={24} />
                  <h2 className="text-[19px] font-extrabold leading-tight">Let&apos;s make a day of it.</h2>
                </div>
                <p className="mt-1 text-[14px] leading-snug text-white/80">A quiet stay, great Nigerian food and a ride when you need it.</p>

                <div data-aura="cards" className="mt-[10px] grid grid-cols-2 gap-3">
                  {stayCard && (
                    <AuraHeroCard
                      vertical="stay"
                      title={stayCard.title}
                      image={stayCard.image ?? "/generated/aura/aura-abuja-stay.webp"}
                      href={stayCard.href}
                    />
                  )}
                  {mealCard && (
                    <AuraHeroCard
                      vertical="meal"
                      title={mealCard.title}
                      image={mealCard.image ?? "/generated/aura/aura-abuja-meal.webp"}
                      href={mealCard.href}
                    />
                  )}
                </div>

                <div className="mt-3">
                  <AuraRideStrip href="/naijadrive" />
                </div>
              </section>
            )}

            {hasCards && showPlan && (
              <div className="mt-4">
                <AuraPlanCard
                  title={titleFor(lastUser?.content ?? "")}
                  steps={[
                    { key: "stay", label: "Stay", done: Boolean(stayCard) },
                    { key: "meal", label: "Meal", done: Boolean(mealCard) },
                    { key: "ride", label: "Ride", done: false }
                  ]}
                  reviewHref={planId ? `/aura-ai/plans/${planId}` : undefined}
                  onReview={() => {
                    if (!planId) {
                      setShowPlan(true);
                      void aura.send("Save this as a draft plan.");
                    }
                  }}
                />
              </div>
            )}

            {aura.error && <p className="mt-3 rounded-xl bg-aura-danger/15 px-3 py-2 text-[13px] text-aura-danger">{aura.error}</p>}

            <button type="button" onClick={() => aura.newConversation()} className="mt-4 w-full rounded-xl border border-aura-border py-2.5 text-[13px] font-semibold text-white/75">
              Start a new chat
            </button>
          </div>
        )}

        {/* ---------- welcome: the mockup's own composition ----------
            A sample prompt as the first turn, the two result cards, the ride
            strip and the plan card. This is the discovery presentation: the
            cards are fixed starting points that link into each service, not
            claims that anything was found or priced. */}
        {!active && (
          <div data-aura="bubble" className="mt-[14px]">
            <div className="flex items-center gap-2">
              <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-aura-gold/60 bg-aura-highlight text-[12px] font-bold text-aura-mint">
                {user ? user.name.slice(0, 1).toUpperCase() : "?"}
              </span>
              <button
                type="button"
                onClick={() => void aura.send("Plan a relaxed Saturday in Abuja for two.")}
                className="flex min-h-[30px] flex-1 items-center rounded-[15px] border border-aura-mint/25 bg-aura-surface/70 px-3 text-left text-[13px] leading-snug text-white"
              >
                Plan a relaxed Saturday in Abuja for two.
              </button>
            </div>

            <div data-aura="heading" className="mt-[12px] flex items-center gap-2">
              <SparkleMark size={22} />
              <h2 className="text-[17px] font-extrabold leading-tight">Let&apos;s make a day of it.</h2>
            </div>
            <p className="mt-[2px] pl-[26px] text-[12.5px] leading-snug text-white/80">A quiet stay, great Nigerian food and a ride when you need it.</p>

            <div data-aura="cards" className="mt-[10px] grid grid-cols-2 gap-3">
              <AuraHeroCard vertical="stay" title="A peaceful Abuja stay" image="/generated/aura/aura-card-stay-mobile.webp" href="/naijastay?city=Abuja" />
              <AuraHeroCard vertical="meal" title="Local flavours, delivered" image="/generated/aura/aura-card-meal-mobile.webp" href="/naijaeats" />
            </div>

            <div className="mt-3">
              <AuraRideStrip href="/naijadrive" />
            </div>

            <div data-aura="plan" className="mt-3">
              <AuraPlanCard
                title="Your Saturday plan"
                steps={[
                  { key: "stay", label: "Stay" },
                  { key: "meal", label: "Meal" },
                  { key: "ride", label: "Ride" }
                ]}
                reviewHref="/naijastay?city=Abuja"
              />
            </div>
          </div>
        )}
      </div>

      {/* ---------- composer ---------- */}
      <div className="fixed inset-x-0 bottom-[74px] px-4 pb-2">
        <AuraComposer
          variant="mobile"
          onSend={(text) => void aura.send(text)}
          onStop={aura.stop}
          streaming={aura.streaming}
          placeholder="Ask Aura anything…"
        />
      </div>

      {/* ---------- bottom nav ---------- */}
      <nav className="fixed inset-x-0 bottom-0 border-t border-aura-border bg-aura-canvas pb-[env(safe-area-inset-bottom)]" aria-label="Aura">
        <ul className="grid grid-cols-4">
          {[
            { label: "Chat", href: "/aura-ai", icon: MessageCircle, active: true },
            { label: "Explore", href: "/products", icon: Compass },
            { label: "Tasks", href: "/aura-ai/plans", icon: ListChecks },
            { label: "Saved", href: "/aura-ai/saved", icon: Bookmark }
          ].map((item) => (
            <li key={item.label}>
              <Link href={item.href} className={`flex flex-col items-center gap-1 py-2.5 text-[12px] ${item.active ? "text-aura-mint" : "text-white/75"}`}>
                <item.icon className="h-5 w-5" aria-hidden="true" />
                {item.label}
                {item.active && <span className="h-[3px] w-10 rounded-full bg-aura-mint" aria-hidden="true" />}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** The emerald-and-gold Aura mark, drawn so it stays crisp at any size. */
function SparkleMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id="aura-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#78F8CC" />
          <stop offset="55%" stopColor="#2FD69B" />
          <stop offset="100%" stopColor="#D9BC63" />
        </linearGradient>
      </defs>
      <path
        d="M16 2.5c1.6 5.6 3.4 8.2 6.1 9.6 2 1 4.1 1.7 7.4 2.1v3.6c-3.3.4-5.4 1.1-7.4 2.1-2.7 1.4-4.5 4-6.1 9.6-1.6-5.6-3.4-8.2-6.1-9.6-2-1-4.1-1.7-7.4-2.1v-3.6c3.3-.4 5.4-1.1 7.4-2.1 2.7-1.4 4.5-4 6.1-9.6Z"
        fill="url(#aura-mark)"
      />
    </svg>
  );
}

/** "Your Saturday plan" when the conversation is about a day, otherwise a generic title. */
function titleFor(prompt: string) {
  const day = /\b(saturday|sunday|friday|monday|tuesday|wednesday|thursday|weekend)\b/i.exec(prompt)?.[1];
  return day ? `Your ${day.charAt(0).toUpperCase()}${day.slice(1).toLowerCase()} plan` : "Your plan";
}
