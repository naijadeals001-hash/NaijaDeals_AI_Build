import type { Metadata } from "next";
import Link from "next/link";
import { ContactLine } from "@/components/contact/contact-line";

export const metadata: Metadata = { title: "Help & customer service — NaijaShop", description: "Delivery, payments, returns and account help." };

const TOPICS = [
  {
    title: "Delivery",
    body: "Orders are dispatched by verified sellers with tracked delivery. Tracking appears on the order page once the seller dispatches.",
    links: [
      { label: "Track an order", href: "/orders" }
    ]
  },
  {
    title: "Payments",
    body: "NaijaShop checkout uses NaijaPay wallet payment and escrow: funds are held until delivery is confirmed. Card and transfer providers depend on configuration.",
    links: [
      { label: "Open your wallet", href: "/wallet" },
      { label: "Payment methods", href: "/pay" }
    ]
  },
  {
    title: "Returns",
    body: "Return requests are raised from the order page and reviewed by the seller and platform support.",
    links: [
      { label: "Your orders", href: "/orders" }
    ]
  },
  {
    title: "Account",
    body: "Manage your profile, delivery addresses and saved items in your account.",
    links: [
      { label: "Account settings", href: "/account" }
    ]
  }
];

export default function ShopHelpPage() {
  return (
    <>
      <div className="bg-white px-5 py-8 text-[#0f1111]">
        <div className="mx-auto max-w-4xl">
          <h1 className="font-display text-[30px] font-extrabold">Help &amp; customer service</h1>
          <p className="mt-1 text-[13px] text-[#565959]">Answers for delivery, payments, returns and your account.</p>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {TOPICS.map((topic) => (
              <li key={topic.title} className="rounded-lg p-4 ring-1 ring-[#e3e6e6]">
                <h2 className="text-[14px] font-bold">{topic.title}</h2>
                <p className="mt-1 text-[12.5px] leading-6 text-[#565959]">{topic.body}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {topic.links.map((link) => (
                    <Link key={link.href} href={link.href} className="rounded-full border border-[#d5d9d9] px-3 py-1 text-[11.5px] font-semibold hover:bg-[#f7f8f8]">
                      {link.label}
                    </Link>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <section aria-labelledby="contact-support-heading" className="mt-6 rounded-lg p-4 ring-1 ring-[#e3e6e6]">
            <h2 id="contact-support-heading" className="text-[14px] font-bold">Contact us</h2>
            <div className="mt-1 space-y-1 text-[12.5px] leading-6 text-[#565959]">
              <ContactLine contact="support" label="Orders, delivery and returns" subject="NaijaShop order help" />
              <ContactLine contact="payments" label="Wallet payments, refunds and payouts" subject="NaijaShop payment enquiry" />
              <ContactLine contact="partners" label="Selling on NaijaDeals" subject="Partner with NaijaDeals" />
              <ContactLine contact="hello" label="General enquiries" />
            </div>
            <p className="mt-2 text-[11.5px] leading-5 text-[#565959]">
              Email opens a message in your own mail app. Order pages, return requests and wallet statements remain the supported in-app channels.
            </p>
          </section>
          <p className="mt-6 text-[12px] leading-6 text-[#565959]">
            This page lists only the support channels the platform operates today; no phone numbers or response-time promises are published until they are approved.
          </p>
        </div>
      </div>
    </>
  );
}
