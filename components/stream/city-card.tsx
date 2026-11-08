import Link from "next/link";

/**
 * Country flag as a real flag emoji derived from the ISO country code, so the
 * card needs no extra asset and stays correct for every city in the catalogue.
 */
export function countryFlag(countryCode: string) {
  const code = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));
}

export type CityCardData = {
  slug: string;
  name: string;
  countryCode: string;
  countryName: string;
  imageUrl: string | null;
  artists: number;
  tracks: number;
};

/**
 * Explore Africa city card. The approved city illustration is the dominant
 * element; the label block sits on a dark gradient so name, country, flag and
 * real catalogue counts stay legible over any photograph.
 */
export function CityCard({
  city,
  className = "",
  sizes = "(min-width: 1280px) 20vw, (min-width: 768px) 33vw, 60vw"
}: {
  city: CityCardData;
  className?: string;
  sizes?: string;
}) {
  const flag = countryFlag(city.countryCode);
  return (
    <Link
      href={`/naijastream/cities/${city.slug}`}
      data-city={city.slug}
      className={`group relative block overflow-hidden rounded-2xl border border-white/10 bg-[#0b2018] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C99520] ${className}`}
    >
      {city.imageUrl ? (
        <img
          src={city.imageUrl}
          alt={`${city.name}, ${city.countryName} — AI-generated city illustration`}
          sizes={sizes}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.06]"
        />
      ) : (
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,#0f7a4a33,transparent_60%)]" aria-hidden />
      )}
      <span
        className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/5 transition group-hover:from-black/95"
        aria-hidden
      />
      <span className="relative flex h-full flex-col justify-end p-3">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/80">
          <span aria-hidden className="text-[13px] leading-none">
            {flag}
          </span>
          {city.countryName}
        </span>
        <span className="mt-0.5 block truncate font-display text-[17px] font-extrabold leading-tight text-white drop-shadow">
          {city.name}
        </span>
        <span className="mt-1 block text-[10.5px] font-semibold text-emerald-300">
          {city.artists > 0
            ? `${city.artists} artist${city.artists === 1 ? "" : "s"} · ${city.tracks} track${city.tracks === 1 ? "" : "s"}`
            : "Open market — accepting creators"}
        </span>
      </span>
    </Link>
  );
}
