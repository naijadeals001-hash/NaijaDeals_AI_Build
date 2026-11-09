import type { Metadata } from "next";
import { listFarms } from "@/lib/services/fresh/catalogue";
import { FarmerCard } from "@/components/fresh/fresh-sections";
import { farmImage } from "@/lib/services/fresh/images";
import { FreshEmpty, FreshHeading, FreshPage } from "@/components/fresh/fresh-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Our farmers — NaijaFresh", description: "Meet the verified African farms selling on NaijaFresh.", alternates: { canonical: "/naijafresh/farmers" } };

export default async function FreshFarmersPage() {
  const farms = await listFarms(60);
  return (
    <FreshPage>
      <FreshHeading eyebrow="Farmers" title="Meet Our Farmers" description="Farms selling on NaijaFresh. Every farm is checked before its produce is listed. Farms labelled Demo are demonstration records created to exercise the marketplace while real farmer onboarding completes." />
      {farms.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {farms.map((farm) => <FarmerCard key={farm.id} farm={farm} variant="grid" image={farmImage(farm.slug, farm.avatarUrl)} />)}
        </ul>
      ) : (
        <FreshEmpty title="No verified farms yet" body="Farms appear here once NaijaFresh has verified their details." cta={{ href: "/naijafresh/farmers/apply", label: "Register as a farmer" }} />
      )}
    </FreshPage>
  );
}
