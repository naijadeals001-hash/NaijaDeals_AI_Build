import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Accessibility, ArrowLeft, BedDouble, Car, Droplets, MapPin, ShieldCheck, Star, Users, Wifi, Zap } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { StayBottomNav, StayHeader } from "@/components/stay/stay-shell";
import { StayFooter } from "@/components/stay/stay-home";
import { StayBookingPanel } from "@/components/stay/stay-booking-panel";
import { SaveProperty } from "@/components/stay/save-property";
import { getSessionUser } from "@/lib/auth/session";
import { categoryLabel } from "@/lib/services/stay/discovery";
import { unavailableDates } from "@/lib/services/stay/reservations";
import { StayPaused } from "@/components/stay/stay-paused";
import { stayPageAccess } from "@/lib/services/stay/access";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const access = await stayPageAccess();
  if (!access.accessible) return { title: "Stays are paused in this market — NaijaStay" };
  const property = await prisma.stayProperty.findUnique({ where: { slug: params.slug }, select: { title: true, city: true, country: true } });
  return property
    ? { title: `${property.title} — NaijaStay`, description: `${property.title} in ${property.city}, ${property.country}.` }
    : { title: "Property not found — NaijaStay" };
}

export default async function StayPropertyPage({ params }: { params: { slug: string } }) {
  const access = await stayPageAccess();
  if (!access.accessible) return <StayPaused message={access.message} />;
  const property = await prisma.stayProperty.findUnique({
    where: { slug: params.slug },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      units: true,
      host: true,
      reviews: { where: { status: "published" }, orderBy: { createdAt: "desc" }, take: 10 }
    }
  });
  if (!property || property.status !== "published") notFound();

  const session = await getSessionUser();
  const saved = session
    ? Boolean(await prisma.eatsFavourite.findUnique({ where: { userId_kind_targetId: { userId: session.id, kind: "stay_property", targetId: property.id } } }))
    : false;
  const unit = property.units[0];
  const unavailable = unit ? await unavailableDates(unit.id) : [];
  const rating = property.reviews.length
    ? Math.round((property.reviews.reduce((s, r) => s + r.rating, 0) / property.reviews.length) * 10) / 10
    : null;
  const isStay = property.listingType === "stay" || property.listingType === "rent";

  const facts = [
    [property.powerBackup, "Power backup", Zap],
    [property.waterSupply, "Water supply", Droplets],
    [property.internet, "Internet", Wifi],
    [property.parking, "Parking", Car],
    [property.accessible, "Accessibility features", Accessibility]
  ] as const;

  const gallery = property.images.length ? property.images : [{ url: "", alt: property.title, kind: "photo" }];

  return (
    <div className="min-h-screen bg-[#f7f9f7] text-[#14241b]">
      <StayHeader />
      <main id="main-content" className="mx-auto max-w-[1440px] px-3 pb-24 sm:px-6 lg:pb-6">
        <nav aria-label="Breadcrumb" className="mt-3 flex items-center gap-1 text-[11px] text-[#6b7a70]">
          <Link href="/naijastay" className="hover:underline">NaijaStay</Link>
          <span aria-hidden>/</span>
          <Link href={`/naijastay/search?category=${property.category}`} className="hover:underline">{categoryLabel(property.category)}</Link>
          <span aria-hidden>/</span>
          <span className="font-semibold text-[#14241b]">{property.title}</span>
        </nav>

        <div className="mt-2 grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <div className="grid grid-cols-2 gap-1.5 overflow-hidden rounded-2xl">
              {gallery.slice(0, 4).map((img, index) => (
                <div key={index} className={`bg-[#e8f3e4] ${index === 0 ? "col-span-2 aspect-[16/9]" : "aspect-[4/3]"}`}>
                  {img.url ? <img src={img.url} alt={img.alt} className="h-full w-full object-cover" /> : null}
                </div>
              ))}
            </div>
            {property.images.some((image) => image.kind === "generated-demo") ? (
              <p className="mt-1 rounded-lg bg-[#fff3e8] p-2 text-[10.5px] leading-4 text-[#a3480f]">
                This is a demonstration listing. Its images are AI-generated illustrations, not photographs of a real property.
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-start justify-between gap-2">
              <h1 className="font-display text-[22px] font-extrabold sm:text-[26px]">{property.title}</h1>
              <SaveProperty propertyId={property.id} initialSaved={saved} />
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-[#5d6d64]">
              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden /> {property.city}, {property.country}</span>
              <span>{categoryLabel(property.category)}</span>
              {rating !== null ? (
                <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-[#f5b52e] text-[#f5b52e]" aria-hidden /> {rating} ({property.reviews.length} review{property.reviews.length === 1 ? "" : "s"})</span>
              ) : (
                <span className="rounded bg-[#f2f9f0] px-1.5 py-0.5 text-[10px] font-extrabold text-[#0b5c33]">No reviews yet</span>
              )}
            </p>

            <section aria-labelledby="about" className="mt-3 rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
              <h2 id="about" className="font-display text-[15px] font-extrabold">About this place</h2>
              <p className="mt-1 text-[12px] leading-6 text-[#3f4d45]">{property.description}</p>
              <ul className="mt-2 flex flex-wrap gap-3 text-[11px] text-[#5d6d64]">
                <li className="flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden /> Up to {property.maxGuests} guests</li>
                <li className="flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" aria-hidden /> {property.bedrooms} bedroom{property.bedrooms === 1 ? "" : "s"} · {property.beds} bed{property.beds === 1 ? "" : "s"}</li>
                <li>{property.bathrooms} bathroom{property.bathrooms === 1 ? "" : "s"}</li>
              </ul>
            </section>

            <section aria-labelledby="amenities" className="mt-3 rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
              <h2 id="amenities" className="font-display text-[15px] font-extrabold">Amenities</h2>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {property.amenities.map((amenity) => <li key={amenity} className="rounded-full bg-[#f2f9f0] px-2.5 py-1 text-[10.5px] font-semibold text-[#0b5c33]">{amenity}</li>)}
                {!property.amenities.length ? <li className="text-[11px] text-[#6b7a70]">The host has not listed amenities.</li> : null}
              </ul>
              <h3 className="mt-2 text-[11.5px] font-extrabold">Practical details</h3>
              <ul className="mt-1 grid grid-cols-2 gap-1 text-[11px]">
                {facts.map(([on, label, Icon]) => (
                  <li key={label} className={`flex items-center gap-1 ${on ? "text-[#0b5c33]" : "text-[#9aa59e]"}`}>
                    <Icon className="h-3.5 w-3.5" aria-hidden /> {label}{on ? "" : " — not listed"}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[9.5px] text-[#6b7a70]">These details are supplied by the host and are not independently verified.</p>
            </section>

            <section aria-labelledby="host" className="mt-3 rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
              <h2 id="host" className="font-display text-[15px] font-extrabold">Your host</h2>
              <p className="mt-1 flex items-center gap-1.5 text-[12px] font-bold">
                {property.host.displayName}
                {property.host.status === "verified" ? <ShieldCheck className="h-3.5 w-3.5 text-[#0b8f47]" aria-label="Verified host" /> : null}
              </p>
              <p className="text-[11px] text-[#5d6d64]">{property.host.bio ?? "Host details on file with NaijaStay."}</p>
              <Link href="/naijastay/messages" className="mt-1.5 inline-flex rounded-full px-3 py-1 text-[11px] font-extrabold text-[#0b5c33] ring-1 ring-[#cfe3ca]">Message the host</Link>
            </section>

            {property.reviews.length ? (
              <section aria-labelledby="reviews" className="mt-3 rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
                <h2 id="reviews" className="font-display text-[15px] font-extrabold">Guest reviews</h2>
                <ul className="mt-1.5 space-y-2">
                  {property.reviews.map((review) => (
                    <li key={review.id} className="text-[11.5px]">
                      <p className="text-[10px] text-[#f5b52e]" aria-label={`${review.rating} out of 5`}>{"★".repeat(review.rating)}</p>
                      {review.comment ? <p className="italic text-[#3f4d45]">“{review.comment}”</p> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <aside>
            {isStay && unit ? (
              <StayBookingPanel
                propertyId={property.id}
                slug={property.slug}
                nightlyKobo={property.nightlyKobo.toString()}
                cleaningKobo={property.cleaningFeeKobo.toString()}
                serviceFeeBps={property.serviceFeeBps}
                currency={property.currency}
                maxGuests={property.maxGuests}
                minimumNights={property.minimumNights}
                unavailable={unavailable}
              />
            ) : (
              <div className="sticky top-28 rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
                <p className="text-[16px] font-extrabold text-[#0b5c33]">₦{(Number(property.salePriceKobo ?? BigInt(0)) / 100).toLocaleString("en-NG")}</p>
                <p className="text-[11px] text-[#6b7a70]">{property.listingType === "land" ? "Land listing" : "Sale listing"} · {property.currency}</p>
                <p className="mt-2 text-[11px] leading-5 text-[#5d6d64]">Purchase and lease enquiries go to the host or agent. Online purchase is not enabled for this listing.</p>
                <Link href="/naijastay/messages" className="mt-2 inline-flex w-full justify-center rounded-full bg-[#f26b21] px-4 py-2 text-[12px] font-extrabold text-white">Contact the host</Link>
              </div>
            )}
            <Link href="/naijastay/search" className="mt-2 flex items-center gap-1 text-[11px] font-bold text-[#0b5c33]"><ArrowLeft className="h-3 w-3" aria-hidden /> Back to search</Link>
          </aside>
        </div>
      </main>
      <StayFooter />
      <StayBottomNav />
    </div>
  );
}
