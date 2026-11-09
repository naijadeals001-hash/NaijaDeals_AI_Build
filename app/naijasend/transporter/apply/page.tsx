import type { Metadata } from "next";
import Link from "next/link";
import { SendHeading, SendPage } from "@/components/send/send-page";
import { TransporterApplyForm } from "@/components/send/transporter-apply-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Become a transporter — NaijaSend", alternates: { canonical: "/naijasend/transporter/apply" } };

export default function TransporterApplyPage() {
  return (
    <SendPage>
      <SendHeading eyebrow="Become a Transporter" title="Register your transport business" description="Join NaijaSend as an independent provider. Applications are reviewed by the NaijaDeals Control Center before you can quote." action={<Link href="/naijasend/transporter/dashboard" className="rounded-full px-4 py-1.5 text-[11.5px] font-extrabold text-[#0b5c33] ring-1 ring-[#cfe3ca]">Transporter dashboard</Link>} />
      <TransporterApplyForm />
    </SendPage>
  );
}
