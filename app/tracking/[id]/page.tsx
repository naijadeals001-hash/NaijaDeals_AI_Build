import type { Metadata } from "next";
import { Bike, CheckCircle2, MapPin, QrCode, RadioTower } from "lucide-react";

export const metadata: Metadata = {
  title: "Real-time tracking",
  description: "NaijaDeals real-time order, ride, and delivery tracking UI."
};

const events = [
  "Mission created and NaijaPay escrow hold confirmed",
  "Courier assigned by AI dispatch from Yaba micro-hub",
  "Balogun pickup QR scanned and package verified",
  "Third Mainland Bridge route risk score updated for rain",
  "Customer delivery barcode pending at Lekki handoff"
];

export default function TrackingPage({ params }: { params: { id: string } }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section className="min-h-[560px] overflow-hidden rounded-2xl bg-night text-white shadow-soft">
        <div className="relative h-full p-6">
          <div className="absolute inset-0 opacity-30 market-grid" />
          <div className="relative z-10">
            <p className="text-xs font-bold uppercase tracking-wide text-primary-live">Tracking {params.id}</p>
            <h1 className="mt-3 font-display text-3xl font-extrabold sm:text-4xl">Live mission control</h1>
            <p className="mt-2 max-w-xl text-white/70">Unified tracking UI for rides, parcels, food, marketplace deliveries, stays, and gig milestones, with proof events that power escrow release.</p>
          </div>
          <div className="absolute left-10 right-10 top-64 h-1 rounded-full bg-white/20">
            <div className="h-full w-3/4 rounded-full bg-primary-live" />
          </div>
          <div className="absolute left-[12%] top-52 grid h-14 w-14 place-items-center rounded-full bg-primary-live text-white shadow-lift">
            <MapPin className="h-6 w-6" />
          </div>
          <div className="absolute left-[48%] top-60 grid h-16 w-16 place-items-center rounded-full bg-white text-primary shadow-soft">
            <Bike className="h-7 w-7" />
          </div>
          <div className="absolute right-[12%] top-52 grid h-14 w-14 place-items-center rounded-full bg-amber text-white shadow-lift">
            <QrCode className="h-6 w-6" />
          </div>
        </div>
      </section>
      <aside className="space-y-4">
        <div className="rounded-2xl border border-border-soft bg-canvas p-5">
          <RadioTower className="h-6 w-6 text-primary" />
          <h2 className="mt-3 font-display text-xl font-bold">Mission timeline</h2>
          <div className="mt-4 space-y-3">
            {events.map((event, index) => (
              <div key={event} className="flex gap-3">
                <CheckCircle2 className={`mt-0.5 h-5 w-5 ${index < 4 ? "text-primary" : "text-amber"}`} />
                <p className="text-sm text-muted">{event}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-border-soft bg-canvas p-5">
          <h2 className="font-display text-xl font-bold">QR verification</h2>
          <div className="mt-4 grid aspect-square place-items-center rounded-xl border border-dashed border-primary bg-primary-soft">
            <QrCode className="h-28 w-28 text-primary" />
          </div>
          <p className="mt-3 text-sm text-muted">Barcode and QR structure for pickup, delivery, return, property access, and gig milestone verification.</p>
        </div>
      </aside>
    </div>
  );
}
