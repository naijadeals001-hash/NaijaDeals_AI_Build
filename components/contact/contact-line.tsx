import { supportHref } from "@/lib/support/contact-link";
import { contactAddress, type ContactKey } from "@/lib/data/contact-directory";

/**
 * One "Label: address" contact line.
 *
 * The address is rendered from the shared directory, never typed into the page.
 * `accounts` is excluded from the key type because it is an internal
 * configuration address and must not be published.
 */
export function ContactLine({
  contact,
  label,
  subject,
  className,
  linkClassName
}: {
  contact: Exclude<ContactKey, "accounts">;
  label: string;
  subject?: string;
  className?: string;
  linkClassName?: string;
}) {
  return (
    <p className={className}>
      {label}:{" "}
      <a
        href={supportHref(contact, subject ? { subject } : undefined)}
        className={linkClassName ?? "font-semibold text-[#0b5c33] underline break-words"}
      >
        {contactAddress(contact)}
      </a>
    </p>
  );
}
