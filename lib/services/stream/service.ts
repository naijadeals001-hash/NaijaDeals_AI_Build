import type { Prisma, StreamTrackStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/api-error";
import { recordAudit } from "@/lib/services/core/audit.service";
import { postBalancedTransaction } from "@/lib/services/core/wallet.service";
import { ensureWallet } from "@/lib/payments/service";

/**
 * NaijaStream catalog, library and royalty services.
 *
 * Rules enforced here:
 * - Only PUBLISHED tracks of verified artists are publicly discoverable, and
 *   demonstration records (isSample) are excluded unless
 *   NAIJA_STREAM_SHOW_SAMPLES=true (development/demo only).
 * - Plays are deduplicated per (track, user, 30-second bucket); only the first
 *   play of a eligible bucket counts, so replays and duplicate reports cannot
 *   inflate counts or royalties.
 * - Royalty rate comes from the admin-configured StreamRevenuePool for the
 *   period — never a hard-coded per-stream amount. Accruals are liabilities,
 *   not cash; only settlement posts to the shared ledger.
 */
export const showSamples = process.env.NAIJA_STREAM_SHOW_SAMPLES === "true";

export const publicTrackWhere: Prisma.StreamTrackWhereInput = {
  status: "PUBLISHED",
  artist: { verified: true, ...(showSamples ? {} : { isSample: false }) },
  ...(showSamples ? {} : { isSample: false })
};

const trackCard = {
  id: true,
  title: true,
  slug: true,
  durationSec: true,
  artworkUrl: true,
  genre: true,
  playCount: true,
  audioUrl: true,
  isSample: true,
  artist: { select: { id: true, name: true, slug: true, verified: true, avatarUrl: true, isSample: true } },
  release: { select: { id: true, slug: true, title: true } }
} satisfies Prisma.StreamTrackSelect;

export type TrackCard = Prisma.StreamTrackGetPayload<{ select: typeof trackCard }>;

export async function listGenres() {
  const rows = await prisma.streamTrack.groupBy({ by: ["genre"], where: publicTrackWhere, _count: { _all: true } });
  return rows
    .filter((row) => row.genre)
    .map((row) => ({ genre: row.genre as string, tracks: row._count._all }))
    .sort((a, b) => b.tracks - a.tracks);
}

export async function listTracks(input: { genre?: string; q?: string; artistId?: string; take?: number; skip?: number } = {}) {
  const where: Prisma.StreamTrackWhereInput = { ...publicTrackWhere };
  if (input.genre) where.genre = { equals: input.genre, mode: "insensitive" };
  if (input.artistId) where.artistId = input.artistId;
  if (input.q) {
    where.OR = [
      { title: { contains: input.q, mode: "insensitive" } },
      { genre: { contains: input.q, mode: "insensitive" } },
      { artist: { name: { contains: input.q, mode: "insensitive" } } }
    ];
  }
  const take = Math.min(input.take ?? 24, 60);
  const [items, total] = await Promise.all([
    prisma.streamTrack.findMany({ where, select: trackCard, orderBy: [{ playCount: "desc" }, { publishedAt: "desc" }], take, skip: input.skip ?? 0 }),
    prisma.streamTrack.count({ where })
  ]);
  return { items, total };
}

export async function getTrackBySlug(slug: string) {
  return prisma.streamTrack.findFirst({
    where: { slug, ...publicTrackWhere },
    select: { ...trackCard, rightsDeclared: true }
  });
}

export async function listArtists(input: { q?: string; take?: number } = {}) {
  const where: Prisma.StreamArtistWhereInput = { verified: true, ...(showSamples ? {} : { isSample: false }) };
  if (input.q) where.name = { contains: input.q, mode: "insensitive" };
  const artists = await prisma.streamArtist.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(input.take ?? 24, 60),
    select: {
      id: true,
      name: true,
      slug: true,
      avatarUrl: true,
      bio: true,
      verified: true,
      genres: true,
      isSample: true,
      _count: { select: { tracks: true, follows: true } }
    }
  });
  const playTotals = artists.length
    ? await prisma.streamTrack.groupBy({
        by: ["artistId"],
        where: { artistId: { in: artists.map((a) => a.id) }, ...publicTrackWhere },
        _sum: { playCount: true }
      })
    : [];
  const playsByArtist = new Map(playTotals.map((row) => [row.artistId, row._sum.playCount ?? BigInt(0)]));
  return artists.map((artist) => ({ ...artist, totalPlays: (playsByArtist.get(artist.id) ?? BigInt(0)).toString() }));
}

