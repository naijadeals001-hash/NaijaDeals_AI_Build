import { NextResponse } from "next/server";
import { jsonSafe } from "@/lib/services/core/serialize";
import { listGigCategories, listGigSpotlights, getGigSiteConfig } from "@/lib/services/gigs/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const [categories, spotlight, config] = await Promise.all([
    listGigCategories(),
    listGigSpotlights(),
    getGigSiteConfig()
  ]);
  return NextResponse.json(jsonSafe({ categories, spotlights: spotlight, config }));
}
