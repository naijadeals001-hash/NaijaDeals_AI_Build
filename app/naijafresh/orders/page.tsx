import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { FRESH_LABELS, listCustomerOrders } from "@/lib/services/fresh/orders";
import { FreshHeading, FreshPage } from "@/components/fresh/fresh-page";
import { CancelOrder } from "@/components/fresh/cancel-order";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your orders — NaijaFresh" };

const STAGES = ["placed", "accepted", "packing", "ready_for_pickup", "courier_assigned", "picked_up", "delivered", "completed"];

export default async function FreshOrdersPage() {
  const session = await getSessionUser();
  if (!session) {
    return (
      <FreshPage>
        <FreshHeading eyebrow="Orders" title="Your orders" />
        <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-[#eef1ef]">
          <p className="font-display text-[16px] font-extrabold">Sign in to track your orders</p>
          <Link href="/login?next=/naijafresh/orders" className="mt-4 inline-flex rounded-full bg-[#0b5c33] px-5 py-2 text-[12px] font-extrabold text-white">Sign in</Link>
        </div>
      </FreshPage>
    );
  }
  const orders = await listCustomerOrders(session.id);
  return (
    <FreshPage>
      <FreshHeading eyebrow="Orders" title="Your orders" description="Track every farm order from packing through NaijaDrive or NaijaSend delivery." />
      {orders.length ? (
        <ul className="space-y-3">
          {orders.map((order) => {
            const stageIndex = STAGES.indexOf(order.status);
            return (
              <li key={order.id} className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
                <div className="flex flex-wrap items-baseline justify-between gap-1">
                  <p className="font-display text-[13.5px] font-extrabold">
                    {order.orderNumber} · <Link href={`/naijafresh/farmers/${order.farm.slug}`} className="hover:underline">{order.farm.name}</Link>
                  </p>
                  <p className={`rounded-full px-2 py-0.5 text-[10.5px] font-extrabold ${order.status === "cancelled" ? "bg-[#fdf1e9] text-[#a3480f]" : "bg-[#e8f3e4] text-[#0b5c33]"}`}>
                    {FRESH_LABELS[order.status] ?? order.status}
                  </p>
                </div>
                <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[#5d6d64]">
                  {order.items.map((item) => <li key={item.id}>{item.quantity} {item.unit} {item.name}</li>)}
                </ul>
                <p className="mt-1 text-[11.5px] font-semibold">₦{(Number(order.totalKobo) / 100).toLocaleString("en-NG")} · paid from NaijaPay</p>
                {order.status !== "cancelled" ? (
                  <ol className="mt-2 flex flex-wrap gap-1" aria-label="Order progress">
                    {STAGES.map((stage, index) => (
                      <li key={stage} className={`rounded-full px-2 py-0.5 text-[9.5px] font-semibold ${index <= stageIndex ? "bg-[#0b5c33] text-white" : "bg-[#f0f3f1] text-[#7b867f]"}`}>
                        {FRESH_LABELS[stage]}
                      </li>
                    ))}
                  </ol>
                ) : null}
                {order.status === "picked_up" && order.dispatch?.deliveryPin ? (
                  <p className="mt-2 rounded-lg bg-[#f2f9f0] p-2 text-[11.5px]">
                    Give this delivery PIN to your rider: <b className="font-display text-[14px] tracking-widest text-[#0b5c33]">{order.dispatch.deliveryPin}</b>
                  </p>
                ) : null}
                {order.status === "placed" ? <CancelOrder orderId={order.id} /> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-[#eef1ef]">
          <p className="font-display text-[16px] font-extrabold">No orders yet</p>
          <p className="mt-1 text-[12px] text-[#5d6d64]">Your first farm order will appear here with its delivery progress.</p>
          <Link href="/naijafresh/shop" className="mt-4 inline-flex rounded-full bg-[#0b5c33] px-5 py-2 text-[12px] font-extrabold text-white">Shop fresh produce</Link>
        </div>
      )}
    </FreshPage>
  );
}