export async function getArtistBySlug(slug: string, viewerId?: string | null) {
  const artist = await prisma.streamArtist.findFirst({
    where: { slug, verified: true, ...(showSamples ? {} : { isSample: false }) },
    select: {
      id: true, name: true, slug: true, bio: true, avatarUrl: true, coverUrl: true,
      verified: true, genres: true, countryCode: true, isSample: true, createdAt: true,
      _count: { select: { follows: true } }
    }
  });
  if (!artist) return null;
  const [tracks, playlists, following] = await Promise.all([
    prisma.streamTrack.findMany({ where: { artistId: artist.id, ...publicTrackWhere }, select: trackCard, orderBy: { playCount: "desc" }, take: 20 }),
    prisma.streamPlaylist.findMany({ where: { artistId: artist.id, isPublic: true }, select: { id: true, title: true, slug: true, coverUrl: true }, take: 6 }),
    viewerId
      ? prisma.streamFollow.findUnique({ where: { artistId_userId: { artistId: artist.id, userId: viewerId } }, select: { id: true } })
      : Promise.resolve(null)
  ]);
  const totalPlays = tracks.reduce((sum, track) => sum + track.playCount, BigInt(0));
  return { artist, tracks, playlists, following: Boolean(following), totalPlays: totalPlays.toString() };
}

export async function listPlaylists(input: { editorial?: boolean; ownerId?: string; take?: number } = {}) {
  const where: Prisma.StreamPlaylistWhereInput = { isPublic: true };
  if (input.editorial) where.isEditorial = true;
  if (input.ownerId) where.ownerId = input.ownerId;
  if (!showSamples) where.isSample = false;
  const playlists = await prisma.streamPlaylist.findMany({
    where,
    orderBy: [{ isEditorial: "desc" }, { createdAt: "asc" }],
    take: Math.min(input.take ?? 24, 60),
    select: { id: true, title: true, slug: true, coverUrl: true, description: true, isEditorial: true, isSample: true, _count: { select: { items: true, follows: true } } }
  });
  return playlists;
}

export async function getPlaylistBySlug(slug: string) {
  const playlist = await prisma.streamPlaylist.findFirst({
    where: { slug, isPublic: true, ...(showSamples ? {} : { isSample: false }) },
    select: {
      id: true, title: true, slug: true, description: true, coverUrl: true, isEditorial: true,
      ownerId: true, _count: { select: { follows: true } },
      items: { orderBy: { position: "asc" }, select: { id: true, position: true, track: { select: trackCard } } }
    }
  });
  if (!playlist) return null;
  // Hide unpublished tracks inside public playlists rather than leaking drafts.
  const items = playlist.items.filter((item) => item.track);
  return { ...playlist, items, totalDurationSec: items.reduce((sum, item) => sum + (item.track?.durationSec ?? 0), 0) };
}

// --- Library ---------------------------------------------------------------

export async function toggleFollow(userId: string, artistId: string) {
  const artist = await prisma.streamArtist.findUnique({ where: { id: artistId }, select: { id: true, verified: true, isSample: true } });
  if (!artist || !artist.verified) throw new ApiError(404, "artist_not_found", "Artist not found.");
  if (artist.isSample && !showSamples) throw new ApiError(409, "sample_artist", "This is a demonstration artist.");
  const existing = await prisma.streamFollow.findUnique({ where: { artistId_userId: { artistId, userId } } });
  if (existing) {
    await prisma.streamFollow.delete({ where: { id: existing.id } });
    return { following: false };
  }
  await prisma.streamFollow.create({ data: { artistId, userId } });
  return { following: true };
}

