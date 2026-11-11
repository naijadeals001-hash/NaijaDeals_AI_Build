"use client";
import { useState } from "react";
import Link from "next/link";
import { Bike, Bus, Car, Footprints, Truck, Zap } from "lucide-react";

const TRANSPORT = [
  { key: "motorcycle", label: "Motorbike", icon: Bike },
  { key: "scooter", label: "Scooter / moped", icon: Bike },
  { key: "electric-motorcycle", label: "Electric motorbike", icon: Zap },
  { key: "bicycle", label: "Bicycle", icon: Bike },
  { key: "electric-bicycle", label: "E-bike", icon: Zap },
  { key: "car", label: "Car", icon: Car },
  { key: "tricycle", label: "Tricycle", icon: Bus },
  { key: "van", label: "Van", icon: Truck },
  { key: "walking", label: "Walking courier", icon: Footprints }
] as const;

const REGIONS = ["West African", "East African", "North African", "Central African", "Southern African"];
const FAQS = [
  { q: "Where does NaijaEats deliver?", a: "Delivery depends on the city and the restaurants open there. Add your address to see what is available." },
  { q: "Which transport can I deliver with?", a: "Approved options include motorbike, scooter, bicycle, e-bike, car, tricycle, van and walking courier. Requirements vary by city." },
  { q: "How do I become a delivery partner?", a: "Start the delivery-partner application, choose your city and transport, and complete approval. Food-delivery approval does not grant passenger-ride approval." },
  { q: "How can my restaurant join?", a: "Use the restaurant partner journey. Onboarding is separate from courier onboarding and is reviewed before listings go live." }
];

