"use client";

import { supportHref } from "@/lib/support/contact-link";
import Link from "next/link";
import { Apple, BadgeCheck, Bike, CalendarDays, CheckCircle2, ChefHat, Leaf, MapPin, Play, Sprout, Store, Truck, Wallet } from "lucide-react";
import { mailtoFor, type ContactKey } from "@/lib/data/contact-directory";

type PublicContactKey = Exclude<ContactKey, "accounts">;

const LEGAL_LINKS: Array<{ label: string; contact: PublicContactKey; subject: string }> = [
  { label: "Terms of Service", contact: "legal", subject: "Terms of Service" },
  { label: "Privacy Policy", contact: "privacy", subject: "Privacy Policy" },
  { label: "Food Safety & Quality", contact: "support", subject: "Food safety and quality" },
  { label: "Partner Terms", contact: "partners", subject: "Partner terms" }
];

const STEPS = [
  { n: 1, icon: Sprout, title: "Farmer Lists Harvest", body: "Farmers add their fresh produce and prices." },
  { n: 2, icon: Play, title: "You Place an Order", body: "Choose what you need for home or business." },
  { n: 3, icon: Store, title: "Farmer Packs Your Order", body: "Freshly harvested and packed for delivery." },
  { n: 4, icon: Truck, title: "Delivery to You", body: "Delivered to your home, shop or business with NaijaDrive or NaijaSend." }
];

