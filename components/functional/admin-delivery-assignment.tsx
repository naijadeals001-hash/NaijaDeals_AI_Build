"use client";

import { useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import type { Row } from "./admin-workspace-tabs";

const ASSIGNABLE_DELIVERY_STATUSES = ["pending_assignment", "failed"];
const READY_ORDER_STATUSES = ["ready_for_pickup", "courier_assigned"];

function eligibleCourier(courier: Row): boolean {
  return courier.active === true && Boolean(courier.user?.verifiedAt);
}

/**
 * Courier assignment for one delivery row.
 *
 * Only active, approved courier accounts appear in the selector. The same
 * eligibility rule is enforced again by `assignCourier` on the server, so
 * bypassing the UI cannot assign an inactive or unverified courier.
 */
export function AdminDeliveryAssignment({
  delivery,
  couriers,
  canWrite,
  busy,
  onAssign
}: {
  delivery: Row;
  couriers: Row[];
  canWrite: boolean;
  busy: boolean;
  onAssign: (courierId: string) => void;
}) {
  const [courierId, setCourierId] = useState("");
  const status = String(delivery.status ?? "");
  const eligible = couriers.filter(eligibleCourier);

  if (!ASSIGNABLE_DELIVERY_STATUSES.includes(status)) {
    return (
      <span className="text-xs text-[#8B949E]">
        {delivery.courier?.name ? String(delivery.courier.name) : "No action needed"}
      </span>
    );
  }

  if (!canWrite) {
    return (
      <span className="flex items-center gap-1 text-xs text-[#8B949E]">
        <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
        Read only
      </span>
    );
  }

  if (eligible.length === 0) {
    return <span className="text-xs text-[#F59E0B]">No active approved couriers</span>;
  }

  const orderReady = READY_ORDER_STATUSES.includes(String(delivery.orderStatus ?? ""));
  const selectId = `assign-courier-${delivery.id}`;

  return (
    <div className="flex min-w-[190px] flex-col gap-1.5">
      <label htmlFor={selectId} className="sr-only">
        Assign courier for order {String(delivery.orderNumber ?? delivery.id)}
      </label>
      <select
        id={selectId}
        value={courierId}
        onChange={(event) => setCourierId(event.target.value)}
        disabled={busy || !orderReady}
        className="h-9 w-full rounded-lg border border-[#21262D] bg-[#0B0E14] px-2 text-xs font-bold text-[#F0F6FC] disabled:opacity-50"
      >
        <option value="">Select courier…</option>
        {eligible.map((courier) => (
          <option key={String(courier.id)} value={String(courier.id)}>
            {String(courier.name)} · {String(courier.vehicleType ?? "motorcycle")}
            {courier.serviceZone ? ` · ${String(courier.serviceZone)}` : ""}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={busy || !orderReady || courierId.length === 0}
        onClick={() => onAssign(courierId)}
        className="flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-[#00E676]/40 bg-[#00E676]/10 px-2.5 text-xs font-bold text-[#00E676] hover:bg-[#00E676]/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
        {busy ? "Assigning…" : "Assign courier"}
      </button>
      {!orderReady ? (
        <span className="text-[10px] leading-4 text-[#F59E0B]">Seller must mark the order ready for pickup first.</span>
      ) : null}
    </div>
  );
}
