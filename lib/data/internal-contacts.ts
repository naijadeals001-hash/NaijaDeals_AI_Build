/**
 * Internal contact addresses — never rendered on a public page.
 *
 * `accounts@naijadeals.com` receives hosting, Cloudflare R2, Backblaze B2 and
 * other service-registration mail. It is a delivery alias of the main mailbox,
 * not a credential or a separate account, but it is still infrastructure-only:
 * keeping it out of `lib/data/contact-directory.ts` keeps it out of every
 * browser bundle, because that module is imported by client components.
 *
 * Use {@link ACCOUNTS_CONTACT} from server code and infrastructure
 * documentation. Do not import this module from a component marked
 * `"use client"`; `scripts/contact-directory-tests.ts` enforces both rules.
 */
import { contactAddress } from "./contact-directory";

/** Service registrations and infrastructure vendor correspondence. */
export const ACCOUNTS_CONTACT = "accounts@naijadeals.com";

/** The billing address a provider's separate billing-contact field expects. */
export const BILLING_CONTACT = contactAddress("billing");
