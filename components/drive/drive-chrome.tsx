"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Car, ChevronDown, MapPin, Menu, UserRound, X } from "lucide-react";
import { DRIVE_CITY } from "@/lib/config/drive";

const focus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b5c33]";

function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#0b5c33] text-white">
        <Car className="h-5 w-5" aria-hidden />
      </span>
      <span className="leading-none">
        <span className="block font-display text-[20px] font-extrabold tracking-tight text-[#0b5c33]">
          NaijaDrive
        </span>
        <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-[0.14em] text-[#5d6d64]">
          by NaijaDeals
        </span>
      </span>
    </span>
  );
}

export function DriveHeader({
  viewer
}: {
  viewer: { name: string; isDriver: boolean } | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const links = [
    ["Ride", "/naijadrive"],
    ["Eat", "/naijaeats"],
    ["Drive & earn", viewer?.isDriver ? "/driver" : "/naijadrive#drive-with-us"],
    ["Safety", "/naijadrive#safety"],
    ["Help", "/naijadrive/help"]
  ] as const;

  return (
    <header className="sticky top-0 z-40 border-b border-[#e6ece6] bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-[64px] max-w-[1320px] items-center gap-2 px-3 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open NaijaDrive menu"
          aria-expanded={menuOpen}
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[#0b5c33] hover:bg-[#eaf5ec] lg:hidden ${focus}`}
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>

        <Link href="/naijadrive" aria-label="NaijaDrive home" className={`shrink-0 rounded-lg ${focus}`}>
          <Logo />
        </Link>

        <span className="mx-2 hidden h-7 w-px bg-[#e6ece6] lg:block" aria-hidden />

        <nav aria-label="NaijaDrive" className="hidden items-center gap-1 lg:flex">
          {links.map(([label, href]) => (
            <Link
              key={label}
              href={href}
              className={`rounded-full px-3 py-2 text-[13px] font-bold text-[#33443a] transition hover:bg-[#f2f7f2] hover:text-[#0b5c33] ${focus}`}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <Link
            href="#service-area"
            className={`hidden items-center gap-1.5 rounded-full border border-[#dfe7df] px-3 py-2 text-[12px] font-bold text-[#14241b] hover:border-[#0b5c33]/40 sm:inline-flex ${focus}`}
          >
            <MapPin className="h-3.5 w-3.5 text-[#0b5c33]" aria-hidden />
            {DRIVE_CITY}
            <ChevronDown className="h-3.5 w-3.5 text-[#5d6d64]" aria-hidden />
          </Link>
          <Link
            href="#service-area"
            aria-label={`Service area: ${DRIVE_CITY}`}
            className={`inline-flex h-10 items-center gap-1 rounded-full border border-[#dfe7df] px-2.5 text-[12px] font-bold text-[#14241b] sm:hidden ${focus}`}
          >
            <MapPin className="h-3.5 w-3.5 text-[#0b5c33]" aria-hidden />
            {DRIVE_CITY}
          </Link>

          {viewer ? (
            <Link
              href="/account"
              className={`hidden items-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-bold text-[#0b5c33] hover:bg-[#f2f7f2] md:inline-flex ${focus}`}
            >
              <UserRound className="h-4 w-4" aria-hidden />
              {viewer.name.split(" ")[0]}
            </Link>
          ) : (
            <Link
              href="/login?next=/naijadrive"
              className={`hidden rounded-full px-3 py-2 text-[12px] font-bold text-[#33443a] hover:bg-[#f2f7f2] md:inline-flex ${focus}`}
            >
              Log in
            </Link>
          )}

          <Link
            href="#book"
            className={`hidden min-h-10 items-center justify-center rounded-[10px] bg-[#16a34a] px-4 text-[12.5px] font-extrabold text-white shadow-sm hover:bg-[#128a3f] sm:inline-flex ${focus}`}
          >
            Book a ride
          </Link>
        </div>
      </div>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="NaijaDrive menu">
          <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-black/50" />
          <div className="relative h-full w-[86%] max-w-sm overflow-y-auto bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <Logo />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className={`grid h-10 w-10 place-items-center rounded-lg text-[#33443a] hover:bg-[#f2f7f2] ${focus}`}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <nav aria-label="Mobile NaijaDrive" className="mt-4 space-y-1">
              {links.map(([label, href]) => (
                <Link
                  key={label}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className={`block rounded-xl px-3 py-3 text-[14px] font-bold text-[#14241b] hover:bg-[#f2f7f2] ${focus}`}
                >
                  {label}
                </Link>
              ))}
            </nav>
            <div className="mt-4 border-t border-[#eef1ef] pt-4">
              {viewer ? (
                <Link href="/account" onClick={() => setMenuOpen(false)} className={`block rounded-xl px-3 py-3 text-[13px] font-bold text-[#0b5c33] hover:bg-[#f2f7f2] ${focus}`}>
                  {viewer.name} · Account
                </Link>
              ) : (
                <Link href="/login?next=/naijadrive" onClick={() => setMenuOpen(false)} className={`block rounded-xl px-3 py-3 text-[13px] font-bold text-[#0b5c33] hover:bg-[#f2f7f2] ${focus}`}>
                  Log in to NaijaDeals
                </Link>
              )}
              <Link
                href="#book"
                onClick={() => setMenuOpen(false)}
                className={`mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[#16a34a] px-4 text-[13px] font-extrabold text-white ${focus}`}
              >
                Book a ride in {DRIVE_CITY}
              </Link>
            </div>
            <p className="mt-4 text-[10.5px] leading-4 text-[#5d6d64]">
              NaijaDrive passenger rides are dispatched in {DRIVE_CITY}. Service availability is checked
              against the platform&apos;s city activation records.
            </p>
          </div>
        </div>
      ) : null}
    </header>
  );
}

export function DriveFooter() {
  const columns: Array<{ title: string; links: Array<[string, string]> }> = [
    {
      title: "Ride",
      links: [
        ["Book a ride", "/naijadrive#book"],
        ["Ride options", "/naijadrive#ride-options"],
        ["Airport rides", "/naijadrive#airport"],
        ["Saved places", "/naijadrive#saved-places"]
      ]
    },
    {
      title: "Drive",
      links: [
        ["Driver workspace", "/driver"],
        ["Driver requirements", "/naijadrive#driver-requirements"],
        ["Deliver food", "/naijaeats/courier"],
        ["Deliver parcels", "/naijasend/driver/jobs"]
      ]
    },
    {
      title: "Help",
      links: [
        ["Help centre", "/naijadrive/help"],
        ["Safety", "/naijadrive#safety"],
        ["FAQs", "/naijadrive#faq"],
        ["Your account", "/account"]
      ]
    },
    {
      title: "Legal",
      links: [
        ["Privacy notice", "/naijadrive/help#privacy"],
        ["Terms of use", "/naijadrive/help#terms"],
        ["Location data", "/naijadrive/help#location"]
      ]
    }
  ];

  return (
    <footer className="mt-12 bg-[#0b3d25] text-white">
      <div className="mx-auto grid max-w-[1320px] gap-7 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-6 lg:px-8">
        <div className="lg:col-span-2">
          <p className="flex items-center gap-2 font-display text-[20px] font-extrabold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10">
              <Car className="h-4 w-4" aria-hidden />
            </span>
            NaijaDrive
          </p>
          <p className="mt-2 max-w-xs text-[11.5px] leading-5 text-white/70">
            Part of the NaijaDeals ecosystem. Passenger rides in Lagos, booked with a server-locked
            fare and real trip records.
          </p>
          <p className="mt-3 flex flex-wrap gap-2 text-[10px]">
            <span className="rounded-full border border-white/25 px-2 py-0.5">Nigeria · NGN</span>
            <span className="rounded-full border border-white/25 px-2 py-0.5">Lagos dispatch</span>
          </p>
        </div>
        {columns.map((column) => (
          <div key={column.title}>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#8ed14b]">{column.title}</p>
            <ul className="mt-2 space-y-1.5 text-[11.5px] text-white/75">
              {column.links.map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="hover:text-white hover:underline">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/15">
        <div className="mx-auto flex max-w-[1320px] flex-col items-center justify-between gap-2 px-4 py-3 text-[10.5px] text-white/60 sm:flex-row sm:px-6 lg:px-8">
          <p>© 2026 NaijaDeals. All rights reserved.</p>
          <nav aria-label="NaijaDeals ecosystem" className="flex flex-wrap justify-center gap-3">
            <Link href="/naijashop" className="hover:text-white">NaijaShop</Link>
            <Link href="/naijaeats" className="hover:text-white">NaijaEats</Link>
            <Link href="/naijasend" className="hover:text-white">NaijaSend</Link>
            <Link href="/naijastay" className="hover:text-white">NaijaStay</Link>
            <Link href="/pay" className="hover:text-white">NaijaPay</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
