const ALLOWED = ["naijadeals_affiliate_test"];

/**
 * Fail closed before any write. Checks the database the client is actually
 * connected to, not an environment variable, so a misconfigured DATABASE_URL
 * cannot let a mutation-based financial suite run against shared data.
 */
export function requireIsolatedDatabase(actual: string): void {
  if (ALLOWED.includes(actual)) return;
  console.error(`Refusing to run: connected to "${actual}", allowed: ${ALLOWED.join(", ")}.`);
  process.exit(2);
}
