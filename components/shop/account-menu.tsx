"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CircleHelp,
  Clock3,
  Heart,
  ListChecks,
  Loader2,
  LogOut,
  MapPin,
  Package,
  Store,
  UserRound,
  Wallet,
  X
} from "lucide-react";
import type { SessionUser } from "@/lib/api-client";
import { ShopPanelFrame } from "./all-drawer";

export const RECENTLY_VIEWED_KEY = "naijashop.recently-viewed.v1";
const MAX_RECENTLY_VIEWED = 8;
const SIGN_IN_HREF = "/login?next=/naijashop";
const REGISTER_HREF = "/register?next=/naijashop";

export type RecentlyViewedProduct = {
  href: string;
  name: string;
  viewedAt: string;
};

/** Read the local-only recently viewed list. No browsing data leaves the device. */
export function readRecentlyViewed(): RecentlyViewedProduct[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENTLY_VIEWED_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is RecentlyViewedProduct => {
        if (!entry || typeof entry !== "object") return false;
        const value = entry as Partial<RecentlyViewedProduct>;
        return (
          typeof value.href === "string" &&
          value.href.startsWith("/product/") &&
          typeof value.name === "string" &&
          value.name.trim().length > 0 &&
          typeof value.viewedAt === "string"
        );
      })
      .slice(0, MAX_RECENTLY_VIEWED);
  } catch {
    return [];
  }
}

/**
 * Record a product a shopper opened from the Marketplace. The account panel
 * reads this list in the browser only; it is never sent to the server.
 */
export function rememberRecentlyViewed(target: EventTarget | null) {
  if (typeof window === "undefined" || !(target instanceof Element)) return;
  const anchor = target.closest<HTMLAnchorElement>('a[href^="/product/"]');
  if (!anchor) return;
  const rawHref = anchor.getAttribute("href") ?? "";
  if (!rawHref.startsWith("/product/") || rawHref.includes("#reviews")) return;
  const href = rawHref.split("#")[0];
  if (!href || href === "/product/") return;

  const card = anchor.closest("[data-product]");
  const ariaLabel = (anchor.getAttribute("aria-label") ?? "")
    .replace(/^(View|See options for|Contact the seller about)\s+/i, "")
    .trim();
  const cardHeading = card?.querySelector("h3")?.textContent?.trim() ?? "";
  const slugName = decodeURIComponent(href.split("/").filter(Boolean).pop() ?? "").replace(/-/g, " ").trim();
  const name = (ariaLabel || cardHeading || slugName || "Product").slice(0, 140);

  try {
    const entry: RecentlyViewedProduct = { href, name, viewedAt: new Date().toISOString() };
    const next = [entry, ...readRecentlyViewed().filter((item) => item.href !== href)].slice(0, MAX_RECENTLY_VIEWED);
    window.localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable in private browsing; the account panel then
    // shows its real empty state.
  }
}

function workspaceFor(user: SessionUser): { href: string; label: string } | null {
  const roles = user.roles ?? [];
  if (roles.includes("admin") || roles.includes("super_admin") || user.actorType === "ADMIN") {
    return { href: "/admin", label: "Control Center" };
  }
  if (roles.includes("vendor") || user.actorType === "VENDOR" || (user.vendorIds?.length ?? 0) > 0) {
    return { href: "/seller", label: "Seller workspace" };
  }
  if (roles.includes("courier") || user.actorType === "COURIER") {
    return { href: "/courier", label: "Courier workspace" };
  }
  if (roles.includes("driver") || user.actorType === "DRIVER") {
    return { href: "/driver", label: "Driver workspace" };
  }
  return null;
}

function MenuRow({
  href,
  label,
  description,
  icon: Icon,
  onClick,
  trailing
}: {
  href: string;
  label: string;
  description?: string;
  icon: typeof Heart;
  onClick: () => void;
  trailing?: string;
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={onClick}
        aria-label={description ? `${label}, ${description}` : label}
        className="group flex min-h-12 items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-[#eef4ea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-inset"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#eef4ea] text-[#0b5c33]">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-extrabold leading-tight text-[#14241b] group-hover:text-[#0b5c33]">{label}</span>
          {description ? <span className="mt-0.5 block text-[10.5px] leading-4 text-[#566359]">{description}</span> : null}
        </span>
        {trailing ? <span className="shrink-0 text-[10px] font-bold text-[#566359]">{trailing}</span> : null}
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#7a9c80]" aria-hidden />
      </Link>
    </li>
  );
}

