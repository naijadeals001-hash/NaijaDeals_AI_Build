"use client";

import Link from "next/link";
import { ArrowRight, Heart, MapPin, PackageCheck, ShoppingCart, Star } from "lucide-react";
import type { Listing } from "@/lib/data/ecosystem";
import { useDemoStore } from "@/lib/demo-store";
import { TrustBadge } from "@/components/ui/badge";

export function ListingCard({ item }: { item: Listing }) {
  const store = useDemoStore();
  const saved = store.savedItemIds.includes(item.id);

  return (
    <article className="overflow-hidden rounded-xl border border-border-soft bg-canvas shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft">
      <div className="relative grid h-40 place-items-center bg-gradient-to-br from-primary-soft via-white to-amber-soft">
        <PackageCheck className="h-12 w-12 text-primary" />
        <button onClick={() => store.toggleSaved(item.id)} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-muted" aria-label={saved ? "Unsave" : "Save"}>
          <Heart className={`h-4 w-4 ${saved ? "fill-primary text-primary" : ""}`} />
        </button>
      </div>
      <div className="p-4">
        <TrustBadge>{item.badge}</TrustBadge>
        <h3 className="mt-3 line-clamp-2 min-h-12 font-display text-lg font-bold">{item.title}</h3>
        <p className="mt-1 text-sm text-muted">{item.subtitle}</p>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="font-display text-lg font-extrabold text-primary">{item.price}</span>
          <span className="flex items-center gap-1 font-bold">
            <Star className="h-4 w-4 fill-amber text-amber" />
            {item.rating}
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted">
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {item.location}
          </span>
          <Link href={`/product/${item.id}`} className="inline-flex items-center gap-1 font-bold text-primary">
            View <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <button onClick={() => store.addToCart(item.id)} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white">
          <ShoppingCart className="h-4 w-4" />
          Add to cart
        </button>
      </div>
    </article>
  );
}

export function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-border-soft bg-canvas p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 font-display text-2xl font-extrabold">{value}</p>
      <p className="mt-1 text-sm text-muted">{detail}</p>
    </div>
  );
}