export async function toggleLike(userId: string, trackId: string) {
  const track = await prisma.streamTrack.findFirst({ where: { id: trackId, ...publicTrackWhere }, select: { id: true } });
  if (!track) throw new ApiError(404, "track_not_found", "Track not found.");
  const existing = await prisma.streamLike.findUnique({ where: { trackId_userId: { trackId, userId } } });
  if (existing) {
    await prisma.streamLike.delete({ where: { id: existing.id } });
    return { liked: false };
  }
  await prisma.streamLike.create({ data: { trackId, userId } });
  return { liked: true };
}

export async function getLibrary(userId: string) {
  const [liked, follows, playlists] = await Promise.all([
    prisma.streamLike.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { track: { select: trackCard } }
    }),
    prisma.streamArtist.findMany({
      where: { follows: { some: { userId } }, verified: true },
      select: { id: true, name: true, slug: true, avatarUrl: true, _count: { select: { tracks: true } } }
    }),
    listPlaylists({ ownerId: userId })
  ]);
  return { liked: liked.map((row) => row.track), artists: follows, playlists };
}

export async function createPlaylist(userId: string, input: { title: string; description?: string }) {
  const base = input.title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "playlist";
  let slug = base;
  for (let i = 2; await prisma.streamPlaylist.findUnique({ where: { slug }, select: { id: true } }); i += 1) {
    slug = `${base}-${i}`;
  }
  const playlist = await prisma.streamPlaylist.create({
    data: { ownerId: userId, title: input.title, slug, description: input.description ?? null, isPublic: true },
    select: { id: true, title: true, slug: true }
  });
  await recordAudit({ actorId: userId, action: "stream.playlist_created", entity: "StreamPlaylist", entityId: playlist.id });
  return playlist;
}

export async function addToPlaylist(userId: string, playlistId: string, trackId: string) {
  const playlist = await prisma.streamPlaylist.findUnique({ where: { id: playlistId }, select: { id: true, ownerId: true } });
  if (!playlist) throw new ApiError(404, "playlist_not_found", "Playlist not found.");
  if (playlist.ownerId !== userId) throw new ApiError(403, "forbidden", "You can only edit your own playlists.");
  const track = await prisma.streamTrack.findFirst({ where: { id: trackId, ...publicTrackWhere }, select: { id: true } });
  if (!track) throw new ApiError(404, "track_not_found", "Track not found.");
  const existing = await prisma.streamPlaylistItem.findUnique({ where: { playlistId_trackId: { playlistId, trackId } } });
  if (existing) return { added: false, duplicate: true };
  const last = await prisma.streamPlaylistItem.aggregate({ where: { playlistId }, _max: { position: true } });
  await prisma.streamPlaylistItem.create({ data: { playlistId, trackId, position: (last._max.position ?? 0) + 1 } });
  return { added: true, duplicate: false };
}

export async function removeFromPlaylist(userId: string, playlistId: string, itemId: string) {
  const item = await prisma.streamPlaylistItem.findUnique({ where: { id: itemId }, select: { id: true, playlist: { select: { ownerId: true } } } });
  if (!item) throw new ApiError(404, "item_not_found", "Track is not in this playlist.");
  if (item.playlist.ownerId !== userId) throw new ApiError(403, "forbidden", "You can only edit your own playlists.");
  await prisma.streamPlaylistItem.delete({ where: { id: itemId } });
  return { removed: true };
}

// --- Playback ---------------------------------------------------------------

/**
 * Record a play. A client may only report plays for published tracks, and a
 * second report inside the same 30-second bucket is ignored. Increments the
 * cached playCount only when the row is first created.
 */
export async function recordPlay(input: { trackId: string; userId?: string; secondsPlayed: number }) {
  const track = await prisma.streamTrack.findFirst({ where: { id: input.trackId, ...publicTrackWhere }, select: { id: true } });
  if (!track) throw new ApiError(404, "track_not_found", "Track not found.");
  const bucketMs = Math.floor(Date.now() / 30000) * 30000;
  const bucket = new Date(bucketMs).toISOString();
  const eligible = input.secondsPlayed >= 30;
  // The unique (trackId, userId, bucket) constraint is the concurrency guard:
  // a duplicate insert raises P2002 and is treated as "not counted".
  const result = await prisma
    .$transaction(async (tx) => {
      await tx.streamPlay.create({
        data: { trackId: input.trackId, userId: input.userId ?? null, bucket, secondsPlayed: input.secondsPlayed, eligible }
      });
      if (eligible) {
        await tx.streamTrack.update({ where: { id: input.trackId }, data: { playCount: { increment: 1 } } });
      }
      return { counted: eligible };
    })
    .catch((error: { code?: string }) => {
      if (error?.code === "P2002") return { counted: false, duplicate: true };
      throw error;
    });
  return result;
}

