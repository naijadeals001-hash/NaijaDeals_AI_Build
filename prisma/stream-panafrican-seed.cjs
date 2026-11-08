/**
 * Pan-African demonstration catalogue: fictional artists in five African
 * countries, one real (platform-owned, synthesised) audio asset per artist,
 * and eight published shows across distinct categories.
 *
 * Every row is isSample=true and hidden unless NAIJA_STREAM_SHOW_SAMPLES=true.
 * Names are invented; no real artist likeness or catalogue is used. Artwork is
 * only referenced when the asset is platform-owned and thematically neutral;
 * artists awaiting a Kie.ai portrait are left without an avatar so the UI shows
 * an initial rather than another artist's face.
 *
 * Idempotent. Usage: node prisma/stream-panafrican-seed.cjs
 */
const { PrismaClient } = require("@prisma/client");
const { scryptSync, randomBytes } = require("node:crypto");

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, 64).toString("hex")}`;
}

const AUDIO = "/generated/stream/audio";
const COVER = {
  afrobeats: "/generated/stream/opt-v2/stream-v2-cover-afrobeats.jpg",
  amapiano: "/generated/stream/opt-v2/stream-v2-cover-amapiano.jpg",
  gospel: "/generated/stream/opt-v2/stream-v2-cover-gospel.jpg",
  hiphop: "/generated/stream/opt-v2/stream-v2-cover-hiphop.jpg",
  chill: "/generated/stream/opt-v2/stream-v2-cover-chill.jpg",
  podcast: "/generated/stream/opt/stream-cover-podcast.jpg",
  live: "/generated/stream/opt/stream-cover-live.jpg"
};

const ARTISTS = [
  {
    slug: "abena-sankofa",
    name: "Abena Sankofa",
    email: "abena.sankofa@naijastream.demo",
    countryCode: "GH",
    city: "Accra",
    genres: ["Hiplife", "Highlife"],
    bio: "Fictional Hiplife artist from Accra blending Twi rap with highlife guitar. Demonstration catalogue entry.",
    track: { title: "Accra Nights", slug: "accra-nights-demo", genre: "Hiplife", seconds: 76, file: "track-accra-nights.mp3", art: COVER.afrobeats, language: "Twi" }
  },
  {
    slug: "aminata-diop",
    name: "Aminata Diop",
    email: "aminata.diop@naijastream.demo",
    countryCode: "SN",
    city: "Dakar",
    genres: ["Mbalax", "Afro-fusion"],
    bio: "Fictional Dakar vocalist working in the Mbalax tradition. Demonstration catalogue entry.",
    track: { title: "Dakar Waves", slug: "dakar-waves-demo", genre: "Mbalax", seconds: 82, file: "track-dakar-waves.mp3", art: COVER.chill, language: "Wolof" }
  },
  {
    slug: "wanjiru-kamau",
    name: "Wanjiru Kamau",
    email: "wanjiru.kamau@naijastream.demo",
    countryCode: "KE",
    city: "Nairobi",
    genres: ["Bongo Flava", "Gengetone"],
    bio: "Fictional Nairobi singer-songwriter in the East African bongo-pop lane. Demonstration catalogue entry.",
    track: { title: "Nairobi Morning", slug: "nairobi-morning-demo", genre: "Bongo Flava", seconds: 70, file: "track-nairobi-morning.mp3", art: COVER.gospel, language: "Swahili" }
  },
  {
    slug: "thandiwe-mokoena",
    name: "Thandiwe Mokoena",
    email: "thandiwe.mokoena@naijastream.demo",
    countryCode: "ZA",
    city: "Johannesburg",
    genres: ["Amapiano", "Afro-house"],
    bio: "Fictional Johannesburg producer and DJ in the amapiano scene. Demonstration catalogue entry.",
    track: { title: "Joburg Log Drum", slug: "joburg-log-drum-demo", genre: "Amapiano", seconds: 86, file: "track-joburg-log.mp3", art: COVER.amapiano, language: "isiZulu" }
  },
  {
    slug: "moise-kabangu",
    name: "Moïse Kabangu",
    email: "moise.kabangu@naijastream.demo",
    countryCode: "CD",
    city: "Kinshasa",
    genres: ["Soukous", "Rumba"],
    bio: "Fictional Kinshasa guitarist working in the modern rumba tradition. Demonstration catalogue entry.",
    track: { title: "Kinshasa Rumba", slug: "kinshasa-rumba-demo", genre: "Rumba", seconds: 90, file: "track-kinshasa-rumba.mp3", art: COVER.hiphop, language: "Lingala" }
  },
  {
    slug: "yasmine-benali",
    name: "Yasmine Benali",
    email: "yasmine.benali@naijastream.demo",
    countryCode: "MA",
    city: "Casablanca",
    genres: ["Chaabi", "Gnawa"],
    bio: "Fictional Casablanca vocalist bridging Gnawa rhythm with contemporary North African pop. Demonstration catalogue entry.",
    track: { title: "Casablanca Dusk", slug: "casablanca-dusk-demo", genre: "Gnawa", seconds: 80, file: "track-algiers-rai.mp3", art: COVER.live, language: "Darija" }
  }
];

const SHOWS = [
  {
    slug: "money-moves-africa",
    title: "Money Moves Africa",
    category: "Business & Entrepreneurship",
    language: "English",
    country: "GH",
    description: "Founders and operators across the continent on building African businesses. Demonstration show.",
    cover: COVER.afrobeats,
    episodes: 1
  },
  {
    slug: "culture-unfiltered",
    title: "Culture Unfiltered",
    category: "Culture & Heritage",
    language: "English",
    country: "NG",
    description: "Heritage, language and identity conversations. Demonstration show.",
    cover: COVER.chill,
    episodes: 1
  },
  {
    slug: "the-creators-pod",
    title: "The Creators Pod",
    category: "Music & Entertainment",
    language: "English",
    country: "ZA",
    description: "How African music creators build audiences. Demonstration show.",
    cover: COVER.amapiano,
    episodes: 1
  },
  {
    slug: "kampala-kickoff",
    title: "Kampala Kickoff",
    category: "Sports",
    language: "English",
    country: "UG",
    description: "East African football talk. Demonstration show.",
    cover: COVER.hiphop,
    episodes: 1
  },
  {
    slug: "history-of-africa",
    title: "History of Africa",
    category: "African History",
    language: "English",
    country: "KE",
    description: "Long-form African history storytelling. Demonstration show.",
    cover: COVER.gospel,
    episodes: 1
  },
  {
    slug: "laughing-lagos",
    title: "Laughing Lagos",
    category: "Comedy",
    language: "Pidgin",
    country: "NG",
    description: "Stand-up and sketch comedy from Lagos. Demonstration show.",
    cover: COVER.live,
    episodes: 1
  },
  {
    slug: "diaspora-diaries",
    title: "Diaspora Diaries",
    category: "African Diaspora",
    language: "English",
    country: "CD",
    description: "Africans abroad on identity, work and home. Demonstration show.",
    cover: COVER.podcast,
    episodes: 1
  },
  {
    slug: "wellbeing-africa",
    title: "Wellbeing Africa",
    category: "Personal Development",
    language: "English",
    country: "MA",
    description: "Practical personal growth for African listeners. Demonstration show.",
    cover: COVER.chill,
    episodes: 1
  }
];

const EPISODE_AUDIO = { file: "episode-founders-lagos.mp3", seconds: 95 };

(async () => {
  let artists = 0;
  let tracks = 0;

  for (const artist of ARTISTS) {
    const user = await prisma.user.upsert({
      where: { email: artist.email },
      update: { name: artist.name },
      create: { email: artist.email, name: artist.name, passwordHash: hashPassword("NaijaStreamDemo2026!"), actorType: "CUSTOMER" }
    });
    const profile = await prisma.streamArtist.upsert({
      where: { slug: artist.slug },
      update: { name: artist.name, bio: artist.bio, countryCode: artist.countryCode, city: artist.city, genres: artist.genres, verified: true, isSample: true },
      create: { userId: user.id, name: artist.name, slug: artist.slug, bio: artist.bio, countryCode: artist.countryCode, city: artist.city, genres: artist.genres, verified: true, verifiedAt: new Date(), isSample: true }
    });
    artists += 1;

    const track = artist.track;
    await prisma.streamTrack.upsert({
      where: { slug: track.slug },
      update: {
        title: track.title,
        genre: track.genre,
        language: track.language,
        audioUrl: `${AUDIO}/${track.file}`,
        artworkUrl: track.art,
        status: "PUBLISHED",
        rightsDeclared: true,
        isSample: true
      },
      create: {
        artistId: profile.id,
        title: track.title,
        slug: track.slug,
        durationSec: track.seconds,
        genre: track.genre,
        language: track.language,
        audioUrl: `${AUDIO}/${track.file}`,
        artworkUrl: track.art,
        status: "PUBLISHED",
        rightsDeclared: true,
        publishedAt: new Date(),
        isSample: true
      }
    });
    tracks += 1;
  }

  let shows = 0;
  let episodes = 0;
  for (const show of SHOWS) {
    const host = await prisma.streamArtist.findFirst({ where: { slug: ARTISTS.find((a) => a.countryCode === show.country)?.slug ?? ARTISTS[0].slug }, select: { id: true } });
    const row = await prisma.streamShow.upsert({
      where: { slug: show.slug },
      update: { title: show.title, category: show.category, description: show.description, coverUrl: show.cover, language: show.language, published: true, isSample: true },
      create: { artistId: host.id, title: show.title, slug: show.slug, category: show.category, description: show.description, coverUrl: show.cover, language: show.language, published: true, isSample: true }
    });
    shows += 1;
    await prisma.streamEpisode.upsert({
      where: { slug: `${show.slug}-ep1` },
      update: { audioUrl: `${AUDIO}/${EPISODE_AUDIO.file}`, status: "PUBLISHED" },
      create: {
        showId: row.id,
        title: `${show.title} — Episode 1`,
        slug: `${show.slug}-ep1`,
        description: `Opening episode of ${show.title}. Demonstration audio.`,
        audioUrl: `${AUDIO}/${EPISODE_AUDIO.file}`,
        durationSec: EPISODE_AUDIO.seconds,
        season: 1,
        episodeNo: 1,
        status: "PUBLISHED"
      }
    });
    episodes += 1;
  }

  const coverage = await prisma.streamArtist.groupBy({ by: ["countryCode"], _count: { _all: true } });
  console.log(JSON.stringify({ artists, tracks, shows, episodes, byCountry: Object.fromEntries(coverage.map((r) => [r.countryCode, r._count._all])) }));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
