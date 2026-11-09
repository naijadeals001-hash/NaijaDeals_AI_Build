import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { providerForOwner } from "@/lib/services/send/providers";
import { listOpenShipmentsForProvider, SHIPMENT_STATUS_LABELS } from "@/lib/services/send/shipments";
import { SendEmpty, SendHeading, SendPage } from "@/components/send/send-page";
import { LegActions, QuoteForm, VehicleForm } from "@/components/send/provider-tools";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Transporter dashboard — NaijaSend" };

export default async function TransporterDashboardPage() {
  const session = await getSessionUser();
  if (!session) {
    return (
      <SendPage>
        <SendHeading eyebrow="Transporters" title="Transporter dashboard" />
        <SendEmpty title="Sign in to open your dashboard" body="Manage quotes, active jobs, your fleet and documents." cta={{ href: "/login?next=/naijasend/transporter/dashboard", label: "Sign in" }} />
      </SendPage>
    );
  }
  const provider = await providerForOwner(session.id);
  if (!provider) {
    return (
      <SendPage>
        <SendHeading eyebrow="Transporters" title="Transporter dashboard" />
        <SendEmpty title="No provider registered to this account" body="Register your transport business, or enrol your NaijaDrive profile." cta={{ href: "/naijasend/transporter/apply", label: "Register as a transporter" }} />
      </SendPage>
    );
  }
  const openShipments = await listOpenShipmentsForProvider(provider.id);
  const active = await prisma.logisticsShipment.findMany({
    where: { quotes: { some: { providerId: provider.id, status: "accepted" } } },
    orderBy: { updatedAt: "desc" },
    take: 30,
    include: { legs: { where: { providerId: provider.id }, orderBy: { sequence: "asc" } } }
  });
  const jobs = active.filter((shipment) => !["completed", "cancelled"].includes(shipment.status));

  return (
    <SendPage>
      <SendHeading
        eyebrow="Transporters"
        title={provider.name}
        description={`${provider.providerType} · ${provider.country}${provider.operatingCities.length ? ` · ${provider.operatingCities.join(", ")}` : ""}`}
        action={<span className={`rounded-full px-3 py-1 text-[11px] font-extrabold ${provider.status === "verified" ? "bg-[#e8f3e4] text-[#0b5c33]" : "bg-[#fff3e8] text-[#a3480f]"}`}>{provider.status === "verified" ? "Verified" : provider.status}</span>}
      />
      {provider.status !== "verified" ? (
        <p className="mb-3 rounded-xl bg-[#fff3e8] p-3 text-[11.5px] leading-5 text-[#a3480f]">Your application is with the NaijaDeals Control Center. You can add vehicles now; quoting opens once verified.</p>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        <section aria-labelledby="quote-queue" className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
          <h2 id="quote-queue" className="font-display text-[14px] font-extrabold">Shipments you can quote ({openShipments.length})</h2>
          {openShipments.length ? (
            <ul className="mt-2 space-y-2">
              {openShipments.map((shipment) => (
                <li key={shipment.id} data-shipment={shipment.reference} className="rounded-xl bg-[#f9fbf9] p-2">
                  <p className="text-[12px] font-extrabold">{shipment.reference}</p>
                  <p className="text-[11px] text-[#5d6d64]">{shipment.originLabel} → {shipment.destinationLabel} · {shipment.weightKg} kg · {shipment.cargoClass}{shipment.preferredMode ? ` · prefers ${shipment.preferredMode}` : ""}</p>
                  <p className="text-[10.5px] text-[#6b7a70]">{shipment.description}</p>
                  <QuoteForm shipmentId={shipment.id} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[11.5px] text-[#5d6d64]">No open shipments in your operating countries.</p>
          )}
        </section>

        <div className="space-y-3">
          <section aria-labelledby="active-jobs" className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
            <h2 id="active-jobs" className="font-display text-[14px] font-extrabold">Active jobs ({jobs.length})</h2>
            {jobs.length ? (
              <ul className="mt-2 space-y-2">
                {jobs.map((shipment) => (
                  <li key={shipment.id} className="rounded-xl bg-[#f9fbf9] p-2">
                    <div className="flex flex-wrap justify-between gap-1">
                      <p className="text-[12px] font-extrabold">{shipment.reference}</p>
                      <span className="text-[10px] font-extrabold text-[#0b5c33]">{SHIPMENT_STATUS_LABELS[shipment.status] ?? shipment.status}</span>
                    </div>
                    <p className="text-[11px] text-[#5d6d64]">{shipment.originLabel} → {shipment.destinationLabel} · recipient {shipment.recipientName} {shipment.recipientPhone}</p>
                    <ul className="mt-1 space-y-1">
                      {shipment.legs.map((leg) => (
                        <li key={leg.id} className="rounded-lg bg-white p-1.5 text-[10.5px] ring-1 ring-[#eef1ef]">
                          <span className="font-bold capitalize">Leg {leg.sequence}: {leg.mode}</span> · {leg.status.replace(/_/g, " ")}
                          {leg.pickupPin ? <span className="block text-[10px] text-[#6b7a70]">The customer holds a pickup PIN; enter it to confirm collection.</span> : null}
                          <LegActions shipmentId={shipment.id} legId={leg.id} status={leg.status} needsPin={Boolean(leg.pickupPin) && ["assigned", "pending"].includes(leg.status)} />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[11.5px] text-[#5d6d64]">No active jobs. Jobs appear here when a customer books your quote.</p>
            )}
          </section>

          <section aria-labelledby="fleet" className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
            <h2 id="fleet" className="font-display text-[14px] font-extrabold">Fleet ({provider.vehicles.length})</h2>
            <ul className="mt-1.5 divide-y divide-[#f0f3f1] text-[11.5px]">
              {provider.vehicles.map((vehicle) => (
                <li key={vehicle.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="font-semibold capitalize">{vehicle.vehicleType.replace(/_/g, " ")}{vehicle.plate ? ` · ${vehicle.plate}` : ""}</span>
                  <span className="text-[#6b7a70]">{vehicle.capacityKg.toLocaleString()} kg{vehicle.driverProfileId ? " · NaijaDrive" : ""}</span>
                </li>
              ))}
              {!provider.vehicles.length ? <li className="py-1.5 text-[#5d6d64]">No vehicles registered yet.</li> : null}
            </ul>
            <VehicleForm providerId={provider.id} />
          </section>

          <section aria-labelledby="provider-earnings" className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
            <h2 id="provider-earnings" className="font-display text-[14px] font-extrabold">Your quotes ({provider.quotes.length})</h2>
            <ul className="mt-1 divide-y divide-[#f0f3f1] text-[11px]">
              {provider.quotes.map((quote) => (
                <li key={quote.id} className="flex flex-wrap justify-between gap-1 py-1.5">
                  <span>{quote.shipment.reference} · {quote.shipment.originLabel} → {quote.shipment.destinationLabel}</span>
                  <span className="font-extrabold text-[#0b5c33]">₦{(Number(quote.amountKobo) / 100).toLocaleString("en-NG")} · {quote.status}</span>
                </li>
              ))}
              {!provider.quotes.length ? <li className="py-1.5 text-[#5d6d64]">No quotes submitted yet.</li> : null}
            </ul>
            <p className="mt-2 text-[10px] text-[#6b7a70]">Earnings are credited to your NaijaDeals wallet when the customer confirms delivery. <Link href="/wallet" className="font-semibold text-[#0b5c33] underline">Open wallet</Link></p>
          </section>
        </div>
      </div>
    </SendPage>
  );
}
