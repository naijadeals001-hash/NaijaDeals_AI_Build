import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPermission } from "@/lib/auth/guard";
import { getStaffTicket, listStaffAssignees, staffScope } from "@/lib/services/core/support.service";
import { StaffReplyBox, StaffTicketActions } from "@/components/support/staff-ticket-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Support ticket — Control Center" };

export default async function AdminSupportTicketPage({ params }: { params: { id: string } }) {
  const admin = await requireAdminPermission("support:read");
  const scope = staffScope(admin);
  let ticket;
  try {
    ticket = await getStaffTicket(scope, params.id);
  } catch {
    notFound();
  }
  const assignees = await listStaffAssignees(scope);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <header>
        <Link href="/admin/support" className="text-[11px] font-bold text-primary underline">← Support inbox</Link>
        <h1 className="mt-1 font-display text-2xl font-extrabold">{ticket.subject}</h1>
        <p className="text-[11.5px] text-muted">
          {ticket.reference} · {ticket.vertical} · {ticket.topic} · {ticket.status} · {ticket.priority}
          {ticket.countryCode ? ` · ${ticket.countryCode}` : ""}
        </p>
        <p className="text-[11.5px] text-muted">
          {ticket.user
            ? `${ticket.user.name} (${ticket.user.email})`
            : `Guest${ticket.guestName ? `: ${ticket.guestName}` : ""}${ticket.guestEmail ? ` · ${ticket.guestEmail}` : ""}`}
        </p>
      </header>

      <StaffTicketActions
        ticketId={ticket.id}
        status={ticket.status}
        priority={ticket.priority}
        assignedToId={ticket.assignedTo?.id ?? null}
        isGuest={!ticket.user}
        assignees={assignees}
      />

      <section aria-label="Conversation" className="space-y-2 rounded-2xl bg-canvas p-4 ring-1 ring-border-soft">
        <h2 className="text-[12.5px] font-extrabold">Conversation</h2>
        <ol className="space-y-2">
          {ticket.messages.map((message) => (
            <li
              key={message.id}
              className={`rounded-xl p-3 text-[12px] leading-6 ${
                message.isInternal
                  ? "border border-dashed border-[#d9b98a] bg-[#fdf3e4]"
                  : message.authorType === "STAFF"
                    ? "bg-[#eef5ea]"
                    : "bg-white ring-1 ring-border-soft"
              }`}
            >
              <p className="text-[10px] font-black uppercase tracking-[0.1em] text-muted">
                {message.isInternal
                  ? "Internal note"
                  : message.authorType === "STAFF"
                    ? `Support · ${message.author?.name ?? "staff"}`
                    : message.authorType === "CUSTOMER"
                      ? "Customer"
                      : "System"}{" "}
                · {new Date(message.createdAt).toLocaleString()}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words">{message.body}</p>
            </li>
          ))}
        </ol>
        <StaffReplyBox ticketId={ticket.id} />
      </section>

      <section className="rounded-2xl bg-canvas p-4 ring-1 ring-border-soft">
        <h2 className="text-[12.5px] font-extrabold">Activity</h2>
        <ol className="mt-2 space-y-1 text-[11px] text-muted">
          {ticket.events.map((event) => (
            <li key={event.id}>
              {new Date(event.createdAt).toLocaleString()} · {event.type}
              {event.fromValue || event.toValue ? ` (${event.fromValue ?? "—"} → ${event.toValue ?? "—"})` : ""}
              {event.actor?.name ? ` · ${event.actor.name}` : ""}
              {event.note ? ` · ${event.note}` : ""}
            </li>
          ))}
        </ol>
        {ticket.accessTokens.length > 0 ? (
          <div className="mt-3 border-t border-border-soft pt-2 text-[11px] text-muted">
            <p className="font-bold">Guest access links</p>
            <ul className="mt-1 space-y-0.5">
              {ticket.accessTokens.map((token) => (
                <li key={token.id}>
                  issued {new Date(token.createdAt).toLocaleString()} · expires {new Date(token.expiresAt).toLocaleString()} ·{" "}
                  {token.revokedAt
                    ? "revoked"
                    : token.lastUsedAt
                      ? `used ${new Date(token.lastUsedAt).toLocaleString()}`
                      : "not used"}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}
