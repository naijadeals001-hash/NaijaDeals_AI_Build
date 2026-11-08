/**
 * Restores the Adaeze Moon demo artist and The African Dream show, which were
 * deleted by an over-broad test-cleanup (their names had been overwritten by
 * test runs). Recreates the artist, the show and its episodes from the owned
 * test audio and the existing artwork set.
 *
 * Usage: node prisma/stream-restore-adaeze.cjs
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

(async () => {
  const email = "adaeze-moon@naijastream.demo";
  const user = await prisma.user.upsert({
    where: { email },
    update: { name: "Adaeze Moon" },
    create: { email, name: "Adaeze Moon", passwordHash: hash("NaijaStreamDemo2026!"), actorType: "CUSTOMER" }
  });

  const artist = await prisma.streamArtist.upsert({
    where: { userId: user.id },
    update: {
      name: "Adaeze Moon",
      slug: "adaeze-moon",
      city: "Lagos",
      bio: "Afrobeats vocalist blending Lagos street energy with modern R&B. Fictional demonstration artist.",
      avatarUrl: `${V1}/stream-artist-adaeze.jpg`,
      genres: ["Afrobeats"],
      verified: true,
      isSample: true
    },
    create: {
      userId: user.id,
      name: "Adaeze Moon",
      slug: "adaeze-moon",
      city: "Lagos",
      countryCode: "NG",
      bio: "Afrobeats vocalist blending Lagos street energy with modern R&B. Fictional demonstration artist.",
      avatarUrl: `${V1}/stream-artist-adaeze.jpg`,
      genres: ["Afrobeats"],
      verified: true,
      verifiedAt: new Date(),
      isSample: true
    }
  });

  // Tracks that referenced this artist were removed with it; recreate them and
  // attach the existing owned audio files.
  const restoreTracks = [
    { title: "Lagos Nights", genre: "Afrobeats", seconds: 72, file: "track-lagos-nights", art: `${V2}/stream-v2-cover-afrobeats.jpg` },
    { title: "Brighter", genre: "Afrobeats", seconds: 64, file: "track-brighter", art: `${V2}/stream-v2-cover-chill.jpg` }
  ];
  for (const [index, track] of restoreTracks.entries()) {
    const slug = `${track.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-demo`;
    await prisma.streamTrack.upsert({
      where: { slug },
      update: { artistId: artist.id, status: "PUBLISHED" },
      create: {
        artistId: artist.id,
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
  }

  const show = await prisma.streamShow.upsert({
    where: { slug: "the-african-dream" },
    update: { artistId: artist.id, published: true },
    create: {
      artistId: artist.id,
      title: "The African Dream",
      slug: "the-african-dream",
      description: "Founders building African businesses, told in their own words.",
      category: "Business",
      coverUrl: `${V1}/stream-cover-podcast.jpg`,
      published: true,
      isSample: true
    }
  });

  const episodes = [
    { no: 1, title: "Building in Lagos", description: "Why founders start on the mainland." },
    { no: 2, title: "Money and trust", description: "How escrow changed the way people buy online." }
  ];
  for (const episode of episodes) {
    await prisma.streamEpisode.upsert({
      where: { slug: `the-african-dream-s1e${episode.no}` },
      update: { showId: show.id, status: "PUBLISHED" },
      create: {
        showId: show.id,
        title: episode.title,
        slug: `the-african-dream-s1e${episode.no}`,
        description: episode.description,
        audioUrl: `${AUDIO}/episode-founders-lagos.mp3`,
        durationSec: 95,
        season: 1,
        episodeNo: episode.no,
        status: "PUBLISHED",
        publishedAt: new Date(),
        isSample: true
      }
    });
  }

  const counts = {
    artists: await prisma.streamArtist.count({ where: { verified: true } }),
    shows: await prisma.streamShow.count({ where: { published: true } }),
    tracks: await prisma.streamTrack.count({ where: { status: "PUBLISHED" } })
  };
  console.log(JSON.stringify({ restored: { artist: artist.slug, show: show.slug, episodes: episodes.length }, ...counts }));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
