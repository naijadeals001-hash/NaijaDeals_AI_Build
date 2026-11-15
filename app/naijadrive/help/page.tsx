import type { Metadata } from "next";
import Link from "next/link";
import { ContactLine } from "@/components/contact/contact-line";
import { DriveFooter, DriveHeader } from "@/components/drive/drive-chrome";
import { getSessionUser, isDriver } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Help centre — NaijaDrive",
  description:
    "NaijaDrive help: booking, payments, safety, driver eligibility, location data and support channels."
};

export const dynamic = "force-dynamic";

const topics = [
  {
    title: "Booking a ride",
    body: "Choose a Lagos landmark for pick-up and destination, review the server quote, sign in and request. A request is in the driver queue until an approved driver accepts; you can cancel before the trip starts. The fare is locked at request time.",
    href: "/naijadrive#book",
    label: "Book a ride"
  },
  {
    title: "Payments and receipts",
    body: "Pay cash to the driver, or use your NaijaPay wallet. A wallet fare is held at request and released to the driver when the trip completes. A cash fare stays marked due until the driver records collection. Receipts appear on the completed trip.",
    href: "/wallet",
    label: "Open NaijaPay wallet"
  },
  {
    title: "Safety and tracking",
    body: "After assignment, the trip page shows the approved driver, vehicle and plate plus a 4-digit pickup code. The server refuses to start the trip until the driver verifies that code. Tracking shows server timestamps and an accuracy radius; a stale position is labelled, never presented as live.",
    href: "/naijadrive#safety",
    label: "Safety information"
  },
  {
    title: "Driver requirements",
    body: "Passenger rides need an approved DriverProfile, a licence number on file, an approved vehicle with class and plate, a Lagos service zone and browser location while online. Food and parcel eligibility are separate. New driver applications are not open in this build.",
    href: "/driver",
    label: "Driver workspace"
  }
];

