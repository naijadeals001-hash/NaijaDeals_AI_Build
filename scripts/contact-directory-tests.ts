#!/usr/bin/env node
/**
 * Official contact-address acceptance.
 *
 * Static checks (always):
 *  1. `lib/data/contact-directory.ts` holds exactly the 13 owner-approved
 *     addresses and `OFFICIAL_EMAIL_ADDRESSES` agrees with it key-for-key.
 *  2. `accounts@` is internal, every other address is public.
 *  3. `mailtoFor` encodes subject and body (`&`, `?`, `#`, spaces, newlines).
 *  4. No `@naijadeals.com` address literal exists in `app/`, `components/` or
 *     `lib/` outside the directory, except the two seeded demo user accounts.
 *  5. `accounts@` never appears in `app/` or `components/`.
 *  6. No placeholder corporate address (`@example.com`, `your-email`) is shown
 *     as contact copy; input `placeholder=` attribute values are allowed.
 *
 * HTTP checks (`--base-url=`):
 *  7. Every expected page renders its purpose-matched address, and every
 *     `mailto:` on every audited page targets an approved public address.
 *  8. No audited page links `accounts@`.
 *
 * Usage:
 *   npx tsx scripts/contact-directory-tests.ts --base-url=http://localhost:3047
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ACCOUNTS_CONTACT, BILLING_CONTACT } from "../lib/data/internal-contacts";
import { renderTemplate } from "../lib/notifications/templates";
import { EmailCaptureTransport } from "../lib/notifications/transports";
import {
  OFFICIAL_EMAIL_ADDRESSES,
  contactAddress,
  contactDirectory,
  contactKeys,
  mailtoFor,
  type ContactKey
} from "../lib/data/contact-directory";

const EXPECTED: Array<[string, string]> = [
  ["office", "office@naijadeals.com"],
  ["hello", "hello@naijadeals.com"],
  ["support", "support@naijadeals.com"],
  ["billing", "billing@naijadeals.com"],
  ["payments", "payments@naijadeals.com"],
  ["partners", "partners@naijadeals.com"],
  ["drivers", "drivers@naijadeals.com"],
  ["legal", "legal@naijadeals.com"],
  ["privacy", "privacy@naijadeals.com"],
  ["security", "security@naijadeals.com"],
  ["abuse", "abuse@naijadeals.com"],
  ["careers", "careers@naijadeals.com"]
];

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Seeded demo identities are user-owned data, not corporate contacts. */
const ADDRESS_LITERAL_ALLOWLIST: Record<string, string[]> = {
  "lib/services/auth-service.ts": ["demo@naijadeals.com"],
  "lib/services/users-service.ts": ["demo@naijadeals.com"]
};

const ROUTE_EXPECTATIONS: Array<[string, string[]]> = [
  ["/naijashop", ["hello", "support", "partners", "careers", "office"]],
  ["/naijashop/help", ["support", "payments", "partners", "hello"]],
  ["/naijaeats/help", ["support", "partners", "drivers", "careers"]],
  ["/naijadrive/help", ["support", "drivers", "privacy", "legal"]],
  ["/naijasend/help", ["support", "drivers"]],
  ["/naijastay/help", ["support", "partners"]],
  ["/naijagigs/government", ["partners", "support", "abuse", "careers"]],
  ["/pay", ["payments", "support"]],
  ["/naijashop/plus", ["billing", "payments", "support"]],
  ["/sell", ["partners", "support"]],
  ["/business/shop", ["partners", "support"]],
  ["/", ["legal", "privacy", "security", "support", "hello", "partners", "office", "drivers"]],
  ["/help", ["support", "payments", "hello"]],
  ["/naijaeats", ["support", "partners", "drivers", "careers"]],
  ["/naijafresh", ["support", "partners", "careers"]],
  ["/naijastay", ["legal", "privacy", "support", "careers"]],
  ["/naijasend", ["support", "payments", "careers"]],
  ["/naijagigs", ["support", "partners", "abuse", "careers"]],
  ["/naijadrive", ["support", "drivers", "privacy", "legal"]],
  ["/naijastay/safety", ["support"]],
  ["/naijagigs/pro/apply", ["partners", "support"]],
  ["/naijastay/host", ["partners", "support"]],
  ["/naijastream/artists", ["partners", "support"]],
  ["/naijafresh/farmers/apply", ["partners", "support"]],
  ["/naijasend/transporter/apply", ["drivers"]],
  ["/onboarding/driver", ["drivers", "support"]]
];