/** Recently played for a listener, most recent first, de-duplicated by track. */
export async function recentlyPlayed(userId: string, take = 12) {
  const rows = await prisma.streamPlay.findMany({
    where: { userId, eligible: true, track: publicTrackWhere },
    orderBy: { createdAt: "desc" },
    take: take * 3,
    select: { track: { select: trackCard }, createdAt: true }
  });
  const seen = new Set<string>();
  const items: Array<{ track: TrackCard; playedAt: string }> = [];
  for (const row of rows) {
    if (seen.has(row.track.id)) continue;
    seen.add(row.track.id);
    items.push({ track: row.track, playedAt: row.createdAt.toISOString() });
    if (items.length >= take) break;
  }
  return items;
}

// --- Royalty engine ---------------------------------------------------------

/** Pure split of a period pool across eligible plays; exported for tests. */
export function computePeriodRoyalties(poolKobo: bigint, eligiblePlays: bigint) {
  if (poolKobo <= BigInt(0) || eligiblePlays <= BigInt(0)) {
    return { rateKoboPerPlay: BigInt(0), confirmedKobo: BigInt(0), remainderKobo: poolKobo };
  }
  const rate = poolKobo / eligiblePlays;
  const confirmed = rate * eligiblePlays;
  return { rateKoboPerPlay: rate, confirmedKobo: confirmed, remainderKobo: poolKobo - confirmed };
}

export async function calculateRoyalties(period: string, actorId?: string) {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new ApiError(400, "invalid_period", "Period must be YYYY-MM.");
  const pool = await prisma.streamRevenuePool.findUnique({ where: { period } });
  if (!pool) throw new ApiError(409, "pool_not_configured", `No revenue pool is configured for ${period}. Configure it in the Control Center first.`);
  const trackCounts = await prisma.streamPlay.groupBy({
    by: ["trackId"],
    where: { eligible: true, createdAt: { gte: new Date(`${period}-01T00:00:00Z`), lt: new Date(new Date(`${period}-01T00:00:00Z`).setMonth(new Date(`${period}-01T00:00:00Z`).getMonth() + 1)) } },
    _count: { _all: true }
  });
  const splits = computePeriodRoyalties(pool.poolKobo, BigInt(trackCounts.reduce((sum, row) => sum + row._count._all, 0)));
  if (splits.rateKoboPerPlay !== pool.rateKoboPerPlay) {
    await prisma.streamRevenuePool.update({ where: { id: pool.id }, data: { rateKoboPerPlay: splits.rateKoboPerPlay } });
  }
  let written = 0;
  for (const row of trackCounts) {
    const track = await prisma.streamTrack.findUnique({ where: { id: row.trackId }, select: { id: true, artistId: true, artist: { select: { commissionBps: true } } } });
    if (!track) continue;
    const gross = splits.rateKoboPerPlay * BigInt(row._count._all);
    const platform = (gross * BigInt(track.artist.commissionBps)) / BigInt(10000);
    await prisma.streamRoyaltyAccrual.upsert({
      where: { trackId_period: { trackId: track.id, period } },
      update: { eligiblePlays: BigInt(row._count._all), rateKoboPerPlay: splits.rateKoboPerPlay, grossKobo: gross, platformKobo: platform, artistKobo: gross - platform },
      create: {
        trackId: track.id, artistId: track.artistId, period,
        eligiblePlays: BigInt(row._count._all), rateKoboPerPlay: splits.rateKoboPerPlay,
        grossKobo: gross, platformKobo: platform, artistKobo: gross - platform,
        currency: pool.currency
      }
    });
    written += 1;
  }
  await recordAudit({ actorId: actorId ?? null, action: "stream.royalties_calculated", entity: "StreamRevenuePool", entityId: pool.id, metadata: { period, tracks: written } });
  return { period, tracks: written, ...Object.fromEntries(Object.entries(splits).map(([k, v]) => [k, String(v)])) };
}