export default async function DriveHelpPage() {
  const user = await getSessionUser();
  return (
    <div className="min-h-screen bg-[#fbfcf9] text-[#14241b]">
      <DriveHeader viewer={user ? { name: user.name, isDriver: isDriver(user) } : null} />
      <main className="mx-auto max-w-[900px] px-4 py-8 sm:px-6">
        <h1 className="font-display text-[28px] font-extrabold">Help centre</h1>
        <p className="mt-1 text-[12px] leading-6 text-[#6b7a70]">
          What this build actually supports, and what it deliberately does not.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {topics.map((topic) => (
            <section key={topic.title} className="rounded-2xl bg-white p-4 ring-1 ring-[#e6ece6]">
              <h2 className="text-[14px] font-extrabold">{topic.title}</h2>
              <p className="mt-1 text-[11.5px] leading-6 text-[#5d6d64]">{topic.body}</p>
              <Link href={topic.href} className="mt-2 inline-block text-[11.5px] font-bold text-[#0b5c33] underline">
                {topic.label}
              </Link>
            </section>
          ))}
        </div>

        <section id="support" className="mt-3 scroll-mt-24 rounded-2xl bg-white p-4 ring-1 ring-[#e6ece6]">
          <h2 className="text-[14px] font-extrabold">Support</h2>
          <p className="mt-1 text-[11.5px] leading-6 text-[#5d6d64]">
            Support is handled from your account and your active trip page. This build has no published
            telephone line or guaranteed response time, so none is shown. For a live trip, open the trip
            page first; for an account question, open your account.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href="/account" className="inline-flex min-h-9 items-center rounded-lg bg-[#0b5c33] px-3 text-[11px] font-bold text-white">
              Your account
            </Link>
            <Link href="/orders" className="inline-flex min-h-9 items-center rounded-lg border border-[#dfe7df] px-3 text-[11px] font-bold text-[#0b5c33]">
              Your activity
            </Link>
          </div>
          <div className="mt-2">
            <ContactLine contact="support" label="Rider support" subject="NaijaDrive help" className="text-[11.5px] leading-6 text-[#5d6d64]" />
          </div>
        </section>

        <section id="drivers" className="mt-3 scroll-mt-24 rounded-2xl bg-white p-4 ring-1 ring-[#e6ece6]">
          <h2 className="text-[14px] font-extrabold">For drivers</h2>
          <p className="mt-1 text-[11.5px] leading-6 text-[#5d6d64]">
            An approved partner can go online in the driver workspace, receive open passenger requests,
            update arrival and completion, and see server-recorded online and driving time. A browser
            cannot guarantee location updates while the screen is locked or the app is closed; the
            workspace says so and marks the last-known position as stale.
          </p>
          <div className="mt-2">
            <ContactLine contact="drivers" label="Driver and courier enquiries" subject="Driver onboarding" className="text-[11.5px] leading-6 text-[#5d6d64]" />
          </div>
        </section>

        <section id="privacy" className="mt-3 scroll-mt-24 rounded-2xl bg-white p-4 ring-1 ring-[#e6ece6]">
          <h2 className="text-[14px] font-extrabold">Privacy notice</h2>
          <p className="mt-1 text-[11.5px] leading-6 text-[#5d6d64]">
            NaijaDrive uses your account identity, trip records, wallet ledger entries and — while you are
            online or on a trip — device location fixes. Location fixes are tied to the ride or presence
            session and are readable only by the rider, the assigned driver and authorised administrators
            through server-side ownership checks. No public share link is created by the “Share trip
            details” action; it opens your own messaging app with a text summary.
          </p>
          <p className="mt-2 text-[11.5px] leading-6 text-[#5d6d64]">
            This page describes how the application handles data. It is not a claim of legal or regulatory
            compliance, and a formal retention schedule still requires owner approval.
          </p>
          <div className="mt-2">
            <ContactLine contact="privacy" label="Privacy and personal-data requests" subject="Privacy request" className="text-[11.5px] leading-6 text-[#5d6d64]" />
          </div>
        </section>

        <section id="location" className="mt-3 scroll-mt-24 rounded-2xl bg-white p-4 ring-1 ring-[#e6ece6]">
          <h2 className="text-[14px] font-extrabold">Location data</h2>
          <p className="mt-1 text-[11.5px] leading-6 text-[#5d6d64]">
            Location is collected only after you grant browser permission, and only while you are online
            with no active trip or while you hold an active ride. Denied, unavailable and timed-out
            requests are shown as such. A fix older than 90 seconds is marked stale; driver presence
            expires after 120 seconds without a heartbeat. Browser geolocation cannot guarantee updates
            while the operating system suspends the page, the screen locks or the browser closes.
          </p>
        </section>

        <section id="terms" className="mt-3 scroll-mt-24 rounded-2xl bg-white p-4 ring-1 ring-[#e6ece6]">
          <h2 className="text-[14px] font-extrabold">Terms of use (build summary)</h2>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-[11.5px] leading-6 text-[#5d6d64]">
            <li>Fares are server-calculated estimates that become locked when a ride is requested.</li>
            <li>No card is charged from this page; cash and NaijaPay wallet are the supported methods.</li>
            <li>Cancellation before the trip starts is free in this build because no cancellation fee policy is configured.</li>
            <li>Scheduled rides and driver applications are not available in this build.</li>
            <li>Ride dispatch is currently limited to Lagos, Nigeria.</li>
          </ul>
          <p className="mt-2 text-[11px] leading-5 text-[#8a938d]">
            This summary reflects the implemented behaviour. It is not a substitute for owner-approved
            legal terms.
          </p>
          <div className="mt-2">
            <ContactLine contact="legal" label="Legal correspondence" subject="NaijaDrive legal enquiry" className="text-[11.5px] leading-6 text-[#5d6d64]" />
          </div>
        </section>
      </main>
      <DriveFooter />
    </div>
  );
}
