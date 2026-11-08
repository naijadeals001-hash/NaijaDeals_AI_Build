/**
 * NaijaStream podcast, video and live-event demonstration data.
 * All media is the platform's own synthesised audio/video (see
 * scripts/make-test-audio.mjs) — no third-party rights. Records are isSample
 * and hidden unless NAIJA_STREAM_SHOW_SAMPLES=true.
 *
 * Idempotent. Usage: node prisma/stream-media-seed.cjs
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const AUDIO = "/generated/stream/audio";
const SHOWS = [
  {
    slug: "the-african-dream",
    title: "The African Dream",
    category: "Business",
    description: "Founders building African businesses, told in their own words.",
    cover: "/generated/stream/opt/stream-cover-podcast.jpg",
    artist: "adaeze-moon",
    episodes: [
      { no: 1, title: "Building in Lagos", description: "Why founders start on the mainland.", file: "episode-founders-lagos.mp3", seconds: 95 },
      { no: 2, title: "Money and trust", description: "How escrow changed the way people buy online.", file: "episode-founders-lagos.mp3", seconds: 95 }
    ]
  },
  {
    slug: "tech-in-africa",
    title: "Tech in Africa",
    category: "Technology",
    description: "Product, engineering and infrastructure across the continent.",
    cover: "/generated/stream/opt-v2/stream-v2-cover-amapiano.jpg",
    artist: "tobi-vex",
    episodes: [
      { no: 1, title: "Shipping on mobile networks", description: "Designing for real bandwidth.", file: "track-deep-groove.mp3", seconds: 78 }
    ]
  }
];

const VIDEOS = [
  {
    slug: "live-in-lagos-clip",
    title: "Live in Lagos — stage clip",
    description: "Original test footage generated for NaijaStream (owned, no third-party rights).",
    poster: "/generated/stream/opt-v2/stream-v2-hero.jpg",
    artist: "kojo-mensah",
    seconds: 20
  }
];

(async () => {
  const artists = await prisma.streamArtist.findMany({ select: { id: true, slug: true } });
  const bySlug = Object.fromEntries(artists.map((a) => [a.slug, a.id]));
  let shows = 0;
  let episodes = 0;

  for (const show of SHOWS) {
    const row = await prisma.streamShow.upsert({
      where: { slug: show.slug },
      update: { title: show.title, description: show.description, category: show.category, coverUrl: show.cover, published: true, isSample: true },
      create: {
        artistId: bySlug[show.artist] ?? artists[0].id,
        title: show.title,
        slug: show.slug,
        description: show.description,
        category: show.category,
        coverUrl: show.cover,
        published: true,
        isSample: true
      }
    });
    shows += 1;
    for (const episode of show.episodes) {
      await prisma.streamEpisode.upsert({
        where: { slug: `${show.slug}-s1e${episode.no}` },
        update: { title: episode.title, description: episode.description, audioUrl: `${AUDIO}/${episode.file}`, durationSec: episode.seconds, status: "PUBLISHED", isSample: true },
        create: {
          showId: row.id,
          title: episode.title,
          slug: `${show.slug}-s1e${episode.no}`,
          description: episode.description,
          audioUrl: `${AUDIO}/${episode.file}`,
          durationSec: episode.seconds,
          season: 1,
          episodeNo: episode.no,
          status: "PUBLISHED",
          publishedAt: new Date(),
          isSample: true
        }
      });
      episodes += 1;
    }
  }

  for (const video of VIDEOS) {
    await prisma.streamVideo.upsert({
      where: { slug: video.slug },
      update: { title: video.title, description: video.description, posterUrl: video.poster, durationSec: video.seconds, status: "PUBLISHED", isSample: true },
      create: {
        artistId: bySlug[video.artist] ?? null,
        title: video.title,
        slug: video.slug,
        description: video.description,
        videoUrl: `${AUDIO}/clip-live-lagos.mp4`,
        posterUrl: video.poster,
        durationSec: video.seconds,
        kind: "MUSIC_VIDEO",
        status: "PUBLISHED",
        publishedAt: new Date(),
        isSample: true
      }
    });
  }

  // Live events: one upcoming, one ended (honest states, no fake LIVE).
  const events = [
    { slug: "afrovibes-live-lagos", title: "AfroVibes Live Lagos", status: "UPCOMING", days: 7, art: "/generated/stream/opt-v2/stream-v2-hero.jpg", description: "An evening of Afrobeats with the NaijaStream community." },
    { slug: "amapiano-sessions-replay", title: "Amapiano Sessions — replay", status: "ENDED", days: -3, art: "/generated/stream/opt-v2/stream-v2-cover-amapiano.jpg", description: "A late-night Amapiano session. Recording pending." }
  ];
  const organizer = await prisma.streamArtist.findUnique({ where: { slug: "adaeze-moon" }, select: { userId: true } });
  for (const event of events) {
    const startsAt = new Date(Date.now() + event.days * 86400000);
    await prisma.streamLiveEvent.upsert({
      where: { slug: event.slug },
      update: { title: event.title, startsAt, artworkUrl: event.art, description: event.description, organizerId: organizer?.userId ?? null },
      create: { title: event.title, slug: event.slug, status: "UPCOMING", startsAt, artworkUrl: event.art, description: event.description, isFree: true, organizerId: organizer?.userId ?? null, isSample: true }
    });
  }

  console.log(JSON.stringify({ shows, episodes, videos: VIDEOS.length, events: events.length }));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
