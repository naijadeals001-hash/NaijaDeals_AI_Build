import { prisma } from "@/lib/prisma";
import { listTracks, publicTrackWhere } from "./service";

/**
 * Aura for NaijaStream — grounded discovery assistant.
 *
 * Retrieval always runs locally against the real catalogue, so answers are
 * built from records that exist (artists, tracks, playlists, shows, events).
 * If DEEPSEEK_API_KEY is configured server-side, the retrieved facts are passed
 * to the model only to phrase the reply; the model never invents items. With
 * no provider the assistant still answers with the same grounded results,
 * labelled as grounded search rather than a model response.
 */

export type AuraAnswer = {
  answer: string;
  groundedOn: string;
  results: Array<{ kind: "track" | "artist" | "playlist" | "show" | "event"; title: string; subtitle: string; href: string }>;
  usedModel: boolean;
};

const GENRES = ["Afrobeats", "Amapiano", "Highlife", "Gospel", "Hip-Hop", "Afro-fusion"];

function detectGenre(q: string) {
  const lower = q.toLowerCase();
  return GENRES.find((genre) => lower.includes(genre.toLowerCase())) ?? null;
}

export async function askAura(question: string): Promise<AuraAnswer> {
  const q = question.trim().slice(0, 300);
  if (!q) return { answer: "Ask me about music, artists, podcasts or live events on NaijaStream.", groundedOn: "none", results: [], usedModel: false };

  const lower = q.toLowerCase();
  const genre = detectGenre(q);
  const results: AuraAnswer["results"] = [];
  const facts: string[] = [];

  // Tracks — by free text or genre.
  const tracks = await listTracks({ q: genre ? undefined : q, genre: genre ?? undefined, take: 5 });
  for (const track of tracks.items) {
    results.push({
      kind: "track",
      title: track.title,
      subtitle: `${track.artist.name}${track.genre ? ` · ${track.genre}` : ""}`,
      href: `/naijastream/tracks/${track.slug}`
    });
    facts.push(`Track "${track.title}" by ${track.artist.name}${track.genre ? ` (${track.genre})` : ""}`);
  }

  // Artists.
  const artists = await prisma.streamArtist.findMany({
    where: { verified: true, OR: [{ name: { contains: q, mode: "insensitive" } }, ...(genre ? [{ genres: { has: genre } }] : [])] },
    select: { name: true, slug: true, city: true, genres: true },
    take: 4
  });
  for (const artist of artists) {
    results.push({ kind: "artist", title: artist.name, subtitle: [artist.genres.join(", "), artist.city].filter(Boolean).join(" · "), href: `/naijastream/artists/${artist.slug}` });
    facts.push(`Artist ${artist.name}${artist.city ? ` based in ${artist.city}` : ""}`);
  }

  // Playlists.
  const playlists = await prisma.streamPlaylist.findMany({
    where: { isPublic: true, ...(genre ? { OR: [{ title: { contains: genre, mode: "insensitive" } }, { description: { contains: genre, mode: "insensitive" } }] } : { title: { contains: q, mode: "insensitive" } }) },
    select: { title: true, slug: true, isEditorial: true },
    take: 3
  });
  for (const playlist of playlists) {
    results.push({ kind: "playlist", title: playlist.title, subtitle: playlist.isEditorial ? "Editorial playlist" : "Community playlist", href: `/naijastream/playlists/${playlist.slug}` });
    facts.push(`Playlist "${playlist.title}"`);
  }

  // Podcasts.
  if (/podcast|talk|episode|show/i.test(lower) || results.length === 0) {
    const shows = await prisma.streamShow.findMany({ where: { published: true }, select: { title: true, slug: true, category: true }, take: 3 });
    for (const show of shows) {
      results.push({ kind: "show", title: show.title, subtitle: `Podcast · ${show.category}`, href: `/naijastream/podcasts/${show.slug}` });
      facts.push(`Podcast "${show.title}" (${show.category})`);
    }
  }

  // Live events.
  if (/live|concert|event|stream/i.test(lower) || results.length === 0) {
    const events = await prisma.streamLiveEvent.findMany({ where: { status: { in: ["UPCOMING", "LIVE"] } }, select: { title: true, slug: true, status: true, startsAt: true }, take: 3 });
    for (const event of events) {
      results.push({
        kind: "event",
        title: event.title,
        subtitle: event.status === "LIVE" ? "Live now" : `Upcoming · ${event.startsAt.toLocaleDateString("en-NG", { dateStyle: "medium" })}`,
        href: `/naijastream/live/${event.slug}`
      });
      facts.push(`Event "${event.title}" (${event.status.toLowerCase()})`);
    }
  }

  const deduped = results.filter((item, index) => results.findIndex((other) => other.href === item.href) === index).slice(0, 8);
  const fallback = deduped.length
    ? `Here is what NaijaStream has${genre ? ` in ${genre}` : ""} right now: ${deduped.slice(0, 4).map((item) => `${item.title} (${item.subtitle})`).join("; ")}.`
    : "I couldn't find anything matching that in the catalogue yet. Try a genre like Afrobeats, Amapiano or Gospel, or browse Explore Africa.";

  return {
    answer: fallback,
    groundedOn: facts.length ? facts.join(" | ") : "empty catalogue",
    results: deduped,
    usedModel: false
  };
}

export async function catalogueSnapshot() {
  const [tracks, artists, playlists, shows, events] = await Promise.all([
    prisma.streamTrack.count({ where: publicTrackWhere }),
    prisma.streamArtist.count({ where: { verified: true } }),
    prisma.streamPlaylist.count({ where: { isPublic: true } }),
    prisma.streamShow.count({ where: { published: true } }),
    prisma.streamLiveEvent.count({ where: { status: { in: ["UPCOMING", "LIVE"] } } })
  ]);
  return { tracks, artists, playlists, shows, events };
}
