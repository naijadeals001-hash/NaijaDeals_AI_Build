import { readLocale } from "@/lib/i18n/server";
import {
  previewAuthorizationForRequest,
  unavailableMessage,
  verticalAccess,
  verticalDefinition
} from "@/lib/services/core/vertical-activation.service";

/** Server-side Stay discovery gate: same resolver as the booking APIs. */
export async function stayPageAccess() {
  const { country, city, language } = readLocale();
  const { previewAuthorized } = await previewAuthorizationForRequest();
  const access = await verticalAccess("stay", {
    countryCode: country,
    cityCode: city,
    previewAuthorized
  }).catch(() => null);
  const definition = verticalDefinition("stay");
  return {
    accessible: access?.accessible === true,
    status: access?.effective.status ?? "DISABLED",
    message: access && !access.accessible ? unavailableMessage(definition, access.effective) : null,
    country,
    city,
    language
  };
}
