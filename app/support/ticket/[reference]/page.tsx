import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { GUEST_ACCESS_COOKIE, SUPPORT_STATUS_LABELS, getCustomerTicket } from "@/lib/services/core/support.service";
import { TicketConversation } from "@/components/support/ticket-conversation";

export const metadata: Metadata = {
  title: "Support ticket — NaijaDeals",
  robots: { index: false, follow: false }
};

export const dynamic = "force-dynamic";

export default async function SupportTicketPage({ params }: { params: { reference: string } }) {
  const user = await getSessionUser();
  const guestToken = cookies().get(GUEST_ACCESS_COOKIE)?.value ?? null;
  let ticket;
  try {
    ticket = await getCustomerTicket(params.reference, { userId: user?.id ?? null, guestToken });
  } catch {
    notFound();
  }
  return (
    <div className="min-h-screen bg-[#f6f8f5] text-[#14241b]">
      <main className="mx-auto max-w-[860px] px-4 py-8 sm:px-6">
        <p className="text-[10.5px] font-black uppercase tracking-[0.16em] text-[#0b5c33]">Support ticket</p>
        <h1 className="mt-1 font-display text-[26px] font-extrabold">{ticket.subject}</h1>
        <p className="mt-1 text-[11.5px] text-[#5d6d64]">
          {ticket.reference} · {ticket.vertical} · {ticket.topic} · {SUPPORT_STATUS_LABELS[ticket.status]}
        </p>
        <div className="mt-5">
          <TicketConversation
            reference={ticket.reference}
            initialMessages={ticket.messages}
            canReply={ticket.status !== "CLOSED"}
          />
        </div>
      </main>
    </div>
  );
}
