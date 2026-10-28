import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Store, Truck } from "lucide-react";
import { getSessionUser, isVendor } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Sell on NaijaDeals",
  description: "Apply for a verified NaijaDeals seller account."
};

export default async function Page() {
  const user = await getSessionUser();
  const vendor = user ? isVendor(user) : false;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-xs font-black uppercase tracking-wide text-primary">Sell on NaijaDeals</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold sm:text-4xl">Reach buyers across Nigeria</h1>
        <p className="mt-2 text-muted">
          Sellers are reviewed before products go live. Every paid order is held in escrow until the buyer confirms
          delivery, and payouts are recorded in the Control Center.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: ShieldCheck, title: "Verified onboarding", detail: "Business name, market, pickup address and phone are reviewed by an administrator." },
          { icon: Store, title: "Your own dashboard", detail: "Manage products, stock, orders and returns from the seller dashboard." },
          { icon: Truck, title: "Tracked delivery", detail: "NaijaSend records pickup, transit and delivery events against each order." }
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="rounded-2xl border border-border-soft bg-canvas p-5">
              <Icon className="h-6 w-6 text-primary" />
              <h2 className="mt-3 font-bold">{item.title}</h2>
              <p className="mt-1 text-sm text-muted">{item.detail}</p>
            </div>
          );
        })}
      </section>

      <section className="rounded-2xl border border-border-soft bg-canvas p-5">
        <h2 className="font-display text-xl font-extrabold">How to apply</h2>
        <ol className="mt-3 space-y-2 text-sm text-muted">
          <li>1. Create a customer account or sign in.</li>
          <li>2. Submit your business and pickup details from the Account page.</li>
          <li>3. An administrator reviews the application. Approved sellers get the vendor role and dashboard access.</li>
        </ol>
        <div className="mt-4 flex flex-wrap gap-3">
          {user ? (
            <Link href={vendor ? "/seller" : "/account"} className="inline-flex min-h-12 items-center rounded-xl bg-primary px-5 text-sm font-bold text-white">
              {vendor ? "Open seller dashboard" : "Submit seller application"}
            </Link>
          ) : (
            <>
              <Link href="/register?next=/sell" className="inline-flex min-h-12 items-center rounded-xl bg-primary px-5 text-sm font-bold text-white">
                Create an account
              </Link>
              <Link href="/login?next=/sell" className="inline-flex min-h-12 items-center rounded-xl border border-border-soft px-5 text-sm font-bold">
                Sign in
              </Link>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
