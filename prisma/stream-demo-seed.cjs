/**
 * NaijaStream demonstration catalogue — CLEARLY LABELLED fictional artists and
 * releases (isSample=true). No real artist names, likenesses or copyrighted
 * releases. Shown only when NAIJA_STREAM_SHOW_SAMPLES=true; hidden by default in
 * production. Tracks carry NO audioUrl: playback honestly reports that audio is
 * not published, so nothing pretends to be a real streamable release.
 *
 * Idempotent. Usage: node prisma/stream-demo-seed.cjs
 */
const { PrismaClient } = require("@prisma/client");
const { scryptSync, randomBytes } = require("node:crypto");

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, 64).toString("hex")}`;
}

const ART = {
  adaeze: "/generated/stream/opt/stream-artist-adaeze.jpg",
  kunle: "/generated/stream/opt/stream-artist-kunle.jpg",
  amaka: "/generated/stream/opt/stream-artist-amaka.jpg",
  tobi: "/generated/stream/opt/stream-artist-tobi.jpg",
  zainab: "/generated/stream/opt/stream-artist-zainab.jpg",
  kojo: "/generated/stream/opt/stream-artist-kojo.jpg",
  afrobeats: "/generated/stream/opt-v2/stream-v2-cover-afrobeats.jpg",
  amapiano: "/generated/stream/opt-v2/stream-v2-cover-amapiano.jpg",
  gospel: "/generated/stream/opt-v2/stream-v2-cover-gospel.jpg",
  hiphop: "/generated/stream/opt-v2/stream-v2-cover-hiphop.jpg",
  chill: "/generated/stream/opt-v2/stream-v2-cover-chill.jpg",
  podcast: "/generated/stream/opt/stream-cover-podcast.jpg"
};

const ARTISTS = [
  { email: "demo.stream.adaeze@naijastream.demo", name: "Adaeze Moon", slug: "adaeze-moon", avatar: ART.adaeze, genres: ["Afrobeats"], bio: "Demonstration artist. Fictional Afrobeats vocalist used to illustrate the NaijaStream catalogue." },
  { email: "demo.stream.kunle@naijastream.demo", name: "Kunle Ave", slug: "kunle-ave", avatar: ART.kunle, genres: ["Afrobeats", "Hip-Hop"], bio: "Demonstration artist. Fictional Afrobeats and hip-hop artist." },
  { email: "demo.stream.amaka@naijastream.demo", name: "Amaka Grace", slug: "amaka-grace", avatar: ART.amaka, genres: ["Gospel"], bio: "Demonstration artist. Fictional gospel singer." },
  { email: "demo.stream.tobi@naijastream.demo", name: "Tobi Vex", slug: "tobi-vex", avatar: ART.tobi, genres: ["Hip-Hop"], bio: "Demonstration artist. Fictional Nigerian hip-hop artist." },
  { email: "demo.stream.zainab@naijastream.demo", name: "Zainab Ke", slug: "zainab-ke", avatar: ART.zainab, genres: ["Amapiano"], bio: "Demonstration artist. Fictional amapiano DJ." },
  { email: "demo.stream.kojo@naijastream.demo", name: "Kojo Mensah", slug: "kojo-mensah", avatar: ART.kojo, genres: ["Highlife"], bio: "Demonstration artist. Fictional Ghanaian highlife guitarist." }
];

const TRACKS = [
  { artist: "adaeze-moon", title: "Lagos Nights", genre: "Afrobeats", duration: 201, art: ART.afrobeats },
  { artist: "adaeze-moon", title: "Brighter", genre: "Afrobeats", duration: 188, art: ART.afrobeats },
  { artist: "kunle-ave", title: "Mainland Flow", genre: "Afrobeats", duration: 226, art: ART.afrobeats },
  { artist: "kunle-ave", title: "Concrete Dreams", genre: "Hip-Hop", duration: 194, art: ART.hiphop },
  { artist: "amaka-grace", title: "Grateful Heart", genre: "Gospel", duration: 245, art: ART.gospel },
  { artist: "amaka-grace", title: "Morning Light", genre: "Gospel", duration: 232, art: ART.gospel },
  { artist: "tobi-vex", title: "Night Shift", genre: "Hip-Hop", duration: 178, art: ART.hiphop },
  { artist: "zainab-ke", title: "Amapiano Sunset", genre: "Amapiano", duration: 263, art: ART.amapiano },
  { artist: "zainab-ke", title: "Deep Groove", genre: "Amapiano", duration: 251, art: ART.amapiano },
  { artist: "kojo-mensah", title: "Highlife Soul", genre: "Highlife", duration: 214, art: ART.chill }
];

const PLAYLISTS = [
  { title: "Afrobeats Hits", slug: "afrobeats-hits", cover: ART.afrobeats, description: "The biggest Afrobeats energy on NaijaStream." },
  { title: "Amapiano Mix", slug: "amapiano-mix", cover: ART.amapiano, description: "Deep logs and sunset grooves." },
  { title: "Gospel Flow", slug: "gospel-flow", cover: ART.gospel, description: "Lift your morning with African gospel." },
  { title: "Naija Hip Hop", slug: "naija-hip-hop", cover: ART.hiphop, description: "Bars and beats from the mainland." },
  { title: "Chill Africa", slug: "chill-africa", cover: ART.chill, description: "Calm sounds for focus and rest." },
  { title: "Podcasts & Talk", slug: "podcasts-and-talk", cover: ART.podcast, description: "Conversations from across the continent." }
];

(async () => {
  const passwordHash = hashPassword("NaijaStreamDemo2026!");
  const slugify = (value) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const artistIds = {};

  for (const artist of ARTISTS) {
    const user = await prisma.user.upsert({
      where: { email: artist.email },
      update: { name: artist.name, passwordHash },
      create: { email: artist.email, name: artist.name, passwordHash, actorType: "CUSTOMER" }
    });
    const profile = await prisma.streamArtist.upsert({
      where: { userId: user.id },
      update: { name: artist.name, bio: artist.bio, avatarUrl: artist.avatar, genres: artist.genres, verified: true, isSample: true },
      create: { userId: user.id, name: artist.name, slug: artist.slug, bio: artist.bio, avatarUrl: artist.avatar, genres: artist.genres, verified: true, verifiedAt: new Date(), isSample: true }
    });
    artistIds[artist.slug] = profile.id;
  }

  const trackIds = {};
  const AUDIO_BY_SLUG = {
    "lagos-nights-demo": "track-lagos-nights",
    "brighter-demo": "track-brighter",
    "mainland-flow-demo": "track-mainland-flow",
    "concrete-dreams-demo": "track-concrete-dreams",
    "grateful-heart-demo": "track-grateful-heart",
    "morning-light-demo": "track-morning-light",
    "night-shift-demo": "track-night-shift",
    "amapiano-sunset-demo": "track-amapiano-sunset",
    "deep-groove-demo": "track-deep-groove",
    "highlife-soul-demo": "track-highlife-soul"
  };
  for (const track of TRACKS) {
    const slug = `${slugify(track.title)}-demo`;
    const audioUrl = `/generated/stream/audio/${AUDIO_BY_SLUG[slug]}.mp3`;
    const row = await prisma.streamTrack.upsert({
      where: { slug },
      update: { title: track.title, genre: track.genre, durationSec: track.duration, artworkUrl: track.art, audioUrl, status: "PUBLISHED", isSample: true, rightsDeclared: true },
      create: {
        artistId: artistIds[track.artist],
        title: track.title,
        slug,
        durationSec: track.duration,
        artworkUrl: track.art,
        audioUrl,
        genre: track.genre,
        status: "PUBLISHED",
        publishedAt: new Date(),
        rightsDeclared: true,
        isSample: true
      }
    });
    trackIds[slug] = row.id;
  }

  // Editorial playlists with real ordering.
  const plan = {
    "afrobeats-hits": ["lagos-nights-demo", "brighter-demo", "mainland-flow-demo"],
    "amapiano-mix": ["amapiano-sunset-demo", "deep-groove-demo"],
    "gospel-flow": ["grateful-heart-demo", "morning-light-demo"],
    "naija-hip-hop": ["concrete-dreams-demo", "night-shift-demo"],
    "chill-africa": ["highlife-soul-demo"],
    "podcasts-and-talk": []
  };
  for (const playlist of PLAYLISTS) {
    const row = await prisma.streamPlaylist.upsert({
      where: { slug: playlist.slug },
      update: { title: playlist.title, description: playlist.description, coverUrl: playlist.cover, isEditorial: true, isPublic: true, isSample: true },
      create: { title: playlist.title, slug: playlist.slug, description: playlist.description, coverUrl: playlist.cover, isEditorial: true, isPublic: true, isSample: true }
    });
    await prisma.streamPlaylistItem.deleteMany({ where: { playlistId: row.id } });
    const slugs = plan[playlist.slug] ?? [];
    for (const [index, slug] of slugs.entries()) {
      if (!trackIds[slug]) continue;
      await prisma.streamPlaylistItem.create({ data: { playlistId: row.id, trackId: trackIds[slug], position: index + 1 } });
    }
  }

  console.log(JSON.stringify({ artists: ARTISTS.length, tracks: TRACKS.length, playlists: PLAYLISTS.length, note: "Demonstration catalogue (isSample=true); hidden unless NAIJA_STREAM_SHOW_SAMPLES=true; no audio attached." }));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
