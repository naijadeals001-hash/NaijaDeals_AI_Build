import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, FileText, LayoutDashboard, Truck, UserCheck, Wallet } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { SendHeading, SendPage } from "@/components/send/send-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Become a transporter — NaijaSend",
  description: "Register your truck, van, car, motorcycle, air cargo, sea freight, rail or warehousing service and earn on NaijaSend.",
  alternates: { canonical: "/naijasend/transporter" }
};

const STEPS: Array<[string, string, typeof FileText]> = [
  ["Register your business", "Tell us what you operate, where you operate and your contact details.", FileText],
  ["Add your vehicles", "List each vehicle or transport asset with its capacity so you are only offered cargo you can carry.", Truck],
  ["Get verified", "The NaijaDeals Control Center checks licence and insurance details. Only verified providers can quote.", UserCheck],
  ["Quote and earn", "Receive shipment requests in your dashboard, send your own price, and get paid when the customer confirms delivery.", Wallet]
];

export default async function TransporterHubPage() {
  const session = await getSessionUser();
  const provider = session ? await prisma.logisticsProvider.findFirst({ where: { ownerId: session.id }, select: { name: true, status: true } }) : null;

  return (
    <SendPage>
      <SendHeading
        eyebrow="Become a Transporter"
        title="Earn with your own transport business"
        description="NaijaSend connects shipping demand with independent providers. You keep operating your own vehicle, aircraft, vessel, rail wagon or warehouse — NaijaSend brings the customers, quotes and payment."
        action={
          provider ? (
            <Link href="/naijasend/transporter/dashboard" className="rounded-full bg-[#0b5c33] px-4 py-1.5 text-[11.5px] font-extrabold text-white">Open {provider.name}</Link>
          ) : (
            <Link href="/naijasend/transporter/apply" className="rounded-full bg-[#f26b21] px-4 py-1.5 text-[11.5px] font-extrabold text-white">Register now</Link>
          )
        }
      />

      {provider ? (
        <p className="mb-3 flex items-center gap-1.5 rounded-xl bg-[#f2f9f0] p-3 text-[11.5px]">
          <BadgeCheck className="h-4 w-4 text-[#0b8f47]" aria-hidden />
          Your provider <b>{provider.name}</b> is <b className="capitalize">{provider.status}</b>.
          {provider.status !== "verified" ? " You can add vehicles now; quoting opens once the Control Center verifies your details." : null}
          <Link href="/naijasend/transporter/dashboard" className="ml-1 font-semibold text-[#0b5c33] underline">Go to dashboard</Link>
        </p>
      ) : null}

      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(([title, body, Icon], index) => (
          <li key={title} className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
            <div className="flex items-center gap-1.5">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-[#0b5c33] text-[11px] font-black text-white">{index + 1}</span>
              <Icon className="h-4 w-4 text-[#0b5c33]" aria-hidden />
            </div>
            <p className="mt-1.5 text-[12.5px] font-extrabold">{title}</p>
            <p className="mt-0.5 text-[11px] leading-5 text-[#5d6d64]">{body}</p>
          </li>
        ))}
      </ol>

      <section aria-labelledby="what-you-can-operate" className="mt-4 rounded-2xl bg-[#f2f9f0] p-4">
        <h2 id="what-you-can-operate" className="font-display text-[15px] font-extrabold">What you can register</h2>
        <ul className="mt-2 grid gap-1.5 text-[11.5px] sm:grid-cols-2 lg:grid-cols-3">
          {["Motorcycle courier", "Car delivery", "Van owner", "Truck owner", "Fleet operator", "Air cargo service", "Sea freight service", "Rail logistics operator", "Warehouse provider", "Freight forwarder", "Logistics company"].map((item) => (
            <li key={item} className="flex items-center gap-1.5"><BadgeCheck className="h-3.5 w-3.5 text-[#0b8f47]" aria-hidden /> {item}</li>
          ))}
        </ul>
        <p className="mt-3 text-[10.5px] leading-4 text-[#6b7a70]">
          Air, sea, rail and customs operations are regulated. You must hold the licences your mode requires; NaijaSend verifies details but does not
          licence you, and NaijaSend itself is not an airline, shipping line, rail operator or customs broker.
        </p>
      </section>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/naijasend/transporter/apply" className="rounded-full bg-[#f26b21] px-5 py-2 text-[12px] font-extrabold text-white">Register as a Transporter →</Link>
        <Link href="/naijasend/transporter/dashboard" className="rounded-full px-5 py-2 text-[12px] font-extrabold text-[#0b5c33] ring-1 ring-[#cfe3ca]">Transporter dashboard</Link>
        <Link href="/naijasend/how-it-works" className="rounded-full px-5 py-2 text-[12px] font-extrabold text-[#0b5c33] ring-1 ring-[#cfe3ca]">How NaijaSend works</Link>
      </div>
    </SendPage>
  );
}
