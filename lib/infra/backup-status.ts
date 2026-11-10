import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Reads the backup manifest written by scripts/backup/run.mjs.
 *
 * Only non-sensitive facts leave this module: a timestamp, an age, a count and
 * whether a remote destination is configured. No key, path or content.
 */

export type BackupStatus = {
  present: boolean;
  lastSuccessAt: Date | null;
  ageSeconds: number | null;
  objects: number;
  remoteConfigured: boolean;
};

export function backupStatus(now = Date.now()): BackupStatus {
  const manifest = join(process.cwd(), "backups", "manifest.json");
  if (!existsSync(manifest)) {
    return { present: false, lastSuccessAt: null, ageSeconds: null, objects: 0, remoteConfigured: Boolean(process.env.BACKUP_REMOTE) };
  }
  try {
    const parsed = JSON.parse(readFileSync(manifest, "utf8")) as {
      postgres?: { at?: string };
      objects?: { count?: number };
      remote?: string;
    };
    const at = parsed.postgres?.at ? new Date(parsed.postgres.at) : null;
    return {
      present: true,
      lastSuccessAt: at,
      ageSeconds: at ? Math.round((now - at.getTime()) / 1000) : null,
      objects: parsed.objects?.count ?? 0,
      remoteConfigured: parsed.remote === "configured" || Boolean(process.env.BACKUP_REMOTE)
    };
  } catch {
    return { present: false, lastSuccessAt: null, ageSeconds: null, objects: 0, remoteConfigured: Boolean(process.env.BACKUP_REMOTE) };
  }
}
