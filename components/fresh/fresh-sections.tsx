"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowRight, BadgeCheck, ChevronLeft, ChevronRight, Heart, Leaf, MapPin, Plus, Truck, ShieldCheck } from "lucide-react";
import { priceLabel } from "@/lib/services/fresh/format";

export { priceLabel } from "@/lib/services/fresh/format";

/** Horizontal rail with arrow controls, as used by every mockup carousel. */
export function FreshRail({ title, href, seeAll = "See All", hideHeading = false, children }: { title: string; href?: string; seeAll?: string; hideHeading?: boolean; children: React.ReactNode }) {
  const trackRef = useRef<HTMLUListElement | null>(null);
  const [scroll, setScroll] = useState({ left: 0, max: 1 });
  const sync = () => {
    const node = trackRef.current;
    if (node) setScroll({ left: node.scrollLeft, max: Math.max(1, node.scrollWidth - node.clientWidth) });
  };
  const page = (direction: -1 | 1) => {
    const node = trackRef.current;
    if (!node) return;
    node.scrollBy({ left: direction * Math.max(220, node.clientWidth * 0.8), behavior: "smooth" });
    window.setTimeout(sync, 320);
  };
  return (
    <section className="relative mt-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className={hideHeading ? "sr-only" : "font-display text-[17px] font-extrabold text-[#14241b] sm:text-[19px]"}>{title}</h2>
        {href ? (
          <Link href={href} className="flex items-center gap-1 text-[11.5px] font-bold text-[#0b5c33] hover:underline">
            {seeAll} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>
      <div className="relative">
        <button type="button" onClick={() => page(-1)} disabled={scroll.left <= 2} aria-label={`Scroll ${title} left`} className="absolute -left-2 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-[#e2e6e3] bg-white text-[#0b5c33] shadow-md disabled:opacity-0 sm:grid">
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <ul ref={trackRef} onScroll={sync} aria-label={title} className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
          {children}
        </ul>
        <button type="button" onClick={() => page(1)} disabled={scroll.left >= scroll.max - 2} aria-label={`Scroll ${title} right`} className="absolute -right-2 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-[#e2e6e3] bg-white text-[#0b5c33] shadow-md disabled:opacity-0 sm:grid">
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </section>
  );
}

export function FreshHero({ image }: { image: string | null }) {
  return (
    <section className="relative mt-4 overflow-hidden rounded-2xl bg-[#0b5c33]" aria-label="Featured">
      {image ? <img src={image} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover object-[85%_28%]" /> : <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_25%,#1f7a45,#083d22_70%)]" aria-hidden />}
      <div className="absolute inset-0 bg-gradient-to-r from-[#06401f] from-25% via-[#06401f]/70 via-55% to-transparent" aria-hidden />
      <div className="relative max-w-[560px] p-5 sm:min-h-[280px] sm:p-8">
        <p className="flex items-center gap-1.5 font-display text-[20px] font-extrabold text-white sm:text-[24px]">
          <Leaf className="h-5 w-5 text-[#8ed14b]" aria-hidden /> Naija<span className="text-[#8ed14b]">Fresh</span>
        </p>
        <h1 className="mt-1 font-display text-[25px] font-extrabold leading-tight text-white sm:text-[36px]">
          Fresh from African farms. Delivered to your door.
        </h1>
        <p className="mt-2 max-w-md text-[12px] leading-6 text-white/85 sm:text-[13.5px]">
          Buy directly from farmers for your home, shop or restaurant.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/naijafresh/shop" className="rounded-full bg-[#f26b21] px-5 py-2.5 text-[12.5px] font-extrabold text-white hover:bg-[#dd5f18]">Shop fresh produce</Link>
          <Link href="/naijafresh/farmers/apply" className="rounded-full border border-white/40 px-5 py-2.5 text-[12.5px] font-extrabold text-white hover:bg-white/10">Sell your harvest</Link>
        </div>
      </div>
    </section>
  );
}

export function FreshBenefits() {
  const items = [
    { icon: Leaf, title: "Direct from farmers", body: "Buy straight from verified African farms" },
    { icon: ShieldCheck, title: "Fresh harvests", body: "Picked and packed to order" },
    { icon: BadgeCheck, title: "Secure payments", body: "Paid safely with NaijaPay" },
    { icon: Truck, title: "Delivery to home or shop", body: "Couriers across your area" }
  ];
  return (
    <section aria-label="Why buy on NaijaFresh" className="mt-4 rounded-2xl bg-[#f2f9f0] px-3 py-3">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((item) => (
          <li key={item.title} className="flex items-center gap-2">
            <item.icon className="h-6 w-6 shrink-0 text-[#0b5c33]" aria-hidden />
            <span className="min-w-0">
              <span className="block text-[11.5px] font-extrabold text-[#14241b]">{item.title}</span>
              <span className="block text-[10px] leading-tight text-[#5d6d64]">{item.body}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export type CardListing = { id: string; slug: string; name: string; unit: string; priceKobo: string | bigint; quantity: number; imageUrl: string | null; farm: { name: string } };

/** Produce card: image, name, unit, price, stock, add to cart. */
export function ProduceCard({ listing, variant = "rail", favourited = false, image }: { listing: CardListing; variant?: "rail" | "grid"; favourited?: boolean; image?: string | null }) {
  const imageUrl = image ?? listing.imageUrl;
  const [state, setState] = useState<"idle" | "saving" | "added" | "error">("idle");
  const [note, setNote] = useState("");
  const [liked, setLiked] = useState(favourited);

  async function favourite() {
    const next = !liked;
    setLiked(next);
    const response = await fetch("/api/fresh/favourites", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "listing", targetId: listing.id })
    }).catch(() => null);
    if (!response || !response.ok) setLiked(!next);
  }

  async function add() {
    setState("saving");
    const response = await fetch("/api/fresh/cart/items", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId: listing.id, quantity: 1 })
    });
    if (response.ok) {
      setState("added");
      window.setTimeout(() => setState("idle"), 1600);
      return;
    }
    const body = await response.json().catch(() => ({}));
    setNote(response.status === 401 ? "Sign in to add" : body.error ?? "Could not add");
    setState("error");
  }

  return (
    <li data-listing={listing.slug} className={variant === "grid" ? "min-w-0" : "w-[168px] shrink-0 snap-start sm:w-[190px]"}>
      <div className="flex h-full flex-col rounded-xl bg-white p-2.5 ring-1 ring-[#eef1ef]">
        <Link href={`/naijafresh/shop/${listing.slug}`} className="relative block">
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              void favourite();
            }}
            aria-pressed={liked}
            aria-label={liked ? `Remove ${listing.name} from favourites` : `Save ${listing.name} to favourites`}
            className="absolute right-1 top-1 z-10 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-[#0b5c33] shadow-sm hover:bg-white"
          >
            <Heart className={`h-3.5 w-3.5 ${liked ? "fill-[#f26b21] text-[#f26b21]" : ""}`} aria-hidden />
          </button>
          <span className="block aspect-[4/3] w-full overflow-hidden rounded-lg bg-[#f4f6f5]">
            {imageUrl ? (
              <img src={imageUrl} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 hover:scale-[1.04]" />
            ) : (
              <span className="grid h-full w-full place-items-center text-[10px] uppercase tracking-wide text-[#9aa59e]">Photo pending</span>
            )}
          </span>
          <span className="mt-1.5 block truncate text-[12.5px] font-bold text-[#14241b]">{listing.name}</span>
          <span className="block truncate text-[10px] text-[#6b7a70]">{listing.farm.name}</span>
        </Link>
        <span className="mt-1 block text-[12.5px] font-extrabold text-[#0b5c33]">{priceLabel(listing.priceKobo, listing.unit)}</span>
        <span className={`text-[9.5px] font-semibold ${listing.quantity > 0 ? "text-[#0b8f47]" : "text-[#a3480f]"}`}>
          {listing.quantity > 0 ? `${listing.quantity} ${listing.unit} available` : "Out of stock"}
        </span>
        <button
          type="button"
          onClick={() => void add()}
          disabled={state === "saving" || listing.quantity === 0}
          aria-label={`Add ${listing.name} to cart`}
          className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-full bg-[#0b5c33] px-2 py-1.5 text-[10.5px] font-bold text-white hover:bg-[#094a29] disabled:opacity-50"
        >
          <Plus className="h-3 w-3" aria-hidden /> {state === "added" ? "Added" : "Add to Cart"}
        </button>
        {state === "error" && note ? (
          <span className="mt-0.5 text-[9px] font-semibold text-[#a3480f]">
            {note === "Sign in to add" ? <Link href="/login?next=/naijafresh" className="underline">Sign in to add</Link> : note}
          </span>
        ) : null}
      </div>
    </li>
  );
}

export function CategoryTile({ category, image }: { category: { slug: string; label: string; listings: number }; image?: string | null }) {
  return (
    <li className="w-[104px] shrink-0 snap-start sm:w-[128px]">
      <Link href={`/naijafresh/category/${category.slug}`} className="block rounded-xl bg-white p-2 text-center ring-1 ring-[#eef1ef] hover:shadow-md">
        <span className="block aspect-square w-full overflow-hidden rounded-lg bg-[#f2f9f0]">
          {image ? <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center"><Leaf className="h-7 w-7 text-[#0b5c33]/50" aria-hidden /></span>}
        </span>
        <span className="mt-1 block text-[10.5px] font-bold leading-tight text-[#14241b]">{category.label}</span>
        <span className="block text-[9px] text-[#8a938d]">{category.listings} listings</span>
      </Link>
    </li>
  );
}

export type CardFarm = { id: string; slug: string; name: string; farmerName: string; city: string; state: string; country?: string; specialities: string[]; verified: boolean; listingCount: number; avatarUrl: string | null; isSample?: boolean };

export function FarmerCard({ farm, variant = "rail", image }: { farm: CardFarm; variant?: "rail" | "grid"; image?: string | null }) {
  const portrait = image ?? farm.avatarUrl;
  return (
    <li className={variant === "grid" ? "min-w-0" : "w-[250px] shrink-0 snap-start sm:w-[280px]"}>
      <Link href={`/naijafresh/farmers/${farm.slug}`} className="flex h-full gap-2.5 rounded-xl bg-white p-2.5 ring-1 ring-[#eef1ef] hover:shadow-md">
        <span className={variant === "grid" ? "block h-24 w-20 shrink-0 overflow-hidden rounded-lg bg-[#f2f9f0]" : "block h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-[#f2f9f0]"}>
          {portrait ? (
            <img src={portrait} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center font-display text-lg font-black text-[#0b5c33]/40">{farm.name.charAt(0)}</span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1">
            <span className="truncate text-[12.5px] font-extrabold text-[#14241b]">{farm.name}</span>
            {farm.verified ? <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-[#0b8f47]" aria-label="Verified" /> : null}
            {farm.isSample ? <span className="shrink-0 rounded bg-[#fff3e8] px-1 text-[8.5px] font-extrabold uppercase tracking-wide text-[#a3480f]">Demo</span> : null}
          </span>
          <span className="block truncate text-[10px] text-[#6b7a70]">{farm.specialities.join(", ")}</span>
          <span className="mt-0.5 flex items-center gap-1 text-[10px] text-[#6b7a70]">
            <MapPin className="h-3 w-3" aria-hidden /> {farm.city}, {farm.country ?? farm.state}
          </span>
          <span className="mt-0.5 block text-[9.5px] text-[#8a938d]">{farm.listingCount} listings</span>
        </span>
      </Link>
    </li>
  );
}
