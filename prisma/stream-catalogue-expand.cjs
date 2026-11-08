/**
 * Expands the demonstration catalogue to the depth of the approved desktop
 * reference: more artists, tracks and 8 editorial playlists. Uses EXISTING
 * Kie.ai artwork (no new generation) and the owned test audio files.
 * All rows are isSample (hidden unless NAIJA_STREAM_SHOW_SAMPLES=true).
 *
 * Usage: node prisma/stream-catalogue-expand.cjs
 */
const { PrismaClient } = require("@prisma/client");
const { scryptSync, randomBytes } = require("node:crypto");

const prisma = new PrismaClient();
const hash = (p) => {
  const s = randomBytes(16);
  return `scrypt$${s.toString("hex")}$${scryptSync(p, s, 64).toString("hex")}`;
};

const AUDIO = "/generated/stream/audio";
const V2 = "/generated/stream/opt-v2";
const V1 = "/generated/stream/opt";

const ARTISTS = [
  { slug: "chinaza-oke", name: "Chinaza Oke", city: "Lagos", genre: "Afro-fusion", avatar: `${V1}/stream-artist-adaeze.jpg`, headline: "Afro-fusion songwriter blending soul and juju" },
  { slug: "bisi-alade", name: "Bisi Alade", city: "Lagos", genre: "Highlife", avatar: `${V1}/stream-artist-amaka.jpg`, headline: "Highlife torch singer with a modern band" }
];

const TRACKS = [
  { artist: "chinaza-oke", title: "Owerri Nights", genre: "Afro-fusion", seconds: 74, file: "track-highlife-soul", art: `${V2}/stream-v2-cover-chill.jpg` },
  { artist: "chinaza-oke", title: "Golden Hour", genre: "Afro-fusion", seconds: 68, file: "track-morning-light", art: `${V2}/stream-v2-cover-gospel.jpg` },
  { artist: "bisi-alade", title: "Market Street", genre: "Highlife", seconds: 72, file: "track-brighter", art: `${V2}/stream-v2-cover-afrobeats.jpg` },
  { artist: "bisi-alade", title: "Sunday Best", genre: "Highlife", seconds: 66, file: "track-grateful-heart", art: `${V2}/stream-v2-cover-chill.jpg` },
  { artist: "adaeze-moon", title: "Eko Lights", genre: "Afrobeats", seconds: 70, file: "track-lagos-nights", art: `${V2}/stream-v2-cover-afrobeats.jpg` },
  { artist: "kunle-ave", title: "Third Mainland", genre: "Hip-Hop", seconds: 76, file: "track-mainland-flow", art: `${V2}/stream-v2-cover-hiphop.jpg` },
  { artist: "zainab-ke", title: "Log Drum", genre: "Amapiano", seconds: 80, file: "track-deep-groove", art: `${V2}/stream-v2-cover-amapiano.jpg` }
];

const PLAYLISTS = [
  { title: "Afrobeats Hits", slug: "afrobeats-hits", cover: `${V2}/stream-v2-cover-afrobeats.jpg`, description: "The biggest Afrobeats energy on NaijaStream." },
  { title: "Amapiano Mix", slug: "amapiano-mix", cover: `${V2}/stream-v2-cover-amapiano.jpg`, description: "Deep logs and sunset grooves." },
  { title: "Naija Hip Hop", slug: "naija-hip-hop", cover: `${V2}/stream-v2-cover-hiphop.jpg`, description: "Bars and beats from the mainland." },
  { title: "Gospel Flow", slug: "gospel-flow", cover: `${V2}/stream-v2-cover-gospel.jpg`, description: "Lift your morning with African gospel." },
  { title: "Chill Africa", slug: "chill-africa", cover: `${V2}/stream-v2-cover-chill.jpg`, description: "Calm sounds for focus and rest." },
  { title: "Workout Vibes", slug: "workout-vibes", cover: `${V2}/stream-v2-cover-hiphop.jpg`, description: "High-tempo tracks to move to." },
  { title: "Love & R&B", slug: "love-and-rnb", cover: `${V2}/stream-v2-cover-gospel.jpg`, description: "Slow jams and love songs from Africa." },
  { title: "African Classics", slug: "african-classics", cover: `${V2}/stream-v2-cover-afrobeats.jpg`, description: "Highlife and Afro-fusion standards." }
];

