"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2, Truck } from "lucide-react";
import { ApiRequestError, apiClient, statusLabel } from "@/lib/api-client";

type CourierDelivery = {
  id: string;
  status: string;
  pickupAddress: string;
  dropoffAddress: string;
  order: {
    orderNumber: string;
    contactName: string;
    contactPhone: string;
    vendor: { name: string; pickupAddress: string; pickupPhone: string };
    items: Array<{ productName: string; quantity: number }>;
  };
  trackingEvents: Array<{ id: string; label: string; description: string; createdAt: string }>;
};

const nextStatuses: Record<string, Array<{ value: string; label: string }>> = {
  assigned: [
    { value: "pickup_started", label: "Heading to pickup" },
    { value: "failed", label: "Report failure" }
  ],
  pickup_started: [
    { value: "picked_up", label: "Mark picked up" },
    { value: "failed", label: "Report failure" }
  ],
  picked_up: [{ value: "in_transit", label: "Start transit" }],
  in_transit: [
    { value: "delivery_attempted", label: "Attempt delivery" },
    { value: "delivered", label: "Delivered" },
    { value: "failed", label: "Report failure" }
  ],
  delivery_attempted: [
    { value: "delivered", label: "Delivered" },
    { value: "failed", label: "Report failure" }
  ],
  failed: [{ value: "assigned", label: "Retry delivery" }]
};

export function CourierDashboard() {
  const [deliveries, setDeliveries] = useState<CourierDelivery[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "forbidden">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      setDeliveries((await apiClient.courierDeliveries()) as unknown as CourierDelivery[]);
      setStatus("ready");
    } catch (err) {
      if (err instanceof ApiRequestError && (err.status === 401 || err.status === 403)) setStatus("forbidden");
      else {
        setError(err instanceof Error ? err.message : "Unable to load deliveries.");
        setStatus("error");
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function update(delivery: CourierDelivery, next: string) {
    let proofCode: string | undefined;
    if (next === "delivered") {
      proofCode = window.prompt("Enter the delivery proof code shared by the customer:") ?? undefined;
      if (!proofCode) return;
    }
    setBusy(delivery.id);
    setError("");
    try {
      await apiClient.courierDeliveryStatus(delivery.id, next, undefined, proofCode);
      setNotice(`${delivery.order.orderNumber} updated to ${statusLabel(next)}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update delivery.");
    } finally {
      setBusy("");
    }
  }

  if (status === "loading") {
    return (
      <div className="grid min-h-64 place-items-center rounded-2xl border border-border-soft bg-canvas">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (status === "forbidden") {
    return (
      <div className="rounded-2xl border border-border-soft bg-canvas p-8 text-center">
        <Truck className="mx-auto mb-3 h-8 w-8 text-primary" />
        <h1 className="font-display text-2xl font-extrabold">Courier access required</h1>
        <Link href="/login?next=/courier" className="mt-4 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white">
          Sign in as courier
        </Link>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div role="alert" className="rounded-xl border border-crimson/30 bg-crimson-soft p-4 font-bold text-crimson">
        <AlertCircle className="mb-1 h-4 w-4" /> {error}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl font-extrabold">Courier deliveries</h1>
        <p className="text-sm text-muted">Pickup contact and address are shown only for deliveries assigned to you.</p>
      </header>
      {notice ? <div role="status" className="rounded-xl bg-primary-soft p-3 text-sm font-bold text-primary">{notice}</div> : null}
      {error ? (
        <div role="alert" className="rounded-xl border border-crimson/30 bg-crimson-soft p-3 text-sm font-bold text-crimson">
          {error}
        </div>
      ) : null}
      {deliveries.length === 0 ? <p className="text-sm text-muted">No deliveries assigned.</p> : null}
      <div className="space-y-3">
        {deliveries.map((delivery) => (
          <article key={delivery.id} className="rounded-2xl border border-border-soft bg-canvas p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <p className="font-bold">
                  {delivery.order.orderNumber} · {statusLabel(delivery.status)}
                </p>
                <p className="text-xs text-muted">
                  Pickup: {delivery.order.vendor.name} — {delivery.pickupAddress} · {delivery.order.vendor.pickupPhone}
                </p>
                <p className="text-xs text-muted">
                  Drop-off: {delivery.dropoffAddress} · {delivery.order.contactName} · {delivery.order.contactPhone}
                </p>
                <p className="text-xs text-muted">
                  {delivery.order.items.map((item) => `${item.quantity}× ${item.productName}`).join(", ")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(nextStatuses[delivery.status] ?? []).map((action) => (
                  <button
                    key={action.value}
                    disabled={busy === delivery.id}
                    onClick={() => void update(delivery, action.value)}
                    className={`min-h-10 rounded-lg px-3 text-sm font-bold ${action.value === "failed" ? "border border-crimson/40 text-crimson" : "bg-primary text-white"} disabled:opacity-60`}
                  >
                    {action.label}
                  </button>
                ))}
                <Link href={`/tracking/${delivery.id}`} className="min-h-10 rounded-lg border border-border-soft px-3 py-2 text-sm font-bold">
                  Timeline
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
