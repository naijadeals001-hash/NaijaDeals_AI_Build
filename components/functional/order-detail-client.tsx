"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, MapPin, PackageCheck, Truck } from "lucide-react";
import { ApiRequestError, apiClient, koboToNaira, type ApiOrder } from "@/lib/api-client";

const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function OrderDetailClient({ id }: { id: string }) {
  const [order, setOrder] = useState<ApiOrder | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiClient.getOrder(id)
      .then((value) => { if (active) { setOrder(value); setStatus("ready"); } })
      .catch((caught) => {
        if (!active) return;
        setError(caught instanceof ApiRequestError ? caught.message : "Unable to load this order.");
        setStatus("error");
      });
    return () => { active = false; };
  }, [id]);

  if (status === "loading") return <div className="grid min-h-64 place-items-center rounded-2xl border border-border-soft bg-canvas"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (status === "error" || !order) {
    return (
      <div role="alert" className="rounded-2xl border border-crimson/30 bg-crimson-soft p-6 text-center">
        <p className="font-bold text-crimson">{error || "Order unavailable."}</p>
        <Link href="/orders" className="mt-3 inline-block text-sm font-bold text-primary underline">Back to orders</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link href="/orders" className="inline-flex items-center gap-2 text-sm font-bold text-[#007185] hover:underline">
        <ArrowLeft className="h-4 w-4" /> Your Orders
      </Link>
      <header className="rounded-2xl border border-border-soft bg-canvas p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-extrabold">Order {order.orderNumber}</h1>
            <p className="text-sm text-muted">Placed {new Date(order.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Order status</p>
            <p className="font-display text-lg font-extrabold text-primary">{label(order.status)}</p>
            <p className="text-xs font-semibold text-muted">Payment: {label(order.paymentStatus)}</p>
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-border-soft bg-canvas p-4">
        <h2 className="font-display text-lg font-extrabold">Items</h2>
        <div className="mt-3 divide-y divide-border-soft">
          {order.items.map((item) => (
            <article key={item.id} className="flex gap-3 py-3">
              {item.imageUrl ? <img src={item.imageUrl} alt={item.productName} className="h-20 w-20 rounded-lg object-contain" /> : null}
              <div className="min-w-0 flex-1">
                <Link href={`/product/${item.productId}`} className="font-bold hover:text-primary">{item.productName}</Link>
                {item.variantName ? <p className="text-xs text-muted">{item.variantName}</p> : null}
                <p className="text-xs text-muted">Qty {item.quantity}</p>
              </div>
              <p className="text-sm font-bold">{koboToNaira(item.totalKobo)}</p>
            </article>
          ))}
        </div>
        <dl className="mt-3 space-y-1 border-t border-border-soft pt-3 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{koboToNaira(order.subtotalKobo)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd>{koboToNaira(order.deliveryFeeKobo)}</dd></div>
          {order.escrowFeeKobo ? <div className="flex justify-between"><dt className="text-muted">Escrow fee</dt><dd>{koboToNaira(order.escrowFeeKobo)}</dd></div> : null}
          <div className="flex justify-between border-t border-border-soft pt-2 text-base font-extrabold"><dt>Total</dt><dd>{koboToNaira(order.totalKobo)}</dd></div>
        </dl>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-2xl border border-border-soft bg-canvas p-4">
          <h2 className="flex items-center gap-2 font-display text-lg font-extrabold"><MapPin className="h-4 w-4 text-primary" /> Delivery address</h2>
          <p className="mt-2 text-sm font-bold">{order.contactName}</p>
          <p className="text-sm text-muted">{order.deliveryAddress}</p>
          <p className="text-xs text-muted">{order.contactPhone}</p>
        </section>
        <section className="rounded-2xl border border-border-soft bg-canvas p-4">
          <h2 className="flex items-center gap-2 font-display text-lg font-extrabold"><PackageCheck className="h-4 w-4 text-primary" /> Timeline</h2>
          <ol className="mt-2 space-y-2 text-sm">
            {order.statusEvents?.length ? order.statusEvents.map((event) => (
              <li key={event.id} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span><span className="font-bold">{label(event.to)}</span><span className="block text-xs text-muted">{new Date(event.createdAt).toLocaleString("en-NG")}</span></span>
              </li>
            )) : <li className="text-muted">Status updates will appear here.</li>}
            {order.deliveries?.map((delivery) => (
              <li key={delivery.id} className="flex gap-2">
                <Truck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span><span className="font-bold">{label(delivery.status)}</span><span className="block text-xs text-muted">{delivery.provider}{delivery.trackingNumber ? " · " + delivery.trackingNumber : ""}</span></span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {order.returnRequests?.length ? (
        <section className="rounded-2xl border border-border-soft bg-canvas p-4">
          <h2 className="font-display text-lg font-extrabold">Returns</h2>
          {order.returnRequests.map((request) => <p key={request.id} className="mt-1 text-sm">{label(request.status)} — {request.reason ?? "Return request"}</p>)}
        </section>
      ) : null}
    </div>
  );
}
