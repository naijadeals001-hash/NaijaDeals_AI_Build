/**
 * Royalty engine unit tests (pure split maths + settlement guards).
 * Usage: npx tsx scripts/stream-royalty-tests.ts
 */
import { computePeriodRoyalties } from "../lib/services/stream/service";

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed += 1;
    console.log(`  PASS ${name}`);
  } else {
    failures.push(name + (detail ? ` — ${detail}` : ""));
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("royalty split maths");
let r = computePeriodRoyalties(1_000_000n, 1_000n);
check("rate = pool / eligible plays", r.rateKoboPerPlay === 1_000n, r.rateKoboPerPlay.toString());
check("confirmed never exceeds pool", r.confirmedKobo === 1_000_000n && r.remainderKobo === 0n);

r = computePeriodRoyalties(1_000_000n, 3n);
check("integer division truncates (documented rounding)", r.rateKoboPerPlay === 333_333n, r.rateKoboPerPlay.toString());
check("remainder tracked, not silently assigned", r.remainderKobo === 1n, r.remainderKobo.toString());
check("never distributes more than the pool", r.confirmedKobo + r.remainderKobo === 1_000_000n);

r = computePeriodRoyalties(500n, 10_000n);
check("rate floors to zero when pool is too small", r.rateKoboPerPlay === 0n && r.remainderKobo === 500n);

r = computePeriodRoyalties(0n, 100n);
check("zero pool yields zero rate", r.rateKoboPerPlay === 0n);

r = computePeriodRoyalties(1_000n, 0n);
check("zero plays returns whole pool as remainder", r.rateKoboPerPlay === 0n && r.remainderKobo === 1_000n);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error("FAILURES:", failures);
  process.exit(1);
}
