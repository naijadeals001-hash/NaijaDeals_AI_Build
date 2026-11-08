import Link from "next/link";
import { notFound } from "next/navigation";
import { CameraOff, MapPin, Radio } from "lucide-react";
import { getCityBySlug } from "@/lib/services/stream/cities";
import { CityTrackList } from "@/components/stream/city-track-list";
import { CoverArt } from "@/components/stream/cover-art";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const data = await getCityBySlug(params.slug);
  if (!data) return { title: "City not found — NaijaStream" };
  return { title: `${data.city.name} — NaijaStream`, description: `Music, podcasts and events from ${data.city.name}, ${data.city.countryName}.` };
}

function shortDate(value: Date) {
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(new Date(value));
}

export default async function CityPage({ params }: { params: { slug: string } }) {
  const data = await getCityBySlug(params.slug);
  if (!data) notFound();
  const { city, artists, tracks, shows, events, genres } = data;
  const hasContent = artists.length > 0 || tracks.length > 0 || shows.length > 0 || events.length > 0;

  return (
    <main className="px-4 py-6 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-[11.5px] text-white/45">
        <Link href="/naijastream/explore" className="hover:text-white">Explore Africa</Link>
        <span aria-hidden> / </span>
        <span className="text-white/70">{city.region}</span>
      </nav>

      <header className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-[#101613]">
        <div className="relative h-40 sm:h-56">
          {city.imageUrl ? (
            <>
              <img src={city.imageUrl} alt={`${city.name}, ${city.countryName}`} className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#101613] via-black/40 to-transparent" aria-hidden />
            </>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-emerald-900 to-[#0b0f0d] text-center">
              <CameraOff className="h-6 w-6 text-white/40" aria-hidden />
              <p className="text-[12px] font-semibold text-white/60">City photo pending approval</p>
              <p className="max-w-sm px-6 text-[11px] text-white/40">We show no picture rather than an unrelated one. Approved photography is added by the platform team.</p>
            </div>
          )}
          <div className="absolute bottom-3 left-4">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-300">
              <MapPin className="h-3.5 w-3.5" aria-hidden /> {city.countryName} · {city.region}
            </p>
            <h1 className="font-display text-[28px] font-extrabold leading-tight text-white">{city.name}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          {genres.slice(0, 8).map((genre) => (
            <Link
              key={genre}
              href={`/naijastream/music?genre=${encodeURIComponent(genre)}`}
              className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-white/75 hover:border-emerald-400/60 hover:text-white"
            >
              {genre}
            </Link>
          ))}
        </div>
      </header>

      {!hasContent ? (
        <section className="mt-5 rounded-xl border border-dashed border-white/15 p-8 text-center">
          <p className="text-[13px] font-bold text-white/75">No published {city.name} content yet</p>
          <p className="mx-auto mt-1 max-w-md text-[12px] leading-6 text-white/50">
            {city.name} is an open market on NaijaStream. Artists, podcasters and venues there can publish through the creator studio; nothing is
            invented to fill the page.
          </p>
          <Link href="/naijastream/studio" className="mt-3 inline-block rounded-full bg-emerald-500 px-4 py-2 text-[12px] font-bold text-black">
            Open creator studio
          </Link>
        </section>
      ) : null}

      {artists.length > 0 ? (
        <section className="mt-6" aria-labelledby="city-artists">
          <h2 id="city-artists" className="font-display text-[18px] font-extrabold">Artists in {city.name}</h2>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {artists.map((artist) => (
              <li key={artist.id}>
                <Link href={`/naijastream/artists/${artist.slug}`} className="block rounded-xl bg-[#131a16] p-2 hover:bg-[#172019]">
                  <CoverArt src={artist.avatarUrl} title={artist.name} className="aspect-square w-full rounded-lg" />
                  <span className="mt-1.5 block truncate text-[12.5px] font-bold">{artist.name}</span>
                  <span className="block truncate text-[10.5px] text-white/45">{artist.genres.slice(0, 2).join(" · ") || "Artist"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tracks.length > 0 ? (
        <section className="mt-6" aria-labelledby="city-music">
          <h2 id="city-music" className="font-display text-[18px] font-extrabold">Music from {city.name}</h2>
          <CityTrackList tracks={tracks} />
        </section>
      ) : null}

      {shows.length > 0 ? (
        <section className="mt-6" aria-labelledby="city-podcasts">
          <h2 id="city-podcasts" className="font-display text-[18px] font-extrabold">Podcasts</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shows.map((show) => (
              <li key={show.id}>
                <Link href={`/naijastream/podcasts/${show.slug}`} className="flex gap-3 rounded-xl bg-[#131a16] p-3 hover:bg-[#172019]">
                  <CoverArt src={show.coverUrl} title={show.title} className="h-16 w-16 shrink-0 rounded-lg" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-bold">{show.title}</span>
                    <span className="block text-[11px] text-[#8B5CF6]">{show.category}</span>
                    <span className="block text-[10.5px] text-white/45">{show.artist.name} · {show._count.episodes} ep · {show.language}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {events.length > 0 ? (
        <section className="mt-6" aria-labelledby="city-events">
          <h2 id="city-events" className="font-display text-[18px] font-extrabold">Live events</h2>
          <ul className="mt-3 space-y-2">
            {events.map((event) => (
              <li key={event.id}>
                <Link href={`/naijastream/live/${event.slug}`} className="flex items-center gap-3 rounded-xl border border-[#F97316]/40 bg-[#F97316]/10 p-3">
                  <Radio className="h-4 w-4 text-[#F97316]" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold">{event.title}</span>
                    <span className="block text-[10.5px] text-white/50">{event.status === "ENDED" ? "Replay" : event.status} · {shortDate(event.startsAt)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
