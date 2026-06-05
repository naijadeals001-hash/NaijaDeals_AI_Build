import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Heart, ShieldCheck, Star, Truck } from "lucide-react";
import { listings, trustFlows } from "@/lib/data/ecosystem";
import { TrustBadge } from "@/components/ui/badge";

export function generateStaticParams() {
  return listings.map((item) => ({ id: item.id }));
}

export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  const item = listings.find((listing) => listing.id === params.id);
  return {
    title: item ? item.title : "Product detail",
    description: item ? item.subtitle : "NaijaDeals product detail page"
  };
}

export default function ProductDetail({ params }: { params: { id: string } }) {
  const item = listings.find((listing) => listing.id === params.id) ?? listings[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <section className="overflow-hidden rounded-2xl border border-border-soft bg-canvas shadow-sm">
        <div className="relative h-[360px] bg-surface-mid">
          <Image src={item.image} alt={item.title} fill sizes="(min-width: 1024px) 60vw, 100vw" className="object-cover" />
        </div>
        <div className="p-5">
          <TrustBadge>{item.badge}</TrustBadge>
          <h1 className="mt-4 font-display text-2xl font-extrabold sm:text-3xl">{item.title}</h1>
          <p className="mt-2 text-muted">{item.subtitle}</p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 font-bold text-primary">
              <Star className="h-4 w-4 fill-primary text-primary" />
              {item.rating} verified rating
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-low px-3 py-1 font-bold">
              <Truck className="h-4 w-4" />
              QR delivery eligible
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-low px-3 py-1 font-bold">
              <ShieldCheck className="h-4 w-4" />
              Escrow protected
            </span>
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-border-soft bg-canvas p-5 shadow-sm">
          <p className="font-display text-3xl font-extrabold text-primary">{item.price}</p>
          <p className="mt-2 text-sm text-muted">Location: {item.location}</p>
          <div className="mt-5 grid gap-3">
            <Link href="/cart" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 font-bold text-white">
              Add to cart <ArrowRight className="h-4 w-4" />
            </Link>
            <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border-soft px-5 font-bold">
              <Heart className="h-4 w-4" />
              Save
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-border-soft bg-canvas p-5">
          <h2 className="font-display text-xl font-bold">Trust lifecycle</h2>
          <div className="mt-4 space-y-3">
            {trustFlows.map((flow) => {
              const Icon = flow.icon;
              return (
                <div key={flow.title} className="flex gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="font-bold">{flow.title}</h3>
                    <p className="text-sm text-muted">{flow.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}
