import type { ToolSpec } from "./provider";

/**
 * Capability registry.
 *
 * One record of what Aura can actually do in this environment. The registry is
 * computed from real state — whether a vertical has published records, whether
 * the wallet exists — never hard-coded to look fuller than it is. The UI reads
 * this to decide which service tiles are active, and the prompt builder reads it
 * so the model is told plainly what is unavailable instead of guessing.
 */

export type CapabilityState = "available" | "empty" | "not_implemented";

export type Capability = {
  id: string;
  label: string;
  href: string;
  state: CapabilityState;
  /** What Aura can do here, in the customer's language. */
  summary: string;
  tools: string[];
};

export type CapabilitySnapshot = {
  vertical: string;
  counts: Record<string, number>;
};

const TOOL_BY_VERTICAL: Record<string, string[]> = {
  naijashop: ["search_products", "compare_products"],
  naijaeats: ["search_meals"],
  naijafresh: ["search_groceries"],
  naijadrive: ["estimate_ride"],
  naijasend: ["find_delivery_providers"],
  naijagigs: ["find_professionals"],
  naijastay: ["search_stays"],
  naijapay: ["get_wallet_summary", "explain_transaction", "prepare_transfer"],
  naijastream: ["recommend_listening"],
  activity: ["track_order", "find_booking"],
  planning: ["save_plan"]
};

const LABELS: Record<string, { label: string; href: string }> = {
  naijashop: { label: "NaijaShop", href: "/naijashop" },
  naijaeats: { label: "NaijaEats", href: "/naijaeats" },
  naijafresh: { label: "NaijaFresh", href: "/naijafresh" },
  naijadrive: { label: "NaijaDrive", href: "/naijadrive" },
  naijasend: { label: "NaijaSend", href: "/naijasend" },
  naijagigs: { label: "NaijaGigs", href: "/naijagigs" },
  naijastay: { label: "NaijaStay", href: "/naijastay" },
  naijapay: { label: "NaijaPay", href: "/pay" },
  naijastream: { label: "NaijaStream", href: "/naijastream" },
  activity: { label: "Your activity", href: "/orders" },
  planning: { label: "Plans", href: "/aura-ai/plans" }
};

const SUMMARIES: Record<string, string> = {
  naijashop: "Search and compare real products in the catalogue.",
  naijaeats: "Find restaurants and meals that are actually listed.",
  naijafresh: "Find fresh produce and staples.",
  naijadrive: "Estimate a ride fare between two places.",
  naijasend: "Find logistics providers for a shipment.",
  naijagigs: "Find verified professionals by trade and area.",
  naijastay: "Find stays by city with nightly prices.",
  naijapay: "Read your wallet, explain a transaction and prepare a transfer for you to confirm.",
  naijastream: "Recommend music and podcasts from the catalogue.",
  activity: "Look up your real orders, bookings and deliveries.",
  planning: "Assemble a cross-service plan as a draft you confirm piece by piece."
};

export function buildCapabilities(snapshot: CapabilitySnapshot): Capability[] {
  return Object.entries(LABELS).map(([vertical, meta]) => {
    const tools = TOOL_BY_VERTICAL[vertical] ?? [];
    // `activity` and `planning` are always usable: they read the signed-in user's
    // own records and local drafts rather than a catalogue.
    const alwaysAvailable = vertical === "activity" || vertical === "planning" || vertical === "naijapay";
    const count = snapshot.counts[vertical] ?? 0;
    const state: CapabilityState = alwaysAvailable ? "available" : count > 0 ? "available" : "empty";
    return {
      id: vertical,
      label: meta.label,
      href: meta.href,
      state,
      summary: SUMMARIES[vertical] ?? "",
      tools
    };
  });
}

