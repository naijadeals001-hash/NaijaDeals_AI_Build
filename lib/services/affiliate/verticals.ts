/**
 * The authoritative affiliate capability registry.
 *
 * A campaign vertical may only earn commission when the vertical has a verified
 * attribution and payment adapter. Shop is the only such integration today.
 * Every server path consults this list; UI dropdowns are not a control.
 */
export const SUPPORTED_AFFILIATE_VERTICALS = ["shop"] as const;

export type SupportedAffiliateVertical = (typeof SUPPORTED_AFFILIATE_VERTICALS)[number];

export function isSupportedAffiliateVertical(value: string | null | undefined): value is SupportedAffiliateVertical {
  return typeof value === "string" && (SUPPORTED_AFFILIATE_VERTICALS as readonly string[]).includes(value);
}
