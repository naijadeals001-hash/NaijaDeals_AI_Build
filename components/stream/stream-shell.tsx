"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Bell,
  Crown,
  Heart,
  Home,
  LayoutGrid,
  Library,
  ListMusic,
  Mic2,
  Music2,
  Podcast,
  Radio,
  Search,
  Sparkles,
  Compass,
  Upload,
  User,
  Video
} from "lucide-react";
import { StreamPlayerBar } from "./player-bar";

const primaryNav = [
  { label: "Home", href: "/naijastream", icon: Home },
  { label: "Discover", href: "/naijastream/discover", icon: Compass },
  { label: "Music", href: "/naijastream/music", icon: Music2 },
  { label: "Podcasts", href: "/naijastream/podcasts", icon: Podcast },
  { label: "Live Events", href: "/naijastream/live", icon: Radio },
  { label: "Videos", href: "/naijastream/videos", icon: Video },
  { label: "Creators", href: "/naijastream/artists", icon: Mic2 },
  { label: "Charts", href: "/naijastream/charts", icon: BarChart3 },
  { label: "Playlists", href: "/naijastream/playlists", icon: ListMusic }
];

const libraryNav = [
  { label: "Your Library", href: "/naijastream/library", icon: Library },
  { label: "Liked Songs", href: "/naijastream/library?tab=liked", icon: Heart }
];

const mobileNav = [
  { label: "Home", href: "/naijastream", icon: Home },
  { label: "Search", href: "/naijastream/search", icon: Search },
  { label: "Library", href: "/naijastream/library", icon: Library },
  { label: "Live", href: "/naijastream/live", icon: Radio },
  { label: "Profile", href: "/naijastream/studio", icon: User }
];

export function StreamShell({
  children,
  user
}: {
  children: React.ReactNode;
  user: { name: string; email: string } | null;
}) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("stream-search")?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  function isActive(href: string) {
    const base = href.split("?")[0];
    return base === "/naijastream" ? pathname === base : pathname.startsWith(base);
  }

  return (
    <div className="min-h-screen bg-[#0a0d0b] text-white">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[240px] flex-col border-r border-white/10 bg-[#0d1210] lg:flex">
        <div className="px-5 pb-4 pt-5">
          <Link href="/naijastream" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-black">
              <Music2 className="h-5 w-5" aria-hidden />
            </span>
            <span>
              <span className="block font-display text-[17px] font-extrabold leading-tight">NaijaStream</span>
              <span className="block text-[10px] text-white/50">Africa&apos;s sounds. Your world.</span>
            </span>
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label="Primary">
          <ul className="space-y-0.5">
            {primaryNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-semibold transition ${
                    isActive(item.href) ? "bg-emerald-500/15 text-emerald-300" : "text-white/70 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <item.icon className="h-4 w-4" aria-hidden />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-5 px-3 text-[10px] font-bold uppercase tracking-widest text-white/35">Your library</p>
          <ul className="mt-1 space-y-0.5">
            {libraryNav.map((item) => (
              <li key={item.label}>
                <Link href={item.href} className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-semibold text-white/70 transition hover:bg-white/5 hover:text-white">
                  <item.icon className="h-4 w-4" aria-hidden />
                  {item.label}
                </Link>
              </li>
            ))}
            {user ? (
              <li>
                <Link href="/naijastream/library" className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-semibold text-white/70 transition hover:bg-white/5 hover:text-white">
                  <ListMusic className="h-4 w-4" aria-hidden />
                  Your Playlists
                </Link>
              </li>
            ) : null}
          </ul>
        </nav>
        <div className="m-3 rounded-xl bg-gradient-to-br from-emerald-600/25 to-emerald-900/20 p-4">
          <Crown className="h-5 w-5 text-amber-300" aria-hidden />
          <p className="mt-2 text-[13px] font-extrabold">Go Premium</p>
          <p className="text-[10.5px] leading-4 text-white/60">Ad-free listening, higher audio quality and offline mode.</p>
          <Link href="/naijastream/premium" className="mt-3 block rounded-lg border border-white/20 py-2 text-center text-[11px] font-bold text-white/80">
            View plans
          </Link>
        </div>
      </aside>

      {/* Top header */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0a0d0b]/95 backdrop-blur lg:pl-[240px]">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/naijastream" className="flex items-center gap-2 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-black">
              <Music2 className="h-4 w-4" aria-hidden />
            </span>
          </Link>
          <form action="/naijastream/search" className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4">
            <Search className="h-4 w-4 shrink-0 text-white/40" aria-hidden />
            <input
              id="stream-search"
              name="q"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search for songs, artists, podcasts or playlists…"
              aria-label="Search NaijaStream"
              className="h-10 w-full min-w-0 bg-transparent text-[13px] text-white outline-none placeholder:text-white/40"
            />
            <kbd className="hidden rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/40 sm:block">⌘K</kbd>
          </form>
          <Link href="/naijastream/live" aria-label="Live now" className="hidden rounded-full p-2 text-white/60 hover:text-white sm:block">
            <Radio className="h-4 w-4" aria-hidden />
          </Link>
          <Link href="/naijastream/notifications" aria-label="Notifications" className="hidden rounded-full p-2 text-white/60 hover:text-white sm:block">
            <Bell className="h-4 w-4" aria-hidden />
          </Link>
          {user ? (
            <Link href="/naijastream/studio/upload" className="hidden items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-[12px] font-bold text-white hover:bg-emerald-500 sm:flex">
              <Upload className="h-3.5 w-3.5" aria-hidden /> Upload
            </Link>
          ) : (
            <Link href="/login?next=/naijastream/studio/upload" className="hidden items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-[12px] font-bold text-white hover:bg-emerald-500 sm:flex">
              <Upload className="h-3.5 w-3.5" aria-hidden /> Upload
            </Link>
          )}
          <Link href="/naijastream/aura" aria-label="Ask Aura" className="flex items-center gap-1.5 rounded-full border border-emerald-400/30 px-3 py-2 text-[11px] font-bold text-emerald-300">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> <span className="hidden md:inline">Ask Aura</span>
          </Link>
          {user ? (
            <Link href="/naijastream/account" className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-[12px] font-extrabold" aria-label="Account menu">
              {user.name.charAt(0).toUpperCase()}
            </Link>
          ) : (
            <Link href="/login?next=/naijastream" className="rounded-lg border border-white/20 px-3 py-2 text-[11px] font-bold text-white">
              Sign in
            </Link>
          )}
        </div>
      </header>

      <div className="pb-28 lg:pl-[240px]">{children}</div>

      <StreamPlayerBar />

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#0b0f0d]/98 backdrop-blur lg:hidden" aria-label="Mobile">
        <ul className="grid grid-cols-5">
          {mobileNav.map((item) => (
            <li key={item.label}>
              <Link
                href={item.href}
                aria-current={isActive(item.href) && item.href !== "/naijastream" ? "page" : pathname === item.href ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-2 text-[10px] font-semibold ${isActive(item.href) ? "text-emerald-400" : "text-white/55"}`}
              >
                <item.icon className="h-5 w-5" aria-hidden />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Link
        href="/naijastream/studio"
        aria-label="Creator studio"
        className="fixed bottom-24 right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-black shadow-lg lg:hidden"
      >
        <LayoutGrid className="h-5 w-5" aria-hidden />
      </Link>
    </div>
  );
}
