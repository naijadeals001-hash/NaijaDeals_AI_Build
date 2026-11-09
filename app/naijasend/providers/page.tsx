import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { SendEmpty, SendHeading, SendPage } from "@/components/send/send-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Find a provider — NaijaSend", alternates: { canonical: "/naijasend/providers" } };

const TYPE_LABELS: Record<string, string> = {
  courier: "Motorcycle courier",
  car: "Car transport",
  van: "Van transport",
  truck: "Trucking",
  fleet: "Fleet operator",
  air: "Air cargo",
  sea: "Sea freight",
  rail: "Rail logistics",
  warehouse: "Warehousing",
  forwarder: "Freight forwarder",
  logistics: "Logistics company"
};

export default async function ProvidersPage() {
  const providers = await prisma.logisticsProvider.findMany({
    where: { status: "verified" },
    orderBy: { name: "asc" },
    take: 100,
    select: { id: true, name: true, providerType: true, country: true, operatingCities: true, capacityKg: true, sourcePlatform: true, _count: { select: { vehicles: true } } }
  });
  return (
    <SendPage>
      <SendHeading eyebrow="Find a Provider" title="Verified transporters" description="Independent logistics providers verified by NaijaSend. NaijaDrive drivers and vehicles may enrol here; airlines, shipping lines, rail operators and forwarders are independent businesses." />
      {providers.length ? (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {providers.map((provider) => (
            <li key={provider.id} data-provider={provider.id} className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
              <p className="flex items-center gap-1 text-[13px] font-extrabold">{provider.name} <ShieldCheck className="h-3.5 w-3.5 text-[#0b8f47]" aria-label="Verified" /></p>
              <p className="text-[10.5px] text-[#6b7a70]">{TYPE_LABELS[provider.providerType] ?? provider.providerType} · {provider.country}</p>
              <p className="mt-1 text-[10.5px] text-[#5d6d64]">{provider.operatingCities.length ? provider.operatingCities.join(", ") : "Operating area not published"}{provider.capacityKg ? ` · up to ${provider.capacityKg} kg` : ""}</p>
              <p className="mt-1 text-[10px] text-[#9aa59e]">{provider._count.vehicles} {provider._count.vehicles === 1 ? "vehicle" : "vehicles"}{provider.sourcePlatform === "naijadrive" ? " · enrolled via NaijaDrive" : ""}</p>
            </li>
          ))}
        </ul>
      ) : (
        <SendEmpty title="No verified providers yet" body="Providers appear here once the Control Center verifies their licence and insurance details." cta={{ href: "/naijasend/transporter/apply", label: "Register as a transporter" }} />
      )}
      <p className="mt-4 text-[11px] text-[#6b7a70]">Want a quote from these providers? <Link href="/naijasend/ship" className="font-semibold text-[#0b5c33] underline">Request a shipment</Link>.</p>
    </SendPage>
  );
}
