/**
 * Starts the NaijaDrive assignment-expiry sweeper for this Node process.
 *
 * Reads also sweep expired assignments, but a ride nobody is watching would otherwise
 * stay assigned until the next poll. This timer is the background authority that
 * returns an idle ride to the queue on its own. One query every 30 seconds; each
 * release is still guarded by its own conditional update, so the timer can never
 * fight a driver action.
 *
 * `startDriveSweeper` is called once from `drive.service.ts`, and a global guard keeps
 * it to a single timer even across dev hot reloads or multiple route bundles.
 *
 * Env: DRIVE_SWEEP_INTERVAL_MS (default 30000), DRIVE_SWEEP_DISABLED=1.
 */
type Sweep = () => Promise<string[]>;

const scope = globalThis as typeof globalThis & { __naijadriveSweeper?: NodeJS.Timeout };

export function startDriveSweeper(sweep: Sweep) {
  if (process.env.DRIVE_SWEEP_DISABLED === "1") return;
  if (scope.__naijadriveSweeper) return;

  const intervalMs = Number(process.env.DRIVE_SWEEP_INTERVAL_MS ?? 30_000);

  const tick = async () => {
    try {
      const released = await sweep();
      if (released.length > 0) {
        console.log(`[drive] released ${released.length} expired assignment(s)`);
      }
    } catch (error) {
      console.error("[drive] assignment-expiry sweep failed", error);
    }
  };

  const timer = setInterval(tick, intervalMs);
  // Never hold the process open just for the sweeper.
  timer.unref();
  scope.__naijadriveSweeper = timer;
  console.log(`[drive] assignment-expiry sweeper started (every ${intervalMs} ms)`);
}