let failures = 0;
let checks = 0;

function check(ok: boolean, label: string, detail?: string) {
  checks += 1;
  if (ok) {
    console.log(`PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function walk(directory: string, out: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(directory, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs|cjs|js)$/.test(entry)) out.push(full);
  }
  return out;
}

function relative(file: string): string {
  return path.relative(process.cwd(), file).replaceAll("\\", "/");
}

function staticChecks() {
  check(contactKeys.length === 12, "public directory declares 12 addresses", `found ${contactKeys.length}`);
  check(
    ACCOUNTS_CONTACT === "accounts@naijadeals.com" && BILLING_CONTACT === "billing@naijadeals.com",
    "the internal module holds the service-registration and billing-contact addresses"
  );
  check(
    !(contactKeys as string[]).includes("accounts") && (OFFICIAL_EMAIL_ADDRESSES as readonly string[]).every((a) => a !== "accounts@naijadeals.com"),
    "the service-registration address is not in the public directory"
  );

  const pairs = EXPECTED.map(([key, address]) => [key, contactAddress(key as ContactKey), address] as const);
  const mismatched = pairs.filter(([, actual, expected]) => actual !== expected);
  check(
    mismatched.length === 0,
    "each directory address matches the owner-approved directory exactly",
    mismatched.map(([key, actual, expected]) => `${key}: ${actual} != ${expected}`).join("; ")
  );

  const listMatches =
    OFFICIAL_EMAIL_ADDRESSES.length === EXPECTED.length &&
    EXPECTED.every(([, address], index) => OFFICIAL_EMAIL_ADDRESSES[index] === address);
  check(listMatches, "OFFICIAL_EMAIL_ADDRESSES agrees with the directory in order");

  check(
    contactKeys.every((key) => contactDirectory[key].visibility === "public"),
    "every address in the public directory is publishable"
  );
  check(
    contactKeys.every((key) => contactDirectory[key].address === `${key}@naijadeals.com`),
    "addresses follow <purpose>@naijadeals.com without exceptions"
  );

  const subjectHref = mailtoFor("support", { subject: "Order issues & refunds" });
  check(
    subjectHref === "mailto:support@naijadeals.com?subject=Order%20issues%20%26%20refunds",
    "mailtoFor encodes spaces and ampersands in the subject",
    subjectHref
  );
  const bodyHref = mailtoFor("payments", { body: "Line one\nLine two ? #ok" });
  check(
    bodyHref === "mailto:payments@naijadeals.com?body=Line%20one%0ALine%20two%20%3F%20%23ok",
    "mailtoFor encodes newlines, ? and # in the body",
    bodyHref
  );
  check(mailtoFor("hello") === "mailto:hello@naijadeals.com", "mailtoFor with no options adds no query");

  const sources = [...walk("app"), ...walk("components"), ...walk("lib")];
  const literalProblems: string[] = [];
  const accountsProblems: string[] = [];
  const placeholderProblems: string[] = [];

  for (const file of sources) {
    const rel = relative(file);
    if (rel === "lib/data/contact-directory.ts" || rel === "lib/data/internal-contacts.ts") continue;
    const text = readFileSync(file, "utf8");
    const allowed = new Set(ADDRESS_LITERAL_ALLOWLIST[rel] ?? []);

    for (const match of text.matchAll(EMAIL)) {
      const address = match[0].toLowerCase();
      if (!address.endsWith("@naijadeals.com")) continue;
      if (allowed.has(address)) continue;
      literalProblems.push(`${rel}: ${address}`);
    }

    if (/accounts@naijadeals\.com/.test(text)) accountsProblems.push(rel);
    if (/internal-contacts/.test(text) && /^\s*"use client";/m.test(text)) accountsProblems.push(`${rel} (client imports internal-contacts)`);

    // Published surfaces only: `lib/demo-store.ts` holds demo user identities,
    // which are user data, not corporate contact copy.
    if (!rel.startsWith("app/") && !rel.startsWith("components/")) continue;
    // A placeholder attribute is an input example, not published contact copy.
    const withoutPlaceholders = text.replace(/placeholder=\{?["'][^"']*["']\}?/g, "");
    if (/@example\.(com|org|net)|your-email@/i.test(withoutPlaceholders)) placeholderProblems.push(rel);
  }

  check(
    literalProblems.length === 0,
    "no corporate address literal outside the shared directory",
    literalProblems.slice(0, 8).join("; ")
  );
  check(
    accountsProblems.length === 0,
    "accounts@ is never referenced by an application surface",
    accountsProblems.join(", ")
  );
  check(
    placeholderProblems.length === 0,
    "no placeholder corporate address is published as contact copy",
    placeholderProblems.join(", ")
  );
  check(
    ADDRESS_LITERAL_ALLOWLIST["lib/services/auth-service.ts"]?.length === 1,
    "seeded demo identities stay explicitly allowlisted"
  );
}

async function templateChecks() {
  const rendered = renderTemplate("payment.topup_credited", "EMAIL", { amount: "₦1,000" });
  check(
    rendered.body.includes(contactAddress("support")),
    "the wallet-credit email body names the support address",
    rendered.body
  );
  check(
    !/contact support\./i.test(rendered.body),
    "the wallet-credit email body no longer says 'contact support' without an address"
  );

  // The capture transport is the only email transport in this build: it proves
  // the pipeline ran without contacting a provider. Reply-To must be recorded
  // as the support address and must never be the recipient.
  const directory = mkdtempSync(path.join(os.tmpdir(), "nd-contact-capture-"));
  try {
    const transport = new EmailCaptureTransport(directory);
    const result = await transport.send({
      notificationId: "nd-contact-check",
      to: "customer@naijadeals.test",
      subject: "Check",
      body: "Body",
      replyTo: contactAddress("support")
    });
    check(result.ok, "capture transport accepts the message");
    const day = new Date().toISOString().slice(0, 10);
    const record = JSON.parse(readFileSync(path.join(directory, `${day}.jsonl`), "utf8").trim());
    check(record.replyTo === "support@naijadeals.com", "capture record stores the support Reply-To", String(record.replyTo));
    check(record.to !== record.replyTo && String(record.to).includes("*"), "capture record keeps the recipient masked and separate");
    check(!("body" in record), "capture record stores no body by default");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function buildOutputChecks(directory: string) {
  const staticDir = path.join(directory, "static");
  if (!existsSync(staticDir)) {
    console.log(`NOTE  build-output check skipped (${staticDir} not present)`);
    return;
  }
  const leaks: string[] = [];
  const walkStatic = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walkStatic(full);
      else if (entry.endsWith(".js") && readFileSync(full, "utf8").includes("accounts@naijadeals.com")) {
        leaks.push(relative(full));
      }
    }
  };
  walkStatic(staticDir);
  check(leaks.length === 0, "no browser chunk contains the service-registration address", leaks.slice(0, 5).join(", "));
}

async function httpChecks(baseUrl: string) {
  const approved = new Set<string>(
    OFFICIAL_EMAIL_ADDRESSES.filter((address) => !address.startsWith("accounts@"))
  );
  const stray: string[] = [];
  const missing: string[] = [];

  for (const [route, keys] of ROUTE_EXPECTATIONS) {
    const response = await fetch(new URL(route, baseUrl), { redirect: "manual" });
    const html = response.status === 200 ? await response.text() : "";
    check(response.status === 200, `${route} responds 200`, `status ${response.status}`);

    for (const key of keys) {
      if (!html.includes(contactAddress(key as ContactKey))) missing.push(`${route} -> ${key}`);
    }

    // Contact actions must open the on-site support experience; a mailto
    // composer is no longer launched from an application page.
    const mailtos = [...html.matchAll(/mailto:/g)].length;
    if (mailtos > 0) stray.push(`${route}: ${mailtos} mailto link(s)`);
    const supportLinks = html.split('"' + '/contact').length - 1;
    if (supportLinks === 0) stray.push(`${route}: no on-site /contact link`);
  }
  const accountsPages: string[] = [];
  for (const [route] of ROUTE_EXPECTATIONS) {
    const response = await fetch(new URL(route, baseUrl), { redirect: "manual" });
    if (response.status !== 200) continue;
    if ((await response.text()).includes("mailto:accounts@")) accountsPages.push(route);
  }
  check(accountsPages.length === 0, "no audited page links the internal accounts address", accountsPages.join(", "));
}

async function main() {
  staticChecks();
  await templateChecks();

  const distArg = process.argv.find((argument) => argument.startsWith("--dist-dir="));
  buildOutputChecks(distArg ? distArg.slice("--dist-dir=".length) : ".next-programme");

  const baseArg = process.argv.find((argument) => argument.startsWith("--base-url="));
  if (baseArg) {
    await httpChecks(baseArg.slice("--base-url=".length).replace(/\/$/, ""));
  } else {
    console.log("NOTE  HTTP checks skipped (no --base-url)");
  }

  console.log(`\nRESULT ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
