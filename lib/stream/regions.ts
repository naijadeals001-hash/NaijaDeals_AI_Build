/** Region vocabulary shared by the server catalogue and client controls. */
export const AFRICA_REGIONS = ["West Africa", "East Africa", "Southern Africa", "Central Africa", "North Africa"] as const;

export type AfricaRegion = (typeof AFRICA_REGIONS)[number];

export const REGION_ORDER: readonly string[] = AFRICA_REGIONS;
