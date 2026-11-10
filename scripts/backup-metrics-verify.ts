import "dotenv/config";
import { metricsText } from "../lib/infra/metrics";
import { backupStatus } from "../lib/infra/backup-status";

const names = [
  "naijadeals_backup_last_success_timestamp",
  "naijadeals_backup_age_seconds",
  "naijadeals_backup_objects_count",
  "naijadeals_backup_remote_configured"
];

async function main() {
  const { body } = await metricsText();
  const missing = names.filter((name) => !body.includes(name));
  const status = backupStatus();
  console.log(`backup manifest present: ${status.present}, age: ${status.ageSeconds ?? "n/a"}s, objects: ${status.objects}, remote: ${status.remoteConfigured}`);
  for (const name of names) console.log(`${missing.includes(name) ? "FAIL" : "PASS"} ${name}`);
  const sample = body.split("\n").find((line) => line.startsWith("naijadeals_backup_age_seconds "));
  console.log(`sample: ${sample ?? "missing"}`);
  process.exit(missing.length ? 1 : 0);
}

void main();