export function EatsLandingExtras() {
  const [dismissed, setDismissed] = useState(false);
  return (
    <>
      <section className="mx-auto mt-8 w-full max-w-[1180px] px-4">
        <div className="grid items-center gap-4 sm:grid-cols-[180px_1fr]">
          <svg viewBox="0 0 200 240" role="img" aria-label="Map of Africa" className="mx-auto h-auto w-[150px] sm:mx-0 sm:w-[180px]">
            <path
              d="M37 6 L27 22 L8 54 L8 74 L19 93 L32 107 L53 104 L69 109 L77 109 L77 125 L85 141 L88 163 L93 192 L101 230 L123 230 L141 205 L147 182 L160 170 L160 154 L157 138 L165 125 L189 86 L168 83 L157 74 L152 51 L139 22 L120 19 L83 16 L80 3 L61 6 Z"
              fill="#0b5c33" stroke="#0b3d24" strokeWidth="2" strokeLinejoin="round"
            />
            <path d="M8 54 L27 22 L61 6 L80 3 L83 16 L120 19 L139 22 L152 51 L120 60 L90 66 L60 70 L30 64 Z" fill="#8ed14b" opacity="0.55" />
            <ellipse cx="176" cy="186" rx="7" ry="14" fill="#0b5c33" stroke="#0b3d24" strokeWidth="2" />
            <circle cx="75" cy="93" r="5" fill="#f26b21" />
          </svg>
          <div>
            <ul className="flex flex-wrap gap-2">
              {REGIONS.map((region) => (
                <li key={region}>
                  <Link href="/naijaeats/restaurants" className="inline-flex rounded-full border border-[#e4e9e5] bg-white px-4 py-2 text-sm font-bold text-[#14241b] hover:border-[#0b5c33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]">
                    {region}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-[#6b7a70]">Cuisine availability depends on the restaurants operating in your city.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-8 w-full max-w-[1180px] px-4">
        <h2 className="font-display text-2xl font-extrabold text-[#14241b]">Good food, a few simple steps away</h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            { title: "Enter your address", text: "Tell us where you are." },
            { title: "Choose your meal", text: "Browse restaurants and pick from real menus." },
            { title: "Follow your delivery", text: "Track the order through your account." }
          ].map((step, index) => (
            <li key={step.title} className="rounded-xl border border-[#e4e9e5] bg-white p-4">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[#0b5c33] text-sm font-black text-white">{index + 1}</span>
              <p className="mt-2 font-bold text-[#14241b]">{step.title}</p>
              <p className="text-sm text-[#6b7a70]">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10 bg-[#0b3d24] py-10 text-white">
        <div className="mx-auto grid max-w-[1180px] items-center gap-6 px-4 md:grid-cols-2">
          <div>
            <h2 className="font-display text-2xl font-extrabold">Deliver food. Move your way.</h2>
            <p className="mt-1 max-w-xl text-sm text-white/80">Join our delivery community with an approved transport option in your city.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/naijaeats/courier" className="rounded-full bg-white px-5 py-2.5 text-sm font-extrabold text-[#0b3d24]">Become a delivery partner</Link>
              <a href="#delivery-transport" className="rounded-full border border-white/50 px-5 py-2.5 text-sm font-extrabold text-white">Explore transport options</a>
            </div>
          </div>
          <img src="/generated/eats/partners-delivery.png" alt="Three NaijaEats delivery partners with a motorbike, bicycle and car, each carrying an insulated food bag" loading="lazy" className="h-56 w-full rounded-2xl object-cover md:h-64" />
        </div>
      </section>

      <section id="delivery-transport" className="mx-auto mt-8 w-full max-w-[1180px] px-4">
        <h2 className="font-display text-2xl font-extrabold text-[#14241b]">Transport options for delivery partners</h2>
        <p className="mt-1 text-sm text-[#6b7a70]">Transport options and requirements vary by city. Suitable food bags and local approval required.</p>
        <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-3 lg:grid-cols-9">
          {TRANSPORT.map((option) => (
            <li key={option.key}>
              <Link href={`/naijaeats/courier?transport=${option.key}`} className="flex h-full flex-col items-center gap-2 rounded-xl border border-[#e4e9e5] bg-[#f4f8f4] px-2 py-3 text-center hover:border-[#0b5c33]">
                <option.icon className="h-6 w-6 text-[#0b5c33]" aria-hidden="true" />
                <span className="text-[11px] font-bold leading-tight text-[#14241b]">{option.label}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-[#6b7a70]">Selecting an option opens the partner application with that preference. It does not approve or activate you.</p>
      </section>

      <section className="mx-auto mt-8 grid w-full max-w-[1180px] gap-4 px-4 sm:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-[#e4e9e5] bg-white">
          <img src="/generated/eats/partners-restaurant.png" alt="A Nigerian chef handing a takeaway bag to a NaijaEats delivery rider inside a restaurant" loading="lazy" className="h-44 w-full object-cover" />
          <div className="p-5">
            <h2 className="font-display text-xl font-extrabold text-[#14241b]">Your kitchen. More customers.</h2>
            <p className="mt-1 text-sm text-[#6b7a70]">List your restaurant on NaijaEats and reach more food lovers in your city.</p>
            <Link href="/partner" className="mt-3 inline-flex rounded-full bg-[#0b5c33] px-5 py-2.5 text-sm font-extrabold text-white">Partner your restaurant</Link>
          </div>
        </div>
        <div className="rounded-2xl border border-[#e4e9e5] bg-white p-5">
          <h2 className="font-display text-xl font-extrabold text-[#14241b]">Your cravings, closer.</h2>
          <p className="mt-1 text-sm text-[#6b7a70]">Install NaijaDeals for quicker access to food, rides and shopping. Installation is optional and never blocks ordering.</p>
          {dismissed ? (
            <p className="mt-3 text-xs text-[#6b7a70]">Prompt dismissed. You can install later from your browser menu.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/naijaeats" className="rounded-full bg-[#0b5c33] px-4 py-2 text-sm font-bold text-white">Continue on web</Link>
              <button onClick={() => setDismissed(true)} className="rounded-full border border-[#d8dfd8] px-4 py-2 text-sm font-bold">Dismiss</button>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto mt-8 w-full max-w-[1180px] px-4 pb-10">
        <h2 className="font-display text-2xl font-extrabold text-[#14241b]">Frequently asked questions</h2>
        <div className="mt-3 space-y-2">
          {FAQS.map((faq) => (
            <details key={faq.q} className="rounded-xl border border-[#e4e9e5] bg-white p-4">
              <summary className="cursor-pointer font-bold text-[#14241b]">{faq.q}</summary>
              <p className="mt-2 text-sm text-[#4b5a51]">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
