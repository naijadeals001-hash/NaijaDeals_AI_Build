"use client";

import { supportHref } from "@/lib/support/contact-link";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BedDouble,
  Car,
  ChevronDown,
  HardHat,
  Headphones,
  LayoutGrid,
  LogOut,
  Menu,
  Search,
  Send,
  ShoppingBag,
  UtensilsCrossed,
  Wallet,
  X,
  Sparkles,
  Bell,
  ReceiptText,
  User as UserIcon
} from "lucide-react";
import { contactAddress, type ContactKey } from "@/lib/data/contact-directory";

type PublicContactKey = Exclude<ContactKey, "accounts">;

const FOOTER_CONTACTS: Array<{ label: string; contact: PublicContactKey }> = [
  { label: "Customer support", contact: "support" },
  { label: "Professional and business enquiries", contact: "partners" },
  { label: "Report fraud or prohibited content", contact: "abuse" },
  { label: "Careers", contact: "careers" }
];

export type GigsHeaderUser = {
  name: string;
  email: string;
  actorType: string;
  roles: string[];
} | null;

export type GigsCategoryLink = { name: string; slug: string };

const ecosystem = [
  { label: "NaijaShop", href: "/naijashop", icon: ShoppingBag },
  { label: "NaijaEats", href: "/naijaeats", icon: UtensilsCrossed },
  { label: "NaijaDrive", href: "/naijadrive", icon: Car },
  { label: "NaijaSend", href: "/naijasend", icon: Send },
  { label: "NaijaStay", href: "/naijastay", icon: BedDouble },
  { label: "NaijaStream", href: "/naijastream", icon: Headphones },
  { label: "NaijaPay", href: "/naijapay", icon: Wallet }
];

export function GigsLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-[#0B3B2A] shadow-[0_6px_18px_rgba(11,59,42,0.18)]">
        <HardHat className="h-6 w-6 text-[#FFC24B]" aria-hidden />
        <span className="absolute -bottom-0.5 right-1 h-2 w-2 rounded-full bg-[#F97316]" />
      </span>
      <span className="leading-none">
        <span className={`block font-extrabold tracking-tight text-[#0B3B2A] ${compact ? "text-xl" : "text-[26px]"}`}>
          Naija<span className="text-[#0F7A4A]">Gigs</span>
        </span>
        {!compact && (
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6B7A72]">
            Professional Services Marketplace
          </span>
        )}
      </span>
    </span>
  );
}

