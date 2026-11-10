import "dotenv/config";
import { safeInternalDestination } from "../lib/services/affiliate/service";

const CASES: Array<[string, boolean]> = [
  ["/product/abc", true],
  ["/naijashop", true],
  ["/product/abc?x=1", true],
  ["//evil.example", false],
  ["https://evil.example", false],
  ["/" + String.fromCharCode(92) + "evil.example", false],
  ["/%2F%2Fevil.example", false],
  ["/%5Cevil.example", false],
  ["javascript:alert(1)", false],
  ["data:text/html,hi", false],
  ["/a b", false]
];

let failed = 0;
for (const [value, expectOk] of CASES) {
  const result = safeInternalDestination(value);
  const pass = Boolean(result) === expectOk;
  if (!pass) failed += 1;
  console.log(`${pass ? "PASS" : "FAIL"}  ${JSON.stringify(value)} -> ${result ?? "rejected"}`);
}
console.log(`\n${CASES.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