/** Tool specifications sent to the model. Server-side validation happens again on call. */
export const TOOL_SPECS: ToolSpec[] = [
  {
    name: "search_stays",
    description:
      "Search NaijaStay properties by city (and optional area/budget). Returns only properties that exist in the catalogue with real nightly prices.",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string", description: "City name, e.g. Abuja, Lagos" },
        maxNightlyNaira: { type: "number", description: "Maximum nightly price in naira" },
        guests: { type: "number", description: "Number of guests" }
      },
      required: ["city"]
    }
  },
  {
    name: "search_meals",
    description: "Search NaijaEats restaurants and dishes by city, cuisine or dish name. Returns only real listings.",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string" },
        query: { type: "string", description: "Cuisine or dish, e.g. jollof, suya, Nigerian" },
        maxPriceNaira: { type: "number" }
      },
      required: []
    }
  },
  {
    name: "search_products",
    description: "Search NaijaShop products by keyword and optional maximum price. Returns real catalogue items with prices.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        maxPriceNaira: { type: "number" },
        take: { type: "number", description: "How many results, max 8" }
      },
      required: ["query"]
    }
  },
  {
    name: "compare_products",
    description: "Compare two or three NaijaShop products by id, returning price, vendor and key attributes side by side.",
    parameters: {
      type: "object",
      properties: { productIds: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 3 } },
      required: ["productIds"]
    }
  },
  {
    name: "find_professionals",
    description: "Find published NaijaGigs professionals by trade keyword and/or city or state.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" }, city: { type: "string" }, state: { type: "string" } },
      required: []
    }
  },
  {
    name: "estimate_ride",
    description: "Estimate a NaijaDrive fare between two locations. Uses the same pricing the booking screen uses.",
    parameters: {
      type: "object",
      properties: { from: { type: "string" }, to: { type: "string" } },
      required: ["from", "to"]
    }
  },
  {
    name: "recommend_listening",
    description: "Recommend music tracks, artists or podcasts from the NaijaStream catalogue.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" }, genre: { type: "string" }, kind: { type: "string", enum: ["track", "artist", "playlist", "podcast", "any"] } },
      required: []
    }
  },
  {
    name: "get_wallet_summary",
    description: "Read the signed-in user's own NaijaPay wallet: available balance, held escrow and recent transactions.",
    parameters: { type: "object", properties: { recent: { type: "number" } }, required: [] }
  },
  {
    name: "explain_transaction",
    description: "Explain one of the signed-in user's own wallet transactions by reference or amount, in plain language.",
    parameters: {
      type: "object",
      properties: { reference: { type: "string" }, keyword: { type: "string" } },
      required: []
    }
  },
  {
    name: "track_order",
    description: "Look up the status of the signed-in user's own order, delivery, ride, shipment, stay booking or service booking.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Order number, or a phrase like 'my last order' or 'my delivery'" } },
      required: []
    }
  },
  {
    name: "save_plan",
    description:
      "Save a cross-service draft plan (for example a Saturday out) built from results the user has seen. Saves a DRAFT only — never books or pays.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        city: { type: "string" },
        components: {
          type: "array",
          description: "Ordered components such as stay, meal, ride",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["stay", "meal", "ride", "activity", "note"] },
              label: { type: "string" },
              detail: { type: "string" },
              href: { type: "string" },
              amountNaira: { type: "number" }
            },
            required: ["kind", "label"]
          }
        }
      },
      required: ["title", "components"]
    }
  },
  {
    name: "prepare_transfer",
    description:
      "Prepare (not send) a NaijaPay transfer for the user to review and confirm. Only use when the user explicitly asks to send money and has given a recipient and amount.",
    parameters: {
      type: "object",
      properties: {
        recipientEmail: { type: "string" },
        amountNaira: { type: "number" },
        note: { type: "string" }
      },
      required: ["recipientEmail", "amountNaira"]
    }
  },
  {
    name: "get_affiliate_summary",
    description:
      "Read the signed-in account's own affiliate status, tracked links, clicks and commission totals. Never returns another account's affiliate data.",
    parameters: { type: "object", properties: {}, required: [] }
  }
];