export function AccountMenu({
  open,
  onClose,
  returnFocusRef,
  user,
  onSignedOut
}: {
  open: boolean;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  user: SessionUser | null | undefined;
  onSignedOut?: () => void;
}) {
  const router = useRouter();
  const [view, setView] = useState<"main" | "recent">("main");
  const [recent, setRecent] = useState<RecentlyViewedProduct[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const recentTriggerRef = useRef<HTMLButtonElement>(null);
  const lastView = useRef<"main" | "recent">("main");

  const firstName = user?.name?.split(" ")[0] ?? null;
  const workspace = user ? workspaceFor(user) : null;

  const close = () => {
    setView("main");
    lastView.current = "main";
    setError("");
    onClose();
  };

  useEffect(() => {
    if (!open) {
      setView("main");
      lastView.current = "main";
      setError("");
      return;
    }
    setRecent(readRecentlyViewed());
  }, [open, view]);

  useEffect(() => {
    if (!open) return;
    if (view === lastView.current) return;
    lastView.current = view;
    if (view === "recent") {
      backButtonRef.current?.focus();
    } else {
      recentTriggerRef.current?.focus();
    }
  }, [open, view]);

  async function signOut() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" } });
      const body = (await response.json().catch(() => null)) as { signedOut?: boolean; error?: string } | null;
      if (!response.ok || !body?.signedOut) {
        throw new Error(body?.error || "Sign out could not be completed. Try again.");
      }
      // The storefront caches the session in client state; clear it before
      // closing so the header and account panel immediately show the guest
      // state instead of the previous shopper's name and cart count.
      onSignedOut?.();
      close();
      router.push("/naijashop");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign out could not be completed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function clearRecent() {
    try {
      window.localStorage.removeItem(RECENTLY_VIEWED_KEY);
    } catch {
      // Ignore storage failures; the list is refreshed from storage below.
    }
    setRecent([]);
  }

  return (
    <ShopPanelFrame
      open={open}
      onClose={close}
      side="right"
      panelId="shop-account-panel"
      labelledBy="shop-account-title"
      panelRef={panelRef}
      initialFocusRef={closeButtonRef}
      returnFocusRef={returnFocusRef}
    >
      <header className="shrink-0 bg-[#07351f] px-4 pb-3.5 pt-4 text-white">
        <div className="flex items-start gap-2.5">
          {view === "recent" ? (
            <button
              ref={backButtonRef}
              type="button"
              onClick={() => setView("main")}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[11px] font-extrabold text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f5b52e]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back
            </button>
          ) : (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-[#8ed14b]" aria-hidden>
              <UserRound className="h-5 w-5" />
            </span>
          )}

          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-[#8fb89a]">NaijaDeals Marketplace</p>
            <h2 id="shop-account-title" className="mt-0.5 truncate text-[17px] font-extrabold leading-tight">
              {view === "recent" ? "Recently viewed" : "Account & Lists"}
            </h2>
            <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-4 text-[#b9d5bd]">
              {view === "recent"
                ? "Products you opened from this storefront."
                : user
                  ? `Signed in as ${firstName ?? user.name}`
                  : user === null
                    ? "Sign in to see saved items and orders."
                    : "Checking your session…"}
            </p>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            aria-label="Close account and lists menu"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f5b52e]"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {view === "recent" ? (
          <div>
            {recent.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#cfdccb] bg-[#f7faf4] px-4 py-8 text-center">
                <Clock3 className="mx-auto h-7 w-7 text-[#7a9c80]" aria-hidden />
                <p className="mt-2 text-[13px] font-extrabold text-[#14241b]">Nothing viewed yet</p>
                <p className="mx-auto mt-1 max-w-[16rem] text-[11px] leading-5 text-[#566359]">
                  Products you open from the Marketplace home appear here on this device. They are not sent to your account.
                </p>
                <Link
                  href="/naijashop"
                  onClick={close}
                  className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[#07351f] px-4 text-[11.5px] font-extrabold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2"
                >
                  Browse the marketplace
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10.5px] leading-4 text-[#566359]">
                    {recent.length} {recent.length === 1 ? "product" : "products"} recorded on this device.
                  </p>
                  <button
                    type="button"
                    onClick={clearRecent}
                    className="shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-extrabold text-[#b8440a] transition hover:bg-[#fdf2e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]"
                  >
                    Clear history
                  </button>
                </div>
                <ul className="mt-2 divide-y divide-[#eef3ec]">
                  {recent.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={close}
                        className="group flex min-h-12 items-center gap-2 py-2.5 text-[12.5px] font-semibold text-[#14241b] transition hover:text-[#0b5c33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-inset"
                      >
                        <span className="min-w-0 flex-1 truncate">{item.name}</span>
                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[#7a9c80]" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : user === undefined ? (
          <div role="status" aria-live="polite" className="rounded-2xl border border-[#e1e8de] bg-[#f7faf4] px-4 py-8 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#0b5c33]" aria-hidden />
            <p className="mt-2 text-[12.5px] font-extrabold text-[#14241b]">Checking your session…</p>
            <p className="mt-1 text-[11px] text-[#566359]">Saved items and orders appear when the session check finishes.</p>
          </div>
        ) : user === null ? (
          <div>
            <div className="rounded-2xl border border-[#e1e8de] bg-[#f7faf4] px-4 py-5">
              <p className="text-[13px] font-extrabold text-[#14241b]">Sign in to shop faster</p>
              <p className="mt-1 text-[11px] leading-5 text-[#566359]">
                Keep your cart, addresses, saved items and order history in one NaijaDeals account.
              </p>
              <Link
                href={SIGN_IN_HREF}
                onClick={close}
                className="mt-3 flex min-h-11 items-center justify-center rounded-full bg-[#07351f] px-4 text-[12px] font-extrabold text-white transition hover:bg-[#0b4a2a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2"
              >
                Sign in
              </Link>
              <Link
                href={REGISTER_HREF}
                onClick={close}
                className="mt-2 flex min-h-11 items-center justify-center rounded-full border border-[#b9cbb4] px-4 text-[12px] font-extrabold text-[#0b5c33] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]"
              >
                Create account
              </Link>
            </div>

            <ul className="mt-3 divide-y divide-[#eef3ec]">
              <MenuRow href="/naijashop/help" label="Help" description="Delivery, payments, returns and account help." icon={CircleHelp} onClick={close} />
            </ul>

            <p className="mt-4 text-[10px] leading-4 text-[#566359]">
              One NaijaDeals identity across the marketplace and the wider ecosystem.
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-3 rounded-2xl border border-[#e1e8de] bg-[#f7faf4] p-3.5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#07351f] font-display text-[16px] font-extrabold text-[#8ed14b]">
                {(user.name || "?").slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-extrabold text-[#14241b]">{user.name}</p>
                <p className="truncate text-[10.5px] text-[#566359]">{user.email}</p>
              </div>
              <Link
                href="/account"
                onClick={close}
                className="shrink-0 rounded-full px-2 py-1 text-[10.5px] font-extrabold text-[#0b5c33] underline hover:bg-[#eef4ea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]"
              >
                Manage
              </Link>
            </div>

            {workspace ? (
              <Link
                href={workspace.href}
                onClick={close}
                className="mt-2 flex min-h-12 items-center gap-3 rounded-2xl border border-[#cfe0ca] bg-[#eef4ea] px-3.5 py-2.5 transition hover:bg-[#e2eddc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#07351f] text-[#8ed14b]">
                  <Store className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[9px] font-extrabold uppercase tracking-[0.14em] text-[#0f7a4a]">Partner tools</span>
                  <span className="block text-[12px] font-extrabold text-[#14241b]">Switch to workspace</span>
                  <span className="block truncate text-[10px] text-[#566359]">{workspace.label}</span>
                </span>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-[#0b5c33]" aria-hidden />
              </Link>
            ) : null}

            {error ? (
              <div role="alert" className="mt-3 rounded-xl border border-[#f0c8c2] bg-[#fdf2f0] px-3 py-2 text-[11px] font-semibold text-[#8a1c14]">
                {error}
              </div>
            ) : null}

            <nav aria-label="Account and lists" className="mt-3">
              <ul className="divide-y divide-[#eef3ec]">
                <MenuRow href="/account#saved" label="Saved" description="Items you saved for later." icon={Heart} onClick={close} />
                <MenuRow
                  href="/cart"
                  label="Shopping lists"
                  description="Saved-for-later items in your cart."
                  icon={ListChecks}
                  onClick={close}
                />
                <li>
                  <button
                    ref={recentTriggerRef}
                    type="button"
                    onClick={() => setView("recent")}
                    className="group flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-[#eef4ea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-inset"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#eef4ea] text-[#0b5c33]">
                      <Clock3 className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-extrabold leading-tight text-[#14241b] group-hover:text-[#0b5c33]">
                        Recently viewed
                      </span>
                      <span className="mt-0.5 block text-[10.5px] leading-4 text-[#566359]">
                        {recent.length > 0 ? `${recent.length} recorded on this device.` : "Products you open from this storefront."}
                      </span>
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#7a9c80]" aria-hidden />
                  </button>
                </li>
                <MenuRow href="/orders" label="Orders & returns" description="Track an order or raise a return." icon={Package} onClick={close} />
                <MenuRow href="/account#addresses" label="Addresses" description="Delivery addresses and default." icon={MapPin} onClick={close} />
                <MenuRow href="/wallet" label="Wallet & Payments" description="Balance, escrow and transactions." icon={Wallet} onClick={close} />
                <MenuRow href="/naijashop/help" label="Help" description="Marketplace customer service." icon={CircleHelp} onClick={close} />
              </ul>
            </nav>

            <button
              type="button"
              onClick={() => void signOut()}
              disabled={busy}
              className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#e1e8de] px-4 text-[12px] font-extrabold text-[#14241b] transition hover:bg-[#f7faf4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <LogOut className="h-4 w-4" aria-hidden />}
              {busy ? "Signing out…" : "Sign out"}
            </button>
          </div>
        )}
      </div>
    </ShopPanelFrame>
  );
}
