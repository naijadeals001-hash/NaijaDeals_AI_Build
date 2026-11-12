/**
 * Plus+ Control Center sections.
 *
 * Kept free of client and server imports so both the server page and the
 * client workspace can share the same section identifiers.
 */
export const PLUS_TABS = [
  { id: "overview", label: "Overview" },
  { id: "content", label: "Service awareness" },
  { id: "plans", label: "Plans & membership" },
  { id: "benefits", label: "Benefits" },
  { id: "promotions", label: "Promotions" }
] as const;

export type PlusTab = (typeof PLUS_TABS)[number]["id"];

export function normalizePlusTab(value: string | undefined | null): PlusTab {
  return PLUS_TABS.some((tab) => tab.id === value) ? (value as PlusTab) : "overview";
}