/** J — the four-step "How NaijaFresh Works" strip. */
export function HowItWorks() {
  return (
    <section aria-labelledby="how-fresh-works" className="rounded-2xl bg-white p-4 ring-1 ring-[#eef1ef]">
      <h2 id="how-fresh-works" className="font-display text-[16px] font-extrabold text-[#14241b] sm:text-[18px]">How NaijaFresh Works</h2>
      <ol className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {STEPS.map((step) => (
          <li key={step.n} className="relative flex flex-col items-center text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-[#e8f3e4] text-[#0b5c33]">
              <step.icon className="h-6 w-6" aria-hidden />
            </span>
            <span className="mt-1.5 grid h-4 w-4 place-items-center rounded-full bg-[#0b5c33] text-[9px] font-black text-white">{step.n}</span>
            <p className="mt-0.5 text-[11px] font-extrabold leading-tight text-[#14241b]">{step.title}</p>
            <p className="mt-0.5 text-[9.5px] leading-tight text-[#5d6d64]">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

const FLEET = [
  { icon: Bike, title: "Motorcycles", body: "Fast & flexible" },
  { icon: Truck, title: "Cars", body: "Safe & larger orders" },
  { icon: Store, title: "Vans", body: "Bulk & wholesale" }
];

/** K — delivery network drawn from the real NaijaDrive / NaijaSend fleet. */
export function DeliveryNetwork({ label }: { label: string }) {
  return (
    <section aria-labelledby="fresh-delivery" className="rounded-2xl bg-white p-4 ring-1 ring-[#eef1ef]">
      <h2 id="fresh-delivery" className="font-display text-[16px] font-extrabold text-[#14241b] sm:text-[18px]">Our Delivery Network</h2>
      <p className="mt-1 text-[11px] leading-snug text-[#5d6d64]">
        Fast and reliable delivery with NaijaDrive and NaijaSend using motorcycles and cars across your area.
      </p>
      <p className="mt-1 text-[10px] font-semibold text-[#0b8f47]">{label}</p>
      <ul className="mt-3 grid grid-cols-3 gap-2">
        {FLEET.map((item) => (
          <li key={item.title} className="flex flex-col items-center rounded-xl bg-[#f2f9f0] px-1.5 py-2 text-center">
            <item.icon className="h-7 w-7 text-[#0b5c33]" aria-hidden />
            <p className="mt-1 text-[10.5px] font-extrabold text-[#14241b]">{item.title}</p>
            <p className="text-[9px] leading-tight text-[#5d6d64]">{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** H/I — the paired home and business banners. */
export function AudienceBanners({ homeImage, businessImage }: { homeImage: string | null; businessImage: string | null }) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <Link href="/naijafresh/shop" className="group relative overflow-hidden rounded-2xl bg-[#0b5c33] p-5 text-white">
        {homeImage ? <img src={homeImage} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-60" /> : null}
        <span className="absolute inset-0 bg-gradient-to-r from-[#06401f] via-[#06401f]/70 to-transparent" aria-hidden />
        <span className="relative block">
        <p className="font-display text-[19px] font-extrabold">Buy for Your Home</p>
        <p className="mt-1 max-w-[62%] text-[11.5px] leading-snug text-white/85">Get fresh, healthy and affordable farm produce for your family.</p>
        <span className="mt-3 inline-flex rounded-full bg-white px-4 py-1.5 text-[11.5px] font-extrabold text-[#0b5c33] group-hover:bg-[#e8f3e4]">Shop for Home</span>
        </span>
      </Link>
      <Link href="/naijafresh/business" className="group relative overflow-hidden rounded-2xl bg-[#f26b21] p-5 text-white">
        {businessImage ? <img src={businessImage} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-60" /> : null}
        <span className="absolute inset-0 bg-gradient-to-r from-[#8f3d0c] via-[#c4551a]/80 to-transparent" aria-hidden />
        <span className="relative block">
        <p className="font-display text-[19px] font-extrabold">Buy for Your Business</p>
        <p className="mt-1 max-w-[62%] text-[11.5px] leading-snug text-white/90">Bulk, fresh and cost-effective supplies for shops, restaurants and food vendors.</p>
        <span className="mt-3 inline-flex rounded-full bg-white px-4 py-1.5 text-[11.5px] font-extrabold text-[#c4551a] group-hover:bg-[#fff3ea]">Shop for Business</span>
        </span>
      </Link>
    </div>
  );
}

/** L/M/N — farmer prompt, seasonal calendar and NaijaPay strip. */
export function FreshPromoTrio({ farmerImage, seasonalImage }: { farmerImage: string | null; seasonalImage: string | null }) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Link href="/naijafresh/farmers/apply" className="flex items-center gap-3 rounded-2xl bg-[#f7efe2] p-3 hover:shadow-md">
        {farmerImage ? <img src={farmerImage} alt="" aria-hidden className="h-12 w-12 shrink-0 rounded-full object-cover" /> : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#0b5c33] text-white"><Sprout className="h-6 w-6" aria-hidden /></span>}
        <span className="min-w-0">
          <span className="block font-display text-[14px] font-extrabold text-[#14241b]">Are You a Farmer?</span>
          <span className="mt-0.5 block text-[10.5px] leading-snug text-[#5d6d64]">Join NaijaFresh, reach more buyers and grow your income.</span>
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[#f26b21] px-3 py-1 text-[10.5px] font-extrabold text-white">Register as a Farmer</span>
        </span>
      </Link>
      <Link href="/naijafresh/seasonal" className="flex items-center gap-3 rounded-2xl bg-[#f2f9f0] p-3 hover:shadow-md">
        {seasonalImage ? <img src={seasonalImage} alt="" aria-hidden className="h-12 w-12 shrink-0 rounded-full object-cover" /> : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-[#0b5c33] ring-1 ring-[#d6e8d2]"><CalendarDays className="h-6 w-6" aria-hidden /></span>}
        <span className="min-w-0">
          <span className="block font-display text-[14px] font-extrabold text-[#14241b]">Seasonal Harvest Calendar</span>
          <span className="mt-0.5 block text-[10.5px] leading-snug text-[#5d6d64]">Know what&apos;s in season, plan your purchases and enjoy the best prices.</span>
          <span className="mt-1.5 inline-flex rounded-full bg-[#0b5c33] px-3 py-1 text-[10.5px] font-extrabold text-white">View Harvest Calendar</span>
        </span>
      </Link>
      <Link href="/naijapay" className="flex items-center gap-3 rounded-2xl bg-[#eef4fb] p-3 hover:shadow-md sm:col-span-2 lg:col-span-1">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#0b5c33] text-white"><Wallet className="h-6 w-6" aria-hidden /></span>
        <span className="min-w-0">
          <span className="block font-display text-[14px] font-extrabold text-[#14241b]">Pay Securely with NaijaPay</span>
          <span className="mt-0.5 block text-[10.5px] leading-snug text-[#5d6d64]">Fast, safe and reliable payments for all your orders.</span>
        </span>
      </Link>
    </div>
  );
}

/** O — app promotion banner. The store buttons link to the same web app. */
export function FreshAppBanner({ image }: { image: string | null }) {
  return (
    <section aria-labelledby="fresh-app" className="relative mt-4 overflow-hidden rounded-2xl bg-[#0b5c33] p-4 text-white">
      {image ? <img src={image} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-45" /> : null}
      <span className="absolute inset-0 bg-gradient-to-r from-[#06401f] via-[#06401f]/85 to-transparent" aria-hidden />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h2 id="fresh-app" className="font-display text-[18px] font-extrabold sm:text-[21px]">Get the NaijaFresh App</h2>
          <p className="mt-1 text-[11.5px] leading-snug text-white/85">Shop fresh produce, order from farms and track your deliveries.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/naijafresh" className="flex items-center gap-1.5 rounded-lg bg-black px-3 py-1.5 text-[10.5px] font-semibold">
              <Apple className="h-4 w-4" aria-hidden /> <span>Download on the<br /><b className="text-[12px]">App Store</b></span>
            </Link>
            <Link href="/naijafresh" className="flex items-center gap-1.5 rounded-lg bg-black px-3 py-1.5 text-[10.5px] font-semibold">
              <Play className="h-4 w-4" aria-hidden /> <span>Get it on<br /><b className="text-[12px]">Google Play</b></span>
            </Link>
          </div>
        </div>
        <div className="hidden shrink-0 rounded-xl bg-white/10 p-3 text-center sm:block">
          <div className="grid h-16 w-16 grid-cols-4 grid-rows-4 gap-0.5 rounded bg-white p-1" aria-hidden>
            {Array.from({ length: 16 }).map((_, index) => (
              <span key={index} className={[0, 1, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15].includes(index) ? "bg-[#0b5c33]" : "bg-white"} />
            ))}
          </div>
          <p className="mt-1.5 text-[9px] font-bold">Scan to<br />Download</p>
        </div>
      </div>
    </section>
  );
}

const FOOTER_COLUMNS = [
  { title: "Shop", links: [{ href: "/naijafresh/shop", label: "All Produce" }, { href: "/naijafresh/shop?category=vegetables-ugu", label: "By Category" }, { href: "/naijafresh/farmers", label: "By Farmer" }, { href: "/naijafresh/seasonal", label: "Seasonal Harvests" }, { href: "/naijafresh/offers", label: "Offers & Deals" }] },
  { title: "For Farmers", links: [{ href: "/naijafresh/farmers/apply", label: "Register as a Farmer" }, { href: "/naijafresh/how-it-works", label: "Farmer Dashboard" }, { href: "/naijafresh/how-it-works", label: "How to Sell" }, { href: "/naijafresh/how-it-works", label: "Fees & Charges" }, { href: mailtoFor("support", { subject: "NaijaFresh farmer support" }), label: "Farmer Support" }] },
  { title: "For Businesses", links: [{ href: "/naijafresh/business", label: "Bulk Orders" }, { href: "/naijafresh/business", label: "Wholesale Supply" }, { href: "/naijafresh/business", label: "Corporate & Institutional Orders" }, { href: "/naijafresh/business", label: "Business Support" }] },
  { title: "Company", links: [{ href: "/naijafresh", label: "About NaijaFresh" }, { href: "/naijafresh/how-it-works", label: "How It Works" }, { href: "/naijafresh/farmers", label: "Our Farmers" }, { href: "/naijashop/plus", label: "NaijaDeals Plus+" }, { href: mailtoFor("hello"), label: "Contact Us" }, { href: mailtoFor("careers", { subject: "Careers at NaijaDeals" }), label: "Careers" }] },
  { title: "Support", links: [{ href: mailtoFor("support", { subject: "NaijaFresh help" }), label: "Help Center" }, { href: mailtoFor("hello"), label: "Contact Us" }, { href: "/naijafresh/orders", label: "Track Order" }, { href: mailtoFor("payments", { subject: "NaijaFresh refund" }), label: "Returns & Refunds" }, { href: mailtoFor("support", { subject: "NaijaFresh issue" }), label: "Report an Issue" }] }
];

/** P — the complete footer from the approved mockup. */
export function FreshFooter() {
  return (
    <footer className="mt-6 bg-[#0b5c33] pb-20 text-white lg:pb-8">
      <div className="mx-auto grid max-w-[1440px] gap-5 px-4 py-7 sm:grid-cols-2 lg:grid-cols-6">
        <div className="sm:col-span-2 lg:col-span-1">
          <p className="flex items-center gap-1.5 font-display text-[18px] font-extrabold">
            <Leaf className="h-5 w-5 text-[#8ed14b]" aria-hidden /> Naija<span className="text-[#8ed14b]">Fresh</span>
          </p>
          <p className="mt-1 text-[10.5px] leading-snug text-white/75">Fresh produce, affordable and quality produce directly from African farmers, for homes and businesses.</p>
          <div className="mt-2 flex gap-2 text-white/70" aria-hidden>
            <span className="grid h-6 w-6 place-items-center rounded-full ring-1 ring-white/30 text-[10px]">f</span>
            <span className="grid h-6 w-6 place-items-center rounded-full ring-1 ring-white/30 text-[10px]">X</span>
            <span className="grid h-6 w-6 place-items-center rounded-full ring-1 ring-white/30 text-[10px]">in</span>
            <span className="grid h-6 w-6 place-items-center rounded-full ring-1 ring-white/30 text-[10px]">t</span>
          </div>
        </div>
        {FOOTER_COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <p className="text-[11px] font-extrabold text-[#8ed14b]">{column.title}</p>
            <ul className="mt-1.5 space-y-1">
              {column.links.map((link) => (
                <li key={`${column.title}-${link.label}`}>
                  {link.href.startsWith("mailto:") ? (
                    <a href={link.href} className="break-words text-[10.5px] text-white/80 hover:text-white hover:underline">{link.label}</a>
                  ) : (
                    <Link href={link.href} className="text-[10.5px] text-white/80 hover:text-white hover:underline">{link.label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
        <div>
          <p className="text-[11px] font-extrabold text-[#8ed14b]">NaijaDeals Ecosystem</p>
          <ul className="mt-1.5 space-y-1.5 text-[10.5px] text-white/80">
            {[["NaijaShop", "/naijashop"], ["NaijaEats", "/naijaeats"], ["NaijaDrive", "/naijadrive"], ["NaijaSend", "/naijasend"]].map(([label, href]) => (
              <li key={href}>
                <Link href={href} className="flex items-center gap-1.5 hover:text-white hover:underline">
                  <BadgeCheck className="h-3 w-3 text-[#8ed14b]" aria-hidden /> {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/15">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2 px-4 py-3 text-[10px] text-white/70">
          <p>© {new Date().getFullYear()} NaijaDeals. NaijaFresh is a NaijaDeals Company. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-3">
            {LEGAL_LINKS.map((entry) => (
              <a key={entry.label} href={supportHref(entry.contact, { subject: entry.subject })} className="hover:text-white hover:underline">{entry.label}</a>
            ))}
            <span className="flex items-center gap-2 rounded-full bg-white/10 px-2 py-0.5">
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden /> Pan-African</span>
              <span aria-hidden>|</span>
              <span>NGN</span>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

/** Seasonal month table reused by the home page and /seasonal. */
export function SeasonalStrip({ months }: { months: Array<{ month: string; crops: string[] }> }) {
  return (
    <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {months.map((row) => (
        <li key={row.month} className="rounded-xl bg-white p-2.5 ring-1 ring-[#eef1ef]">
          <p className="flex items-center gap-1 text-[11px] font-extrabold text-[#0b5c33]">
            <CheckCircle2 className="h-3 w-3" aria-hidden /> {row.month}
          </p>
          <p className="mt-0.5 text-[10px] leading-tight text-[#5d6d64]">{row.crops.join(", ")}</p>
        </li>
      ))}
    </ul>
  );
}
