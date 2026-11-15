import Link from "next/link";
import { requireAdminPermission } from "@/lib/auth/guard";
import { listStaffAssignees, listStaffTickets, staffScope, supportVerticalOptions } from "@/lib/services/core/support.service";
import { SUPPORT_TOPICS } from "@/lib/services/core/support.service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Support inbox — Control Center" };

const STATUSES = ["OPEN", "PENDING", "RESOLVED", "CLOSED"] as const;
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

export default async function AdminSupportPage({
  searchParams
}: {
  searchParams: { status?: string; vertical?: string; topic?: string; priority?: string; assignedTo?: string; q?: string; page?: string };
}) {
  const admin = await requireAdminPermission("support:read");
  const scope = staffScope(admin);
  const list = await listStaffTickets(scope, {
    status: searchParams.status || null,
    vertical: searchParams.vertical || null,
    topic: searchParams.topic || null,
    priority: searchParams.priority || null,
    assignedToId: searchParams.assignedTo || null,
    search: searchParams.q || null,
    page: Number(searchParams.page ?? 1) || 1,
    pageSize: 20
  });
  const assignees = await listStaffAssignees(scope);
  const query = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { ...searchParams, ...overrides };
    for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
    return `/admin/support?${params.toString()}`;
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold">Support inbox</h1>
          <p className="text-[12px] text-muted">{list.total} ticket{list.total === 1 ? "" : "s"}{scope.countryCode ? ` in ${scope.countryCode}` : ""}. Internal notes are excluded from customer views.</p>
        </div>
        <form method="get" className="flex flex-wrap items-end gap-2 text-[11px]">
          <label className="font-bold">Search<input name="q" defaultValue={searchParams.q ?? ""} placeholder="Reference, subject, email" className="mt-1 block w-48 rounded-lg border border-border-soft px-2 py-1.5" /></label>
          <label className="font-bold">Status<select name="status" defaultValue={searchParams.status ?? ""} className="mt-1 block rounded-lg border border-border-soft px-2 py-1.5"><option value="">All</option>{STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="font-bold">Priority<select name="priority" defaultValue={searchParams.priority ?? ""} className="mt-1 block rounded-lg border border-border-soft px-2 py-1.5"><option value="">All</option>{PRIORITIES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="font-bold">Service<select name="vertical" defaultValue={searchParams.vertical ?? ""} className="mt-1 block rounded-lg border border-border-soft px-2 py-1.5"><option value="">All</option>{supportVerticalOptions().map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
          <label className="font-bold">Topic<select name="topic" defaultValue={searchParams.topic ?? ""} className="mt-1 block rounded-lg border border-border-soft px-2 py-1.5"><option value="">All</option>{SUPPORT_TOPICS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="font-bold">Assignee<select name="assignedTo" defaultValue={searchParams.assignedTo ?? ""} className="mt-1 block rounded-lg border border-border-soft px-2 py-1.5"><option value="">Anyone</option>{assignees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
          <button type="submit" className="rounded-full bg-primary px-3 py-1.5 font-extrabold text-white">Filter</button>
        </form>
      </header>

      {list.tickets.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border-soft bg-canvas p-8 text-center text-[12px] text-muted">No tickets match these filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border-soft bg-canvas">
          <table className="w-full min-w-[760px] text-left text-[12px]">
            <thead className="bg-surface-low text-[10.5px] uppercase tracking-wide text-muted">
              <tr><th className="p-2.5">Reference</th><th className="p-2.5">Subject</th><th className="p-2.5">Customer</th><th className="p-2.5">Service</th><th className="p-2.5">Status</th><th className="p-2.5">Priority</th><th className="p-2.5">Assignee</th><th className="p-2.5">Activity</th></tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {list.tickets.map((ticket) => (
                <tr key={ticket.id} className="hover:bg-surface-low">
                  <td className="p-2.5 font-mono text-[11px]"><Link href={`/admin/support/${ticket.id}`} className="font-bold text-primary underline">{ticket.reference}</Link></td>
                  <td className="p-2.5"><Link href={`/admin/support/${ticket.id}`} className="font-semibold">{ticket.subject}</Link></td>
                  <td className="p-2.5 text-muted">{ticket.customer.name}<span className="block text-[10.5px]">{ticket.customer.email}</span></td>
                  <td className="p-2.5">{ticket.vertical}</td>
                  <td className="p-2.5">{ticket.status}</td>
                  <td className="p-2.5">{ticket.priority}</td>
                  <td className="p-2.5">{ticket.assignee?.name ?? "—"}</td>
                  <td className="p-2.5 text-muted">{new Date(ticket.lastActivityAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {list.total > list.pageSize ? (
        <nav aria-label="Support pagination" className="flex items-center gap-3 text-[11.5px] font-bold">
          {list.page > 1 ? <Link href={query({ page: String(list.page - 1) })} className="text-primary underline">Previous</Link> : null}
          <span className="text-muted">Page {list.page} of {Math.max(1, Math.ceil(list.total / list.pageSize))}</span>
          {list.page * list.pageSize < list.total ? <Link href={query({ page: String(list.page + 1) })} className="text-primary underline">Next</Link> : null}
        </nav>
      ) : null}
    </div>
  );
}
