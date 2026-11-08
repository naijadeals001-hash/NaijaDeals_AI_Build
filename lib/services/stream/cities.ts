import { prisma } from "@/lib/prisma";
import { publicTrackWhere, showSamples } from "./service";
import { AFRICA_REGIONS } from "@/lib/stream/regions";

/**
 * Editorial city catalogue and per-city discovery.
 *
 * A city card only claims content that actually exists: artist and track
 * counts come from published catalogue rows whose artist record carries that
 * city. Cities with no local catalogue entries still appear (they are real
 * planned markets) but are labelled as awaiting creators instead of showing
 * invented activity.
 */

export type CityRegion = (typeof AFRICA_REGIONS)[number];

export { AFRICA_REGIONS };

export type CityCard = {
  slug: string;
  name: string;
  countryCode: string;
  countryName: string;
  region: string;
  genres: string[];
  imageUrl: string | null;
  featured: boolean;
  artists: number;
  tracks: number;
};

export async function listCities(): Promise<CityCard[]> {
  const [cities, counts] = await Promise.all([
    prisma.streamCity.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }).catch(() => []),
    prisma.streamArtist.groupBy({
      by: ["city"],
      where: { verified: true, city: { not: null }, ...(showSamples ? {} : { isSample: false }) },
      _count: { _all: true }
    }).catch(() => [])
  ]);
  const artistByCity = new Map(counts.filter((row) => row.city).map((row) => [(row.city as string).toLowerCase(), row._count._all]));
  const trackRows = await prisma.streamTrack
    .findMany({ where: publicTrackWhere, select: { artist: { select: { city: true } } } })
    .catch(() => []);
  const trackByCity = new Map<string, number>();
  for (const row of trackRows) {
    const city = row.artist?.city?.toLowerCase();
    if (city) trackByCity.set(city, (trackByCity.get(city) ?? 0) + 1);
  }

  return cities.map((city) => ({
    slug: city.slug,
    name: city.name,
    countryCode: city.countryCode,
    countryName: city.countryName,
    region: city.region,
    genres: city.genres,
    imageUrl: city.imageUrl,
    featured: city.featured,
    artists: artistByCity.get(city.name.toLowerCase()) ?? 0,
    tracks: trackByCity.get(city.name.toLowerCase()) ?? 0
  }));
}

export async function getCityBySlug(slug: string) {
  const city = await prisma.streamCity.findUnique({ where: { slug } });
  if (!city) return null;
  const cards = await listCities();
  const card = cards.find((row) => row.slug === slug) ?? null;

  const cityName = city.name;
  const artists = await prisma.streamArtist.findMany({
    where: { verified: true, city: { equals: cityName, mode: "insensitive" }, ...(showSamples ? {} : { isSample: false }) },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      bio: true,
      avatarUrl: true,
      genres: true,
      countryCode: true,
      tracks: { where: publicTrackWhere, select: { id: true, title: true, slug: true, artworkUrl: true, durationSec: true, genre: true, audioUrl: true } }
    }
  });

  const artistIds = artists.map((artist) => artist.id);
  const [tracks, shows, events] = await Promise.all([
    prisma.streamTrack.findMany({
      where: { ...publicTrackWhere, artistId: { in: artistIds } },
      take: 20,
      select: {
        id: true,
        title: true,
        slug: true,
        durationSec: true,
        artworkUrl: true,
        genre: true,
        audioUrl: true,
        artist: { select: { id: true, name: true, slug: true, avatarUrl: true } }
      }
    }).catch(() => []),
    artistIds.length
      ? prisma.streamShow
          .findMany({
            where: { published: true, artistId: { in: artistIds }, ...(showSamples ? {} : { isSample: false }) },
            select: { id: true, title: true, slug: true, coverUrl: true, category: true, language: true, artist: { select: { name: true, slug: true } }, _count: { select: { episodes: true } } }
          })
          .catch(() => [])
      : Promise.resolve([]),
    prisma.streamLiveEvent
      .findMany({
        where: { title: { contains: cityName, mode: "insensitive" } },
        select: { id: true, title: true, slug: true, status: true, startsAt: true, artworkUrl: true }
      })
      .catch(() => [])
  ]);

  const genres = [...new Set([...artists.flatMap((artist) => artist.genres), ...city.genres])];

  return {
    city: { ...city, artists: card?.artists ?? artists.length, tracks: card?.tracks ?? tracks.length },
    artists,
    tracks,
    shows,
    events,
    genres
  };
}

/** Image coverage across the city catalogue (used by the admin view and QA). */
export async function cityImageCoverage() {
  const cities = await prisma.streamCity.findMany({ select: { slug: true, name: true, imageUrl: true, region: true } });
  const missing = cities.filter((city) => !city.imageUrl).map((city) => ({ slug: city.slug, name: city.name, region: city.region }));
  return { total: cities.length, withImage: cities.length - missing.length, missing };
}
