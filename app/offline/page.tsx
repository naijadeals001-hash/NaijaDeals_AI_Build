import type { Metadata } from "next";
import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata: Metadata = { title: "You are offline — NaijaDeals" };

/** Static offline fallback served by the service worker when a page is unreachable. */
export default function OfflinePage() {
  return (
    <section className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-6 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-[#eef4fb]"><WifiOff className="h-6 w-6 text-[#0b5c33]" aria-hidden /></span>
      <h1 className="mt-4 font-display text-[22px] font-extrabold">You are offline</h1>
      <p className="mt-1 text-[12.5px] leading-6 text-[#5d6d64]">
        This page was not saved for offline use. Pages you have already opened may still work, but payments, bookings and deliveries need a connection.
      </p>
      <Link href="/" className="mt-4 rounded-full bg-[#0b5c33] px-5 py-2 text-[12px] font-extrabold text-white">Try the home page</Link>
    </section>
  );
}
