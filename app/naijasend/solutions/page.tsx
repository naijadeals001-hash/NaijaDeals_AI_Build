import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-static";

export const metadata: Metadata = { title: "Solutions — NaijaSend" };

/** Solutions are presented on the homepage rail; this route keeps their links working. */
export default function SolutionsPage() {
  redirect("/naijasend");
}
