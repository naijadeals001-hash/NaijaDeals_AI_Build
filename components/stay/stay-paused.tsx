import Link from "next/link";
import { CalendarDays, LifeBuoy, ShieldCheck } from "lucide-react";
import { StayBottomNav, StayHeader } from "./stay-shell";
import { StayFooter } from "./stay-home";

/** Honest public state for a paused Stay market; existing commitments stay reachable. */
export function StayPaused({ message }: { message: string | null }) {
  return (
    <div className="min-h-screen bg-[#f7f9f7] text-[#14241b]" data-stay-paused>
      <StayHeader />
      <main id="main-content" className="mx-auto max-w-[900px] px-3 pb-24 pt-6 sm:px-6 lg:pb-10">
        <section className="rounded-3xl border border-[#dfe6e1] bg-white p-6 sm:p-8">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#0b5c33]">NaijaStay</p>
          <h1 className="mt-2 font-display text-[28px] font-extrabold tracking-tight sm:text-[34px]">
            Stays are paused in this market
          </h1>
          <p role="status" className="mt-3 max-w-2xl text-[13px] leading-6 text-[#5d6d64]">
            {message ?? "NaijaStay is not accepting new reservations or host listings here right now."} Existing bookings,
            cancellations, receipts and support remain available.
          </p>
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            <Link href="/naijastay/bookings" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0b5c33] px-4 text-[12px] font-extrabold text-white">
              <CalendarDays className="h-4 w-4" aria-hidden /> View bookings
            </Link>
            <Link href="/naijastay/help" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#c9d6cb] bg-white px-4 text-[12px] font-extrabold text-[#0b5c33]">
              <LifeBuoy className="h-4 w-4" aria-hidden /> Get help
            </Link>
            <Link href="/naijastay/host" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#c9d6cb] bg-white px-4 text-[12px] font-extrabold text-[#0b5c33]">
              <ShieldCheck className="h-4 w-4" aria-hidden /> Host tools
            </Link>
          </div>
          <p className="mt-4 text-[11px] leading-5 text-[#5d6d64]">
            Only stays explicitly marked Enforced in the Control Center are governed by this state. Other services are
            unaffected.
          </p>
        </section>
      </main>
      <StayFooter />
      <StayBottomNav />
    </div>
  );
}
