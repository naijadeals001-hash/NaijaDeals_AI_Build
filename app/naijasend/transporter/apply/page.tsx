import type { Metadata } from "next";
import Link from "next/link";
import { SendHeading, SendPage } from "@/components/send/send-page";
import { TransporterApplyForm } from "@/components/send/transporter-apply-form";
import { contactAddress, mailtoFor } from "@/lib/data/contact-directory";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Become a transporter — NaijaSend", alternates: { canonical: "/naijasend/transporter/apply" } };

export default function TransporterApplyPage() {
  return (
    <SendPage>
      <SendHeading eyebrow="Become a Transporter" title="Register your transport business" description="Join NaijaSend as an independent provider. Applications are reviewed by the NaijaDeals Control Center before you can quote." action={<Link href="/naijasend/transporter/dashboard" className="rounded-full px-4 py-1.5 text-[11.5px] font-extrabold text-[#0b5c33] ring-1 ring-[#cfe3ca]">Transporter dashboard</Link>} />
      <TransporterApplyForm />
      <section aria-label="Transporter contacts" className="mt-4 rounded-2xl bg-white p-4 text-[12px] leading-6 text-[#5d6d64] ring-1 ring-[#eef1ef]">
        <p>
          Courier and driver enquiries:{" "}
          <a href={mailtoFor("drivers")} className="font-semibold text-[#0b5c33] underline underline-offset-2">
            {contactAddress("drivers")}
          </a>
        </p>
      </section>
    </SendPage>
  );
}