export async function artistEarnings(userId: string) {
  const artist = await prisma.streamArtist.findUnique({ where: { userId }, select: { id: true, name: true } });
  if (!artist) return null;
  const [accruals, tracks, wallet] = await Promise.all([
    prisma.streamRoyaltyAccrual.findMany({ where: { artistId: artist.id }, orderBy: [{ period: "desc" }], take: 50 }),
    prisma.streamTrack.findMany({ where: { artistId: artist.id }, select: { id: true, title: true, playCount: true, status: true } }),
    prisma.wallet.findFirst({ where: { userId }, select: { availableKobo: true, currency: true } })
  ]);
  const pending = accruals.filter((row) => row.status === "ACCRUED" || row.status === "STATEMENTED").reduce((sum, row) => sum + row.artistKobo, BigInt(0));
  const settled = accruals.filter((row) => row.status === "PAID").reduce((sum, row) => sum + row.artistKobo, BigInt(0));
  const totalPlays = tracks.reduce((sum, track) => sum + track.playCount, BigInt(0));
  return {
    artist,
    wallet: wallet ?? null,
    tracks,
    accruals,
    metrics: {
      totalPlays: totalPlays.toString(),
      pendingRoyaltyKobo: pending.toString(),
      settledRoyaltyKobo: settled.toString(),
      availableKobo: (wallet?.availableKobo ?? BigInt(0)).toString()
    }
  };
}

/**
 * Settle a period's accruals into the artist's shared NaijaPay wallet. Posts a
 * single balanced ledger transaction (platform → artist) and is idempotent on
 * the ledger reference `stream:royalty:<artist>:<period>`.
 */
export async function settleRoyalties(artistId: string, period: string, actorId: string | null) {
  const accruals = await prisma.streamRoyaltyAccrual.findMany({ where: { artistId, period, status: { in: ["ACCRUED", "STATEMENTED"] } } });
  if (accruals.length === 0) throw new ApiError(409, "nothing_to_settle", "No pending royalties for that period.");
  const total = accruals.reduce((sum, row) => sum + row.artistKobo, BigInt(0));
  if (total <= BigInt(0)) throw new ApiError(409, "zero_amount", "Nothing to settle.");
  const reference = `stream:royalty:${artistId}:${period}`;
  const existing = await prisma.walletTransaction.findUnique({ where: { reference }, select: { id: true } });
  if (existing) return { settled: false, alreadySettled: true, reference, amountKobo: total.toString() };
  const artist = await prisma.streamArtist.findUniqueOrThrow({ where: { id: artistId }, select: { userId: true } });
  await prisma.$transaction(async (tx) => {
    const artistWallet = await ensureWallet(tx, { userId: artist.userId, ownerType: "CUSTOMER" });
    const platform = await ensureWallet(tx, { ownerType: "SYSTEM" });
    await tx.wallet.update({ where: { id: artistWallet.id }, data: { availableKobo: { increment: total } } });
    await tx.streamRoyaltyAccrual.updateMany({ where: { id: { in: accruals.map((row) => row.id) } }, data: { status: "PAID", ledgerReference: reference } });
    await postBalancedTransaction({
      tx,
      actorId,
      walletId: artistWallet.id,
      type: "credit",
      amountKobo: total,
      reference,
      description: `NaijaStream royalties ${period}`,
      entries: [
        { walletId: platform.id, direction: "DEBIT", amountKobo: total, memo: `Royalty pool ${period}` },
        { walletId: artistWallet.id, direction: "CREDIT", amountKobo: total, memo: `NaijaStream royalties ${period}` }
      ]
    });
  });
  await recordAudit({ actorId, action: "stream.royalties_settled", entity: "StreamArtist", entityId: artistId, metadata: { period, amountKobo: total.toString() } });
  return { settled: true, alreadySettled: false, reference, amountKobo: total.toString() };
}

export type { StreamTrackStatus };
