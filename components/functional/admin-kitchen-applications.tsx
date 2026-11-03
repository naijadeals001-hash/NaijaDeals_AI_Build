"use client";

import { useCallback, useEffect, useState } from "react";

interface Row {
  id: string;
  kitchenName: string;
  cuisine: string;
  market: string;
  address: string;
  phone: string;
  status: string;
  note: string | null;
  userName: string;
  userEmail: string;
  restaurantId: string | null;
  createdAt: string;
}

export function AdminKitchenApplications() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/restaurant-applications", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `Request failed with HTTP ${res.status}`);
      setRows(Array.isArray(body) ? body : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load kitchen applications.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function decide(id: string, decision: "approve" | "reject", name: string) {
    setBusy(id);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/admin/restaurant-applications/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision })
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `Decision failed with HTTP ${res.status}`);
      setNotice(`${name} ${decision === "approve" ? "approved" : "rejected"}.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the decision.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="rounded-2xl border border-[#30363D] bg-[#161B22] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-extrabold text-[#F0F6FC]">Kitchen applications</h2>
          <p className="text-xs text-[#8B949E]">NaijaEats partners. Approval creates exactly one kitchen; rejection keeps management locked.</p>
        </div>
        <button type="button" onClick={() => void load()} className="rounded-lg border border-[#30363D] px-3 py-1.5 text-xs font-bold text-[#F0F6FC]">Refresh</button>
      </div>
      {notice ? <p role="status" className="mt-2 rounded-lg bg-[#00E676]/10 p-2 text-xs font-bold text-[#00E676]">{notice}</p> : null}
      {error ? <p role="alert" className="mt-2 rounded-lg bg-crimson/10 p-2 text-xs font-bold text-crimson">{error}</p> : null}
      {rows.length === 0 ? <p className="mt-3 text-sm text-[#8B949E]">No kitchen applications yet.</p> : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-[#8B949E]">
              <tr>
                <th className="p-2">Kitchen</th>
                <th className="p-2">Applicant</th>
                <th className="p-2">Area</th>
                <th className="p-2">Status</th>
                <th className="p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[#30363D]">
                  <td className="p-2">
                    <p className="font-bold text-[#F0F6FC]">{row.kitchenName}</p>
                    <p className="text-xs text-[#8B949E]">{row.cuisine} · {row.address}</p>
                  </td>
                  <td className="p-2 text-[#F0F6FC]">{row.userName}<br /><span className="text-xs text-[#8B949E]">{row.userEmail}</span></td>
                  <td className="p-2 text-[#F0F6FC]">{row.market}</td>
                  <td className="p-2"><span className="rounded-full bg-[#30363D] px-2 py-1 text-[10px] font-bold uppercase text-[#F0F6FC]">{row.status}</span></td>
                  <td className="p-2">
                    {row.status !== "SUBMITTED" ? <span className="text-xs text-[#8B949E]">Reviewed</span> : (
                      <div className="flex gap-2">
                        <button type="button" disabled={busy === row.id} onClick={() => void decide(row.id, "approve", row.kitchenName)} className="rounded-lg border border-[#00E676]/40 bg-[#00E676]/10 px-2.5 py-1.5 text-xs font-bold text-[#00E676] disabled:opacity-50">Approve</button>
                        <button type="button" disabled={busy === row.id} onClick={() => { if (window.confirm(`Reject ${row.kitchenName}?`)) void decide(row.id, "reject", row.kitchenName); }} className="rounded-lg border border-crimson/40 bg-crimson/10 px-2.5 py-1.5 text-xs font-bold text-crimson disabled:opacity-50">Reject</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
