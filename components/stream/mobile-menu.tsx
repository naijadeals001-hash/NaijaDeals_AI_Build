"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  BarChart3,
  Crown,
  Globe2,
  Heart,
  ListMusic,
  Mic2,
  Music2,
  Podcast,
  Radio,
  Search,
  Sparkles,
  Settings,
  Upload,
  User,
  Video,
  X
} from "lucide-react";

const SECTIONS: Array<{ title: string; items: Array<{ label: string; href: string; icon: typeof Music2 }> }> = [
  {
    title: "Listen",
    items: [
      { label: "Music", href: "/naijastream/music", icon: Music2 },
      { label: "Podcasts", href: "/naijastream/podcasts", icon: Podcast },
      { label: "Live Events", href: "/naijastream/live", icon: Radio },
      { label: "Videos", href: "/naijastream/videos", icon: Video },
      { label: "Search", href: "/naijastream/search", icon: Search },
      { label: "Ask Aura", href: "/naijastream/aura", icon: Sparkles }
    ]
  },
  {
    title: "Discover",
    items: [
      { label: "Explore Africa", href: "/naijastream/explore", icon: Globe2 },
      { label: "Creators", href: "/naijastream/artists", icon: Mic2 },
      { label: "Charts", href: "/naijastream/charts", icon: BarChart3 },
      { label: "Playlists", href: "/naijastream/playlists", icon: ListMusic }
    ]
  },
  {
    title: "Your library",
    items: [
      { label: "Your Library", href: "/naijastream/library", icon: ListMusic },
      { label: "Liked Songs", href: "/naijastream/library?tab=liked", icon: Heart },
      { label: "Your Playlists", href: "/naijastream/library?tab=playlists", icon: Music2 }
    ]
  },
  {
    title: "Account",
    items: [
      { label: "Go Premium", href: "/naijastream/premium", icon: Crown },
      { label: "Creator Studio", href: "/naijastream/studio", icon: Upload },
      { label: "Settings", href: "/naijastream/studio/settings", icon: Settings },
      { label: "Account", href: "/naijastream/account", icon: User }
    ]
  }
];

/**
 * Full-screen mobile navigation drawer. Every desktop destination is present,
 * with focus trapping, Escape to close, scroll lock and active-page marking.
 */
export function MobileMenu({
  open,
  onClose,
  user
}: {
  open: boolean;
  onClose: () => void;
  user: { name: string; email: string } | null;
}) {
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="NaijaStream menu">
      <button type="button" aria-label="Close menu" onClick={onClose} className="absolute inset-0 bg-black/70" />
      <div
        ref={panelRef}
        className="absolute inset-y-0 right-0 flex w-[86%] max-w-sm flex-col overflow-y-auto bg-[#0d1210] pb-[env(safe-area-inset-bottom)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-black">
              <Music2 className="h-4 w-4" aria-hidden />
            </span>
            <span>
              <span className="block font-display text-[15px] font-extrabold">NaijaStream</span>
              <span className="block text-[10px] text-white/45">Africa&apos;s sounds. Your world.</span>
            </span>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close menu" className="rounded-full border border-white/15 p-2 text-white/80">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {user ? (
          <Link href="/naijastream/account" onClick={onClose} className="mx-4 mt-4 flex items-center gap-3 rounded-xl bg-white/5 p-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-[13px] font-extrabold">
              {user.name.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-bold">{user.name}</span>
              <span className="block truncate text-[10.5px] text-white/45">{user.email}</span>
            </span>
          </Link>
        ) : (
          <Link href="/login?next=/naijastream" onClick={onClose} className="mx-4 mt-4 block rounded-xl bg-emerald-500 py-2.5 text-center text-[12.5px] font-bold text-black">
            Sign in
          </Link>
        )}

        <nav className="flex-1 p-4" aria-label="All sections">
          {SECTIONS.map((section) => (
            <div key={section.title} className="mb-4">
              <p className="px-2 text-[10px] font-bold uppercase tracking-widest text-white/35">{section.title}</p>
              <ul className="mt-1">
                {section.items.map((item) => {
                  const active = pathname === item.href.split("?")[0];
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center gap-3 rounded-lg px-2 py-2.5 text-[13px] font-semibold ${
                          active ? "bg-emerald-500/15 text-emerald-300" : "text-white/75 hover:bg-white/5"
                        }`}
                      >
                        <item.icon className="h-4 w-4" aria-hidden />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}
