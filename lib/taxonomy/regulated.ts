/**
 * Established definition of "regulated" marketplace categories.
 *
 * A regulated category sells goods that need a safety, standards or health
 * review in each market before they may be published there: medicines and
 * supplements, medical devices, child car seats and infant formula, vehicle and
 * motorcycle safety parts, cycling/motorcycle helmets, farm chemicals, seeds
 * and fixed electrical installation materials.
 *
 * The rule that follows from this definition is enforced in
 * `lib/services/taxonomy/shared.ts#effectivePublishRule`: a regulated node is
 * not publishable for a country until an explicit `CategoryCountryRule` exists
 * for that country. Absence of a rule is unresolved eligibility, never
 * permission.
 *
 * This set is the established definition and is deliberately explicit. It is
 * NOT derived from `TaxonomyNode.reviewRequired`: that flag is an editorial
 * property ("a human should review this leaf's copy/imagery/vocabulary") and
 * must not silently grant or remove market-publication powers. A definition
 * may still state `isRegulated` explicitly, but it must agree with this set
 * (`validateTaxonomy` refuses a contradiction).
 *
 * Membership count: 18 regulated definitions. 17 of them also deny publication
 * in Nigeria (`RESTRICTED_CATEGORY_KEYS` in `lib/data/taxonomy.ts`).
 * `cycling-helmets-protection` is regulated but explicitly publishable in NG
 * with a recorded standards-marking requirement — regulated does not mean
 * "blocked everywhere".
 */
export const REGULATED_CATEGORY_KEYS = [
  // Agriculture & Business — farm chemicals and seed stock need market approval.
  "seeds-seedlings",
  "fertilizers-crop-nutrition",
  "pesticides-crop-protection",
  // Health & Wellness — medicines, supplements, devices and mobility aids.
  "otc-medicines-treatments",
  "vitamins-minerals-supplements",
  "herbal-traditional-remedies",
  "health-monitors",
  "mobility-support-aids",
  // Baby, Kids & Toys — child restraint and infant feeding safety.
  "car-seats-boosters",
  "infant-formula",
  // Sports & Outdoors — protective headgear (NG explicitly allows with marking).
  "cycling-helmets-protection",
  // Automotive & Motorcycle — safety-critical parts.
  "brake-system-parts",
  "suspension-steering-parts",
  "tyres-tubes",
  "motorcycle-brakes-safety",
  "motorcycle-tyres-wheels",
  "motorcycle-helmets-protection",
  // Tools & Building Materials — fixed electrical installation materials.
  "electrical-installation-materials"
] as const;

export type RegulatedCategoryKey = (typeof REGULATED_CATEGORY_KEYS)[number];

const REGULATED_KEY_SET: ReadonlySet<string> = new Set(REGULATED_CATEGORY_KEYS);

/** True only for the established regulated definitions above. */
export function isRegulatedCategoryKey(key: string | null | undefined): boolean {
  if (!key) return false;
  return REGULATED_KEY_SET.has(key);
}
