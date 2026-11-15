/**
 * Official NaijaDeals corporate contact directory.
 *
 * One typed source of truth for every published contact address. All thirteen
 * addresses are delivery aliases of the main mailbox `office@naijadeals.com`;
 * they are **contact addresses only**. They are not separate mailboxes,
 * employee accounts, administrator identities or application permissions, and
 * they must never be used as login, sender or recipient identities for a user.
 *
 * Public components import the address/label/mailto helper rather than writing
 * a literal address, so a changed address is a one-line change here.
 *
 * `accounts@naijadeals.com` (hosting, Cloudflare R2, Backblaze B2 and other
 * service registrations) is deliberately NOT in this module. It lives in
 * `lib/data/internal-contacts.ts` so it never ships in a browser bundle; this
 * module is imported by client components and therefore must stay public-only.
 *
 * Adding an address requires updating `OFFICIAL_EMAIL_ADDRESSES`; the
 * contact-directory test suite fails if the two ever disagree.
 */

export const OFFICIAL_EMAIL_DOMAIN = "naijadeals.com";

export type ContactKey =
  | "office"
  | "hello"
  | "support"
  | "billing"
  | "payments"
  | "partners"
  | "drivers"
  | "legal"
  | "privacy"
  | "security"
  | "abuse"
  | "careers";

/** Every address in this module is publishable; internal addresses live elsewhere. */
export type ContactVisibility = "public";

export type ContactEntry = {
  key: ContactKey;
  address: string;
  /** Short label used next to the address in interface copy. */
  label: string;
  /** The owner-defined purpose of the address. */
  purpose: string;
  visibility: ContactVisibility;
};

export const contactDirectory: Record<ContactKey, ContactEntry> = {
  office: {
    key: "office",
    address: `office@${OFFICIAL_EMAIL_DOMAIN}`,
    label: "Main office",
    purpose: "Main office and corporate correspondence",
    visibility: "public"
  },
  hello: {
    key: "hello",
    address: `hello@${OFFICIAL_EMAIL_DOMAIN}`,
    label: "General enquiries",
    purpose: "General enquiries",
    visibility: "public"
  },
  support: {
    key: "support",
    address: `support@${OFFICIAL_EMAIL_DOMAIN}`,
    label: "Customer support",
    purpose: "Customer support",
    visibility: "public"
  },
  billing: {
    key: "billing",
    address: `billing@${OFFICIAL_EMAIL_DOMAIN}`,
    label: "Billing",
    purpose: "Invoices and subscription billing",
    visibility: "public"
  },
  payments: {
    key: "payments",
    address: `payments@${OFFICIAL_EMAIL_DOMAIN}`,
    label: "Payments and refunds",
    purpose: "Payment enquiries, refunds and payouts",
    visibility: "public"
  },
  partners: {
    key: "partners",
    address: `partners@${OFFICIAL_EMAIL_DOMAIN}`,
    label: "Partner enquiries",
    purpose: "Vendors, restaurants, artists and business partners",
    visibility: "public"
  },
  drivers: {
    key: "drivers",
    address: `drivers@${OFFICIAL_EMAIL_DOMAIN}`,
    label: "Driver and courier enquiries",
    purpose: "Driver and courier enquiries",
    visibility: "public"
  },
  legal: {
    key: "legal",
    address: `legal@${OFFICIAL_EMAIL_DOMAIN}`,
    label: "Legal",
    purpose: "Legal correspondence",
    visibility: "public"
  },
  privacy: {
    key: "privacy",
    address: `privacy@${OFFICIAL_EMAIL_DOMAIN}`,
    label: "Privacy",
    purpose: "Privacy and personal-data requests",
    visibility: "public"
  },
  security: {
    key: "security",
    address: `security@${OFFICIAL_EMAIL_DOMAIN}`,
    label: "Security reports",
    purpose: "Security reports",
    visibility: "public"
  },
  abuse: {
    key: "abuse",
    address: `abuse@${OFFICIAL_EMAIL_DOMAIN}`,
    label: "Abuse and fraud reports",
    purpose: "Fraud, scams and prohibited content",
    visibility: "public"
  },
  careers: {
    key: "careers",
    address: `careers@${OFFICIAL_EMAIL_DOMAIN}`,
    label: "Careers",
    purpose: "Recruitment",
    visibility: "public"
  }
};

/** The authoritative address list, used by the test suite to detect drift. */
export const OFFICIAL_EMAIL_ADDRESSES = [
  "office@naijadeals.com",
  "hello@naijadeals.com",
  "support@naijadeals.com",
  "billing@naijadeals.com",
  "payments@naijadeals.com",
  "partners@naijadeals.com",
  "drivers@naijadeals.com",
  "legal@naijadeals.com",
  "privacy@naijadeals.com",
  "security@naijadeals.com",
  "abuse@naijadeals.com",
  "careers@naijadeals.com"
] as const;

export const contactKeys = Object.keys(contactDirectory) as ContactKey[];

export function contactAddress(key: ContactKey): string {
  return contactDirectory[key].address;
}

export function publicContact(key: Exclude<ContactKey, "accounts">): ContactEntry {
  return contactDirectory[key];
}

/**
 * A `mailto:` link with an optional, correctly encoded subject and body.
 *
 * Callers pass plain text; this function encodes spaces, newlines, `&`, `?`
 * and `#` so a subject such as "Order issues & refunds" cannot truncate the
 * query. Recipients are always chosen here, never from client input.
 */
export function mailtoFor(
  key: ContactKey,
  options: { subject?: string; body?: string } = {}
): string {
  const params: string[] = [];
  if (options.subject) params.push(`subject=${encodeURIComponent(options.subject)}`);
  if (options.body) params.push(`body=${encodeURIComponent(options.body)}`);
  const query = params.length ? `?${params.join("&")}` : "";
  return `mailto:${contactDirectory[key].address}${query}`;
}