const GENRES_FOR = {
  "afrobeats-hits": ["Afrobeats", "Afro-fusion"],
  "amapiano-mix": ["Amapiano"],
  "naija-hip-hop": ["Hip-Hop"],
  "gospel-flow": ["Gospel"],
  "chill-africa": ["Afro-fusion", "Highlife"],
  "workout-vibes": ["Hip-Hop", "Amapiano"],
  "love-and-rnb": ["Afrobeats", "Gospel"],
  "african-classics": ["Highlife", "Afro-fusion"]
};

(async () => {
  for (const artist of ARTISTS) {
    const email = `${artist.slug}@naijastream.demo`;
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name: artist.name, passwordHash: hash("NaijaStreamDemo2026!"), actorType: "CUSTOMER" }
    });
    await prisma.streamArtist.upsert({
      where: { userId: user.id },
      update: { name: artist.name, city: artist.city, bio: artist.headline, avatarUrl: artist.avatar, verified: true, isSample: true },
      create: {
        userId: user.id,
        name: artist.name,
        slug: artist.slug,
        city: artist.city,
        countryCode: "NG",
        bio: `${artist.headline}. Fictional demonstration artist on NaijaStream.`,
        avatarUrl: artist.avatar,
        genres: [artist.genre],
        verified: true,
        verifiedAt: new Date(),
        isSample: true
      }
    });
  }

  const bySlug = Object.fromEntries((await prisma.streamArtist.findMany({ select: { slug: true, id: true } })).map((a) => [a.slug, a.id]));
  let added = 0;
  for (const [index, track] of TRACKS.entries()) {
    const slug = `${track.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-demo`;
    const exists = await prisma.streamTrack.findUnique({ where: { slug }, select: { id: true } });
    if (exists) continue;
    const artistId = bySlug[track.artist];
    if (!artistId) continue;
    await prisma.streamTrack.create({
      data: {
        artistId,
        title: track.title,
        slug,
        durationSec: track.seconds,
        artworkUrl: track.art,
        audioUrl: `${AUDIO}/${track.file}.mp3`,
        genre: track.genre,
        status: "PUBLISHED",
        publishedAt: new Date(Date.now() - index * 86400000),
        rightsDeclared: true,
        isSample: true
      }
    });
    added += 1;
  }

  for (const playlist of PLAYLISTS) {
    await prisma.streamPlaylist.upsert({
      where: { slug: playlist.slug },
      update: { title: playlist.title, description: playlist.description, coverUrl: playlist.cover, isEditorial: true, isPublic: true, isSample: true },
      create: { title: playlist.title, slug: playlist.slug, description: playlist.description, coverUrl: playlist.cover, isEditorial: true, isPublic: true, isSample: true }
    });
  }

  const allTracks = await prisma.streamTrack.findMany({ where: { status: "PUBLISHED" }, select: { id: true, genre: true } });
  for (const [slug, genres] of Object.entries(GENRES_FOR)) {
    const playlist = await prisma.streamPlaylist.findUnique({ where: { slug }, select: { id: true } });
    if (!playlist) continue;
    await prisma.streamPlaylistItem.deleteMany({ where: { playlistId: playlist.id } });
    const picks = allTracks.filter((t) => t.genre && genres.includes(t.genre)).slice(0, 8);
    for (const [index, track] of picks.entries()) {
      await prisma.streamPlaylistItem
        .create({ data: { playlistId: playlist.id, trackId: track.id, position: index + 1 } })
        .catch(() => undefined);
    }
  }

  const counts = {
    artists: await prisma.streamArtist.count({ where: { verified: true } }),
    tracks: await prisma.streamTrack.count({ where: { status: "PUBLISHED" } }),
    playlists: await prisma.streamPlaylist.count({ where: { isEditorial: true } })
  };
  console.log(JSON.stringify({ tracksAdded: added, ...counts }));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
