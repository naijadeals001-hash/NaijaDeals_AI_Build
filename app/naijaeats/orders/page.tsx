import type { Metadata } from "next";
import Link from "next/link";
import { EatsHeader } from "@/components/eats/eats-header";
import { EatsFooter } from "@/components/eats/eats-footer";
import { EatsBottomNav } from "@/components/eats/eats-bottom-nav";
import { listCuisineRail, listStorefrontRestaurants } from "@/lib/services/eats/storefront";
import { getSessionUser } from "@/lib/auth/session";
import { listFoodOrdersForCustomer } from "@/lib/services/core/eats-order.service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your food orders — NaijaEats" };

const STEPS = ["placed", "kitchen_accepted", "preparing", "ready_for_pickup", "courier_assigned", "picked_up", "delivered"];

function progressLabel(status: string) {
  return status.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

/**
 * Customer order tracking. Status comes straight from the order record, so the
 * tracker shows the kitchen's real progress — never a simulated animation.
 */
export default async function EatsOrdersPage() {
  const [user, all] = await Promise.all([getSessionUser(), listStorefrontRestaurants()]);
  const cuisines = await listCuisineRail(all);
  const orders = user ? await listFoodOrdersForCustomer(user.id) : [];

  return (
    <div className="min-h-screen bg-white pb-20 lg:pb-0">
      <EatsHeader destination="Lagos, Nigeria" cartCount={0} cuisines={cuisines} />
      <main className="mx-auto max-w-[900px] px-3 py-5 sm:px-8">
        <h1 className="font-display text-[22px] font-extrabold text-[#14241b]">Your food orders</h1>
        {!user ? (
          <p className="mt-3 rounded-xl bg-[#f7f9f8] p-4 text-[12.5px] text-[#4a5a50]">
            <Link href="/login?next=/naijaeats/orders" className="font-bold text-[#0b5c33] underline">Sign in</Link> to see your food orders and track deliveries.
          </p>
        ) : orders.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-[#d9e2dc] p-6 text-center text-[12.5px] text-[#6b7a70]">
            No food orders yet. <Link href="/naijaeats/restaurants" className="font-bold text-[#0b5c33] underline">Browse restaurants</Link>
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {orders.map((order) => {
              const stepIndex = Math.max(0, STEPS.indexOf(String(order.status)));
              return (
                <li key={order.id} className="rounded-xl p-4 ring-1 ring-[#eef1ef]">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[13px] font-extrabold text-[#14241b]">
                      {order.orderNumber} · {order.restaurantName ?? "Kitchen"}
                    </p>
                    <span className="rounded-full bg-[#e7f6ec] px-2.5 py-0.5 text-[10.5px] font-bold text-[#0b5c33]">
                      {progressLabel(String(order.status))}
                    </span>
                  </div>
                  <p className="mt-1 text-[11.5px] text-[#6b7a70]">
                    ₦{(Number(order.totalKobo) / 100).toLocaleString("en-NG")} · payment {String(order.paymentStatus)}
                  </p>
                  <ol className="mt-3 flex gap-1" aria-label="Order progress">
                    {STEPS.map((step, index) => (
                      <li
                        key={step}
                        aria-current={index === stepIndex ? "step" : undefined}
                        className={`h-1.5 flex-1 rounded-full ${index <= stepIndex ? "bg-[#0b8f47]" : "bg-[#e3e9e5]"}`}
                        title={progressLabel(step)}
                      />
                    ))}
                  </ol>
                  <p className="mt-2 text-[10.5px] text-[#8a938d]">
                    {order.deliveryAddress ? `Delivering to ${order.deliveryAddress}` : null}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </main>
      <EatsFooter />
      <EatsBottomNav cartCount={0} />
    </div>
  );
}