export function EcosystemBar() {
  return (
    <div className="bg-[#073B2B] text-white">
      <div className="mx-auto flex h-10 max-w-[1440px] items-center gap-4 px-4 sm:px-6 lg:px-10">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-[12px] font-semibold text-white/90 hover:text-white">
          <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
          NaijaDeals Ecosystem
          <ChevronDown className="h-3 w-3 text-white/60" aria-hidden />
        </Link>
        <nav aria-label="NaijaDeals ecosystem" className="ml-auto overflow-x-auto hide-scrollbar">
          <ul className="flex items-center gap-1">
            {ecosystem.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[11.5px] font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  <item.icon className="h-3.5 w-3.5" aria-hidden />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}

export function GigsHeader({ user, categories }: { user: GigsHeaderUser; categories: GigsCategoryLink[] }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-white shadow-sm">
      <div className="bg-[#0b5c33] text-white">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-2 px-3 py-2 sm:gap-3 sm:px-6 lg:px-8">
        <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu" aria-expanded={menuOpen} className="grid h-9 w-9 shrink-0 place-items-center rounded text-white hover:bg-white/10 lg:hidden">
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <Link href="/naijagigs" aria-label="NaijaGigs home" className="shrink-0">
          <span className="flex items-center gap-1.5">
            <Sparkles className="h-6 w-6 text-[#f5b52e]" aria-hidden />
            <span className="leading-tight">
              <span className="block text-[19px] font-extrabold leading-none text-white sm:text-[22px]">Naija<span className="text-[#f5b52e]">Gigs</span></span>
              <span className="hidden text-[8.5px] font-medium text-white/80 sm:block">Skills. Jobs. Gigs. Opportunities Across Africa.</span>
            </span>
          </span>
        </Link>
        <form action="/naijagigs/services" method="get" role="search" className="order-last flex w-full min-w-0 items-stretch overflow-hidden rounded-full bg-white lg:order-none lg:flex-1">
          <label htmlFor="gigs-q" className="sr-only">Search for skills, services, jobs or opportunities</label>
          <Search className="ml-3 hidden h-4 w-4 self-center text-[#6b7a70] sm:block" aria-hidden />
          <input id="gigs-q" name="q" type="search" placeholder="Search for skills, services, jobs or opportunities…" className="min-h-9 w-full min-w-0 bg-transparent px-3 text-[12.5px] text-[#14241b] outline-none" />
          <button type="submit" aria-label="Search" className="grid w-11 place-items-center bg-[#f26b21] text-white"><Search className="h-4 w-4" aria-hidden /></button>
        </form>
        <nav aria-label="Your NaijaGigs account" className="ml-auto flex shrink-0 items-center gap-1 text-[11.5px] font-semibold sm:gap-2.5">
          <Link href="/" aria-label="Back to the NaijaDeals dashboard" className="mr-1 hidden items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 hover:bg-white/20 md:flex">
            <LayoutGrid className="h-3.5 w-3.5" aria-hidden /> NaijaDeals
          </Link>
          <Link href="/naijagigs/notifications" className="hidden items-center gap-1 hover:text-[#f5b52e] sm:flex"><Bell className="h-4 w-4" aria-hidden /> Notifications</Link>
          <Link href="/naijagigs/bookings" className="flex items-center gap-1 hover:text-[#f5b52e]"><ReceiptText className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Orders</span></Link>
          <Link href="/naijagigs/account" className="flex items-center gap-1 hover:text-[#f5b52e]"><UserIcon className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Sign In</span></Link>
        </nav>

        </div>
      </div>

      {searchOpen && (
        <div className="border-t border-[#EEEAE0] bg-white/98">
          <form action="/naijagigs/services" className="mx-auto flex max-w-[1440px] items-center gap-2 px-4 py-3 sm:px-6 lg:px-10">
            <Search className="h-5 w-5 text-[#6B7A72]" aria-hidden />
            <input
              name="q"
              autoFocus
              placeholder="Search plumbing, solar, design, catering…"
              aria-label="Search services"
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-[#8A978F]"
            />
            <button type="submit" className="rounded-lg bg-[#0F7A4A] px-5 py-2.5 text-[13px] font-bold text-white">
              Search
            </button>
          </form>
        </div>
      )}

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-[#041C14]/50 backdrop-blur-sm"
          />
          <div className="absolute inset-y-0 right-0 flex w-[86%] max-w-sm flex-col bg-[#FFFDF8] p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <GigsLogo compact />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E1DCCF]"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <nav aria-label="NaijaGigs mobile" className="mt-6 flex flex-col gap-1">
              {[
                { label: "Explore Services", href: "/naijagigs/services" },
                { label: "Find Professionals", href: "/naijagigs/professionals" },
                { label: "Post a Job", href: "/naijagigs/jobs/new" },
                { label: "How It Works", href: "/naijagigs#how-it-works" },
                { label: "Become a Pro", href: "/naijagigs/pro" }
              ].map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center justify-between rounded-xl px-3 py-3 text-[15px] font-semibold text-[#23342C] hover:bg-[#F2F7F3]"
                >
                  {item.label}
                  <ArrowRight className="h-4 w-4 text-[#0F7A4A]" aria-hidden />
                </Link>
              ))}
            </nav>
            <div className="mt-4 border-t border-[#EEEAE0] pt-4">
              <p className="px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#8A978F]">Categories</p>
              <div className="mt-2 grid grid-cols-2 gap-1">
                {categories.map((category) => (
                  <Link
                    key={category.slug}
                    href={`/naijagigs/services?category=${category.slug}`}
                    onClick={() => setMenuOpen(false)}
                    className="rounded-lg px-3 py-2 text-[12.5px] font-medium text-[#3B4A42] hover:bg-[#F2F7F3]"
                  >
                    {category.name}
                  </Link>
                ))}
              </div>
            </div>
            <div className="mt-auto grid gap-2 pt-6">
              {user ? (
                <>
                  <Link href="/" onClick={() => setMenuOpen(false)} className="rounded-xl border border-[#C9D6CD] px-4 py-3 text-center text-sm font-bold text-[#0B3B2A]">NaijaDeals dashboard</Link>
                  <Link href="/naijagigs/account" onClick={() => setMenuOpen(false)} className="rounded-xl border border-[#C9D6CD] px-4 py-3 text-center text-sm font-bold text-[#0B3B2A]">
                    My dashboard
                  </Link>
                  <Link href="/naijagigs/pro" onClick={() => setMenuOpen(false)} className="rounded-xl bg-[#0F7A4A] px-4 py-3 text-center text-sm font-bold text-white">
                    Professional dashboard
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/login?next=/naijagigs" onClick={() => setMenuOpen(false)} className="rounded-xl border border-[#C9D6CD] px-4 py-3 text-center text-sm font-bold text-[#0B3B2A]">
                    Sign In
                  </Link>
                  <Link href="/register?next=/naijagigs" onClick={() => setMenuOpen(false)} className="rounded-xl bg-[#0F7A4A] px-4 py-3 text-center text-sm font-bold text-white">
                    Create Account
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      <nav aria-label="NaijaGigs quick actions" className="bg-[#0b5c33]">
        <div className="mx-auto flex max-w-[1440px] gap-2 overflow-x-auto border-t border-white/10 px-3 py-1.5 text-[11.5px] font-semibold [scrollbar-width:none] sm:px-6 lg:px-8">
          {[["Browse Services", "/naijagigs/services"], ["Find Jobs", "/naijagigs/jobs"], ["Hire Talent", "/naijagigs/professionals"], ["For Companies", "/naijagigs/post-job"], ["For Government", "/naijagigs/government"], ["How It Works", "/naijagigs/how-it-works"]].map(([label, href]) => (
            <Link key={href} href={href} className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-white hover:bg-white/20">{label}</Link>
          ))}
        </div>
      </nav>

    </header>
  );
}

export function GigsTrustStrip() {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px] font-medium text-[#45564C]">
      {[
        { icon: BadgeCheck, label: "Verified professional profiles" },
        { icon: HardHat, label: "Wide range of services" },
        { icon: Wallet, label: "Secure escrow payments" }
      ].map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0B3B2A] text-white">
            <item.icon className="h-3 w-3" aria-hidden />
          </span>
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function GigsFooter() {
  return (
    <footer className="bg-[#073B2B] text-white">
      <div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-5 lg:px-10">
        <div className="lg:col-span-2">
          <GigsLogo />
          <p className="mt-4 max-w-sm text-[13px] leading-6 text-white/60">
            Skilled hands and brilliant minds across Africa. Find trusted professionals, agree the work and pay through
            escrow with the NaijaDeals ecosystem.
          </p>
          <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#FFC24B]">
            Part of the NaijaDeals super app
          </p>
        </div>
        <div>
          <h3 className="text-[12px] font-bold uppercase tracking-[0.16em] text-white/50">Customers</h3>
          <ul className="mt-3 space-y-2 text-[13px] text-white/75">
            <li><Link href="/naijagigs/services" className="hover:text-white">Browse services</Link></li>
            <li><Link href="/naijagigs/professionals" className="hover:text-white">Find professionals</Link></li>
            <li><Link href="/naijagigs/jobs/new" className="hover:text-white">Post a job</Link></li>
            <li><Link href="/naijagigs/account" className="hover:text-white">My bookings</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="text-[12px] font-bold uppercase tracking-[0.16em] text-white/50">Professionals</h3>
          <ul className="mt-3 space-y-2 text-[13px] text-white/75">
            <li><Link href="/naijagigs/pro" className="hover:text-white">Professional dashboard</Link></li>
            <li><Link href="/naijagigs/pro/apply" className="hover:text-white">Apply to join</Link></li>
            <li><Link href="/naijagigs/jobs" className="hover:text-white">Find work</Link></li>
            <li><Link href="/naijagigs#how-it-works" className="hover:text-white">How NaijaGigs works</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="text-[12px] font-bold uppercase tracking-[0.16em] text-white/50"><Link href="/" className="hover:text-white">Ecosystem →</Link></h3>
          <ul className="mt-3 space-y-2 text-[13px] text-white/75">
            {ecosystem.slice(0, 5).map((item) => (
              <li key={item.label}><Link href={item.href} className="hover:text-white">{item.label}</Link></li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-10">
          <h3 className="text-[12px] font-bold uppercase tracking-[0.16em] text-white/50">Contact</h3>
          <ul className="mt-3 grid gap-x-8 gap-y-2 text-[13px] text-white/75 sm:grid-cols-2">
            {FOOTER_CONTACTS.map((entry) => (
              <li key={entry.contact}>
                {entry.label}:{" "}
                <a href={supportHref(entry.contact)} className="hover:text-white hover:underline">
                  {contactAddress(entry.contact)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-4 py-5 text-[11px] text-white/45 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
          <p>© {new Date().getFullYear()} NaijaDeals. All rights reserved.</p>
          <p>Service imagery is original NaijaGigs illustration, not photography of real providers.</p>
        </div>
      </div>
    </footer>
  );
}

export function GigsPageShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#FAF7F0] text-[#16241D]">{children}</div>;
}

export function SignOutNote() {
  return (
    <p className="text-[11px] text-[#6B7A72]">
      <LogOut className="mr-1 inline h-3 w-3" aria-hidden /> Sign out from the main NaijaDeals menu.
    </p>
  );
}
