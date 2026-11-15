import type { ContactKey } from "@/lib/data/contact-directory";

/**
 * Maps a published contact address to the on-site support experience.
 *
 * Business addresses stay visible as text where they already appear, but a
 * contact *action* must open NaijaDeals support instead of an external mail
 * client. The vertical/topic preselect the form, and both are validated again
 * on the server.
 */
const ROUTES: Record<ContactKey, { vertical: string; topic: string }> = {
  office: { vertical: "general", topic: "other" },
  hello: { vertical: "general", topic: "other" },
  support: { vertical: "general", topic: "order" },
  billing: { vertical: "general", topic: "payment" },
  payments: { vertical: "wallet", topic: "payment" },
  partners: { vertical: "general", topic: "partnership" },
  drivers: { vertical: "send", topic: "delivery" },
  legal: { vertical: "general", topic: "other" },
  privacy: { vertical: "general", topic: "other" },
  security: { vertical: "general", topic: "technical" },
  abuse: { vertical: "general", topic: "other" },
  careers: { vertical: "general", topic: "partnership" }
};

export function supportHref(
  contact: ContactKey = "support",
  // `subject` is accepted for call-site compatibility with the old mailto
  // helper; the on-site form owns the subject so it is not put in the URL.
  overrides?: { vertical?: string; topic?: string; subject?: string }
): string {
  const route = ROUTES[contact];
  const params = new URLSearchParams({
    vertical: overrides?.vertical ?? route.vertical,
    topic: overrides?.topic ?? route.topic
  });
  return `/contact?${params.toString()}`;
}
