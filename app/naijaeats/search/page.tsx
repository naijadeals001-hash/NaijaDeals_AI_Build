import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Search — NaijaEats" };

/** The header search posts here; discovery lives in one filtered view. */
export default function EatsSearchPage({ searchParams }: { searchParams: { q?: string } }) {
  redirect(`/naijaeats/restaurants?q=${encodeURIComponent(searchParams.q ?? "")}`);
}
