"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Clock, Loader2, Shield, TrendingUp } from "lucide-react";
import { koboToNaira } from "@/lib/api-client";

const serviceModesDisplay: Record<string, string> = { LOCAL: "Local", REMOTE: "Remote", PROJECT: "Project" };
const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Profile = {
  id: string;
  status: string;
  displayName: string;
  verificationReason?: string | null;
  createdAt: string;
  published?: boolean;
  listings?: Array<{
    id: string;
    title: string;
    summary?: string | null;
    slug?: string;
    mode: string;
    pricingType?: string;
    startingPriceKobo?: string | null;
    status: string;
    images?: Array<{ url: string }>;
  }>;
  availability?: Array<{ weekday: number; startMinute: number; endMinute: number }>;
};

type Overview = {
  metrics: {
    completedBookings: number;
    grossKobo: string;
    commissionKobo: string;
    netKobo: string;
    averageRating: number | null;
    pendingProposals: number;
  };
  proposals?: Array<{ id: string; status: string; amountKobo: string; job: { title: string; city?: string; status: string } }>;
  bookings?: Array<{
    id: string;
    reference?: string;
    status: string;
    paymentStatus: string;
    amountKobo: string;
    customer: { name: string };
    listing: { title: string };
  }>;
};

/**
 * Professional workspace over the real /api/gigs/pro endpoints: verification
 * state, listings, earnings (NaijaPay ledger), proposals, bookings and
 * availability. Pending/rejected professionals see their honest status and
 * cannot publish — enforced server-side, reflected here.
 */
function ProfessionalDashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "signed-out" | "no-profile">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savingAvailability, setSavingAvailability] = useState(false);

  const load = useCallback(() => {
    setStatus("loading");
    fetch("/api/gigs/pro", { credentials: "include" })
      .then((res) =>
        res.ok
          ? res.json()
          : res.json().then((body) => Promise.reject(Object.assign(new Error(body.error ?? "Failed to load dashboard."), { status: res.status })))
      )
      .then((body) => {
        if (!body.profile) {
          setStatus("no-profile");
          return;
        }
        setProfile(body.profile);
        setOverview(body.overview);
        setStatus("ready");
      })
      .catch((err) => {
        if (err.status === 401) setStatus("signed-out");
        else {
          setError(err instanceof Error ? err.message : "Failed to load dashboard.");
          setStatus("error");
        }
      });
  }, []);

  useEffect(load, [load]);

  async function saveAvailability(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingAvailability(true);
    setNotice("");
    const data = new FormData(event.currentTarget);
    const slots: Array<{ weekday: number; startMinute: number; endMinute: number }> = [];
    const toMinutes = (value: string) => {
      if (!/^\d{1,2}:\d{2}$/.test(value)) return null;
      const [hours, minutes] = value.split(":").map(Number);
      if (hours > 23 || minutes > 59) return null;
      return hours * 60 + minutes;
    };
    for (let day = 0; day < 7; day += 1) {
      const startMinute = toMinutes(String(data.get(`start-${day}`) ?? ""));
      const endMinute = toMinutes(String(data.get(`end-${day}`) ?? ""));
      if (startMinute !== null && endMinute !== null && endMinute > startMinute) {
        slots.push({ weekday: day, startMinute, endMinute });
      }
    }
    if (slots.length === 0) {
      setNotice("Add at least one valid time range (e.g. 09:00 to 17:00).");
      setSavingAvailability(false);
      return;
    }
    try {
      const res = await fetch("/api/gigs/pro", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ slots })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Failed (HTTP ${res.status}).`);
      setNotice("Availability saved.");
      load();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not save availability.");
    } finally {
      setSavingAvailability(false);
    }
  }

  if (status === "signed-out") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F7F6]">
        <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          <Shield className="mx-auto mb-3 h-10 w-10 text-[#0F7A4A]" aria-hidden="true" />
          <h2 className="font-display text-xl font-extrabold text-[#0B1F16]">Sign in to your professional workspace</h2>
          <Link
            href="/login?next=/naijagigs/pro/dashboard"
            className="mt-5 inline-block rounded-xl bg-[#0F7A4A] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#0B6540]"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (status === "no-profile") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F7F6]">
        <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          <h2 className="font-display text-xl font-extrabold text-[#0B1F16]">No professional profile yet</h2>
          <p className="mt-2 text-sm text-[#6B7A72]">Apply to offer your services on NaijaGigs — it takes a few minutes.</p>
          <Link
            href="/naijagigs/pro/apply"
            className="mt-5 inline-block rounded-xl bg-[#0F7A4A] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#0B6540]"
          >
            Apply as professional
          </Link>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F7F6]">
        <div className="max-w-md rounded-2xl border border-[#FECACA] bg-white p-8 text-center shadow-xl">
          <AlertCircle className="mx-auto mb-3 h-10 w-10 text-[#B91C1C]" aria-hidden="true" />
          <h2 className="font-display text-xl font-extrabold text-[#0B1F16]">Dashboard unavailable</h2>
          <p className="mt-2 text-sm text-[#6B7A72]">{error}</p>
          <button type="button" onClick={load} className="mt-5 rounded-xl bg-[#0F7A4A] px-6 py-3 text-sm font-bold text-white">
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F7F6]" aria-busy="true" aria-label="Loading professional dashboard">
        <Loader2 className="h-8 w-8 animate-spin text-[#0F7A4A]" aria-hidden="true" />
      </div>
    );
  }

  const verified = profile?.status === "VERIFIED";
  const listings = profile?.listings ?? [];
  const activeListings = listings.filter((listing) => listing.status === "ACTIVE").length;
  const metrics = overview?.metrics;

  return (
    <div className="min-h-screen bg-[#F5F7F6]">
      <nav className="sticky top-0 z-10 border-b border-[#E5DFD2] bg-white shadow-sm">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-4 py-3">
          <h1 className="font-display text-xl font-extrabold text-[#0B1F16]">NaijaGigs — Professional dashboard</h1>
          <div className="flex items-center gap-3">
            <span
              className={`rounded px-3 py-1 text-[11px] font-medium ${
                verified ? "bg-[#DDECE3] text-[#064E3B]" : "bg-[#FEF2F2] text-[#B91C1C]"
              }`}
            >
              {profile?.status}
            </span>
            <Link href="/naijagigs/pro/apply" className="text-xs font-medium text-[#0F7A4A] transition-colors hover:text-[#0B6540]">
              Update profile
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-10">
        {!verified && (
          <section className="mb-8 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-6 sm:p-8">
            <div className="flex items-start gap-3">
              <Clock className="mt-1 h-5 w-5 text-[#B91C1C]" aria-hidden="true" />
              <div>
                <h2 className="font-display text-lg font-extrabold text-[#0B1F16]">
                  {profile?.status === "PENDING" ? "Verification in review" : `Status: ${profile?.status}`}
                </h2>
                <p className="mt-1 text-sm text-[#6B7A72]">
                  {profile?.verificationReason ??
                    "Our team is reviewing your application. You can publish service listings and receive bookings once your status becomes VERIFIED."}
                </p>
                <p className="mt-2 text-xs text-[#6B7A72]">
                  Applied {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString("en-NG") : "—"}
                </p>
              </div>
            </div>
          </section>
        )}

        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Net earnings (released)", value: metrics ? koboToNaira(metrics.netKobo) : "—", icon: TrendingUp },
            { label: "Completed bookings", value: String(metrics?.completedBookings ?? 0), icon: CheckCircle2 },
            { label: "Active listings", value: String(activeListings), icon: Shield },
            { label: "Pending proposals", value: String(metrics?.pendingProposals ?? 0), icon: Clock }
          ].map((card) => (
            <div key={card.label} className="rounded-2xl bg-white p-5 shadow-xl">
              <card.icon className="h-5 w-5 text-[#0F7A4A]" aria-hidden="true" />
              <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-[#6B7A72]">{card.label}</p>
              <p className="mt-1 font-display text-2xl font-extrabold text-[#0B1F16]">{card.value}</p>
            </div>
          ))}
        </section>

        <section className="mb-8 rounded-2xl bg-white p-6 shadow-xl sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-extrabold text-[#0B1F16]">Service listings</h2>
            {verified && (
              <Link href="/naijagigs/services" className="text-xs font-bold text-[#0F7A4A] hover:underline">
                View public catalogue →
              </Link>
            )}
          </div>
          <p className="mt-1 text-xs text-[#6B7A72]">
            {verified ? "Your published services appear in customer search." : "Publishing unlocks when your profile is VERIFIED."}
          </p>

          {listings.length === 0 ? (
            <p className="mt-6 text-sm text-[#6B7A72]">
              No service listings yet{verified ? " — create your first listing to start receiving bookings." : "."}
            </p>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {listings.map((listing) => (
                <div key={listing.id} className="overflow-hidden rounded-xl bg-[#F5F7F6] shadow transition-shadow hover:shadow-lg">
                  {listing.images?.[0]?.url ? (
                    <img src={listing.images[0].url} alt={listing.title} className="h-40 w-full object-cover" />
                  ) : (
                    <div className="flex h-40 w-full items-center justify-center bg-[#E7E0D2] text-[11px] text-[#6B7A72]">No image</div>
                  )}
                  <div className="p-4">
                    <h3 className="line-clamp-2 font-semibold text-[#0B1F16]">{listing.title}</h3>
                    <p className="mt-1 line-clamp-2 text-[11px] text-[#6B7A72]">{listing.summary || "No description available"}</p>
                    <div className="mt-3 flex gap-2 text-[10px] text-[#6B7A72]">
                      <span>{serviceModesDisplay[listing.mode] ?? listing.mode}</span>
                      <span>·</span>
                      <span>{listing.status}</span>
                    </div>
                    <p className="mt-3 border-t border-[#E5DFD2] pt-3 text-sm font-medium text-[#0F7A4A]">
                      {listing.startingPriceKobo ? `From ${koboToNaira(listing.startingPriceKobo)}` : "Quote required"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mb-8 rounded-2xl bg-white p-6 shadow-xl sm:p-8">
          <h2 className="mb-1 font-display text-xl font-extrabold text-[#0B1F16]">Availability</h2>
          <p className="mb-4 text-xs text-[#6B7A72]">
            Set weekly hours (e.g. 09:00 to 17:00). Customers can request bookings inside these windows.
          </p>
          <form onSubmit={saveAvailability} className="grid gap-3 sm:grid-cols-4">
            {dayNames.map((day, index) => (
              <label key={day} className="rounded-xl border border-[#E5DFD2] bg-[#F5F7F6] p-3 text-[10px] font-medium text-[#6B7A72]">
                {day}
                <input
                  type="text"
                  name={`start-${index}`}
                  placeholder="09:00"
                  className="mt-1 w-full rounded-lg border border-[#E5DFD2] bg-white px-2 py-1.5 text-xs text-[#16241D] outline-none focus:border-[#0F7A4A]"
                />
                <span className="my-1 block">to</span>
                <input
                  type="text"
                  name={`end-${index}`}
                  placeholder="17:00"
                  className="w-full rounded-lg border border-[#E5DFD2] bg-white px-2 py-1.5 text-xs text-[#16241D] outline-none focus:border-[#0F7A4A]"
                />
              </label>
            ))}
            <div className="sm:col-span-4">
              <button
                type="submit"
                disabled={savingAvailability}
                className="rounded-xl bg-[#0F7A4A] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#0B6540] disabled:opacity-60"
              >
                {savingAvailability ? "Saving…" : "Save availability"}
              </button>
              {notice && (
                <p role="status" className="mt-2 text-xs font-bold text-[#064E3B]">
                  {notice}
                </p>
              )}
            </div>
          </form>

          {(profile?.availability ?? []).length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-xs text-[#6B7A72]">Current schedule:</p>
              <div className="flex flex-wrap gap-2">
                {(profile?.availability ?? []).map((slot, index) => (
                  <span key={index} className="rounded-lg bg-[#EDE6D8] px-3 py-2 text-[10px] font-medium text-[#16241D]">
                    {dayNames[slot.weekday]}: {String(Math.floor(slot.startMinute / 60)).padStart(2, "0")}:
                    {String(slot.startMinute % 60).padStart(2, "0")} – {String(Math.floor(slot.endMinute / 60)).padStart(2, "0")}:
                    {String(slot.endMinute % 60).padStart(2, "0")}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 font-display text-lg font-extrabold text-[#0B1F16]">Recent proposals</h2>
            {(overview?.proposals ?? []).length === 0 ? (
              <p className="text-sm text-[#6B7A72]">No proposals yet. Quote requests you respond to will appear here.</p>
            ) : (
              <ul className="divide-y divide-[#E5DFD2]">
                {(overview?.proposals ?? []).slice(0, 6).map((proposal) => (
                  <li key={proposal.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div>
                      <p className="font-semibold text-[#0B1F16]">{proposal.job.title}</p>
                      <p className="text-[11px] text-[#6B7A72]">
                        {proposal.status} · {proposal.job.city ?? "Remote"}
                      </p>
                    </div>
                    <p className="font-bold text-[#0B1F16]">{koboToNaira(proposal.amountKobo)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 font-display text-lg font-extrabold text-[#0B1F16]">Bookings</h2>
            {(overview?.bookings ?? []).length === 0 ? (
              <p className="text-sm text-[#6B7A72]">No bookings yet. They appear once customers book your services.</p>
            ) : (
              <ul className="divide-y divide-[#E5DFD2]">
                {(overview?.bookings ?? []).slice(0, 6).map((booking) => (
                  <li key={booking.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div>
                      <p className="font-semibold text-[#0B1F16]">{booking.listing.title}</p>
                      <p className="text-[11px] text-[#6B7A72]">
                        {booking.customer.name} · {booking.status} · payment {booking.paymentStatus}
                      </p>
                    </div>
                    <p className="font-bold text-[#0B1F16]">{koboToNaira(booking.amountKobo)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default ProfessionalDashboard;
