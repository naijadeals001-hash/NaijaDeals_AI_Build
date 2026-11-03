import type { Metadata } from "next";
import foodCredits from "../../public/food/credits.json";
import catalogCredits from "../../public/products/catalog/credits.json";

export const metadata: Metadata = { title: "Photography credits" };

type Credit = { slug: string; file: string; license: string; artist: string; url: string };

export default function Page() {
  const rows = [...(foodCredits as Credit[]), ...(catalogCredits as Credit[])];
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <p className="text-xs font-black uppercase tracking-wide text-primary">NaijaDeals</p>
        <h1 className="font-display text-3xl font-extrabold">Photography credits</h1>
        <p className="mt-1 text-sm text-muted">
          Food and product photography used on NaijaEats and NaijaShop is sourced from Wikimedia Commons under the licences listed below.
          Product and brand artwork is credited in the design documentation.
        </p>
      </header>
      <ul className="divide-y divide-border-soft rounded-2xl border border-border-soft bg-canvas">
        {rows.map((row) => (
          <li key={row.slug} className="p-4 text-sm">
            <p className="font-bold">{row.file.replace(/^File:/, "")}</p>
            <p className="text-xs text-muted">{row.artist} · {row.license}</p>
            <a href={row.url} className="text-xs font-bold text-primary underline" target="_blank" rel="noreferrer noopener">
              Source on Wikimedia Commons
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
