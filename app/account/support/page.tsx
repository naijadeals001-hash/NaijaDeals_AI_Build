import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { SUPPORT_STATUS_LABELS, listCustomerTickets } from "@/lib/services/core/support.service";

export const metadata: Metadata = { title: "Support — NaijaDeals", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AccountSupportPage({ searchParams }: { searchParams: { page?: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account/support");
  const page = Math.max(Number(searchParams.page ?? 1) || 1, 1);
  const list = await listCustomerTickets(user.id, page, 10);

  return (
    <main className="mx-auto max-w-[900px] px-4 py-8 text-[#14241b] sm:px-6">
      <p className="text-[10.5px] font-black uppercase tracking-[0.16em] text-[#0b5c33]">Account</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-[28px] font-extrabold">Support</h1>
        <Link href="/contact" className="inline-flex min-h-9 items-center rounded-full bg-[#0b5c33] px-4 text-[11.5px] font-extrabold text-white">
          New enquiry
        </Link>
      </div>
      <p className="mt-1 text-[12px] text-[#5d6d64]">Your tickets, newest activity first. Internal staff notes are never shown here.</p>

      {list.tickets.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[#cfe0ca] bg-white p-8 text-center">
          <p className="font-display text-lg font-extrabold">No support tickets yet</p>
          <p className="mx-auto mt-1 max-w-md text-[12px] leading-6 text-[#5d6d64]">When you send an enquiry it appears here with its reference and every reply.</p>
          <Link href="/contact" className="mt-3 inline-flex rounded-full bg-[#0b5c33] px-4 py-2 text-[11.5px] font-extrabold text-white">Contact support</Link>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {list.tickets.map((ticket) => (
            <li key={ticket.id}>
              <Link href={`/support/ticket/${ticket.reference}`} className="block rounded-2xl bg-white p-4 ring-1 ring-[#e4ebe2] hover:ring-[#0b5c33]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] font-extrabold">{ticket.subject}</p>
                  <span className="rounded-full bg-[#eef5ea] px-2.5 py-0.5 text-[10.5px] font-bold text-[#0b5c33]">{SUPPORT_STATUS_LABELS[ticket.status]}</span>
                </div>
                <p className="mt-1 text-[11px] text-[#5d6d64]">
                  {ticket.reference} · {ticket.vertical} · {ticket.messageCount} message{ticket.messageCount === 1 ? "" : "s"} · updated {new Date(ticket.lastActivityAt).toLocaleString()}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {list.total > list.pageSize ? (
        <nav aria-label="Support pagination" className="mt-4 flex items-center gap-3 text-[11.5px] font-bold">
          {list.page > 1 ? <Link href={`/account/support?page=${list.page - 1}`} className="text-[#0b5c33] underline">Previous</Link> : null}
          <span className="text-[#6b7a70]">Page {list.page} of {Math.max(1, Math.ceil(list.total / list.pageSize))}</span>
          {list.page * list.pageSize < list.total ? <Link href={`/account/support?page=${list.page + 1}`} className="text-[#0b5c33] underline">Next</Link> : null}
        </nav>
      ) : null}
    </main>
  );
}
