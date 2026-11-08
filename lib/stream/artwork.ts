/**
 * One rule for "which picture represents this song", shared by the cards, the
 * player, the queue and playlists.
 *
 * The artist's canonical portrait wins so a song is always identifiable by who
 * made it; release artwork is only used when the artist has no portrait yet.
 * That keeps identity consistent across every surface instead of each view
 * picking a different image for the same song.
 */
export function trackImage(track: {
  artworkUrl?: string | null;
  artistImageUrl?: string | null;
  artist?: { avatarUrl?: string | null } | null;
}): string | null {
  return track.artistImageUrl ?? track.artist?.avatarUrl ?? track.artworkUrl ?? null;
}
