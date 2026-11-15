"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";

type Vertical = { key: string; label: string };

type Props = {
  initialVertical: string;
  verticals: Vertical[];
  signedIn: boolean;
  signedInEmail: string | null;
};

const TOPICS: Array<{ key: string; label: string }> = [
  { key: "order", label: "Order, delivery or return" },
  { key: "payment", label: "Payment, wallet or refund" },
  { key: "delivery", label: "Shipment or tracking" },
  { key: "account", label: "Account access" },
  { key: "technical", label: "Website or app problem" },
  { key: "partnership", label: "Partner or business enquiry" },
  { key: "other", label: "Something else" }
];



/**
 * Contact form.
 *
 * - the raw form values stay in React state, so a recoverable server error
 *   never clears what the customer typed;
 * - `submitting` guards duplicate clicks and the button is disabled while the
 *   request is in flight;
 * - success is shown only after the API returned the durable reference.
 */
export function ContactForm({ initialVertical, verticals, signedIn, signedInEmail }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState(signedInEmail ?? "");
  const [vertical, setVertical] = useState(initialVertical);
  const [topic, setTopic] = useState("order");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [reference, setReference] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKey = useRef<string>(typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`);

  const verticalList = useMemo(() => verticals, [verticals]);

  function validate() {
    const errors: Record<string, string> = {};
    if (!signedIn) {
      if (name.trim().length < 2) errors.name = "Enter your name.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) errors.email = "Enter a valid email address.";
    }
    if (subject.trim().length < 3) errors.subject = "Add a short subject.";
    if (message.trim().length < 10) errors.message = "Tell us a little more (at least 10 characters).";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: signedIn ? undefined : name,
          email: signedIn ? undefined : email,
          vertical,
          topic,
          subject,
          message,
          idempotencyKey: idempotencyKey.current
        })
      });
      const data = (await response.json().catch(() => ({}))) as {
        reference?: string;
        accessToken?: string | null;
        error?: string;
        message?: string;
      };
      if (!response.ok || !data.reference) {
        setError(data.message ?? "We could not create the ticket. Please try again. Your message is still here.");
        return;
      }
      setReference(data.reference);
      setAccessToken(data.accessToken ?? null);
      idempotencyKey.current = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
    } catch {
      setError("The connection failed. Your message is still here — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (reference) {
    const accessPath = accessToken ? `/support/access?token=${encodeURIComponent(accessToken)}` : null;
    return (
      <section aria-live="polite" className="rounded-2xl bg-white p-5 ring-1 ring-[#cfe3ca]">
        <p className="text-[10.5px] font-black uppercase tracking-[0.16em] text-[#0b5c33]">Ticket created</p>
        <h2 className="mt-1 font-display text-2xl font-extrabold">Reference {reference}</h2>
        <p className="mt-2 text-[12.5px] leading-6 text-[#4b5b51]">
          Your enquiry is saved. {signedIn ? "Open it any time from " : ""}
          {signedIn ? (
            <Link href="/account/support" className="font-bold text-[#0b5c33] underline">Account → Support</Link>
          ) : (
            "Keep the private link below to return to this conversation."
          )}
        </p>
        {accessPath ? (
          <div className="mt-3 rounded-xl bg-[#eef5ea] p-3">
            <p className="text-[11.5px] font-bold">Private access link (shown once)</p>
            <p className="mt-1 break-all rounded-lg bg-white px-2 py-1.5 font-mono text-[11px] text-[#14241b] ring-1 ring-[#dbe7d7]">
              {typeof window !== "undefined" ? `${window.location.origin}${accessPath}` : accessPath}
            </p>
            <p className="mt-1.5 text-[11px] leading-5 text-[#4b5b51]">
              Open it in this browser now and we will remember the ticket securely. The link expires in 7 days. Anyone with it can read the ticket, so do not share it.
            </p>
            <a href={accessPath} className="mt-2 inline-flex rounded-full bg-[#0b5c33] px-4 py-2 text-[11.5px] font-extrabold text-white">
              Open my ticket
            </a>
          </div>
        ) : null}
        <p className="mt-3 rounded-lg bg-[#fdf3e4] px-3 py-2 text-[11px] leading-5 text-[#7a4a10]">
          Email notifications are not available in this environment, so we have not sent an email. Keep this reference: {reference}.
        </p>
        <button
          type="button"
          onClick={() => { setReference(null); setAccessToken(null); setSubject(""); setMessage(""); }}
          className="mt-3 text-[11.5px] font-bold text-[#0b5c33] underline"
        >
          Send another enquiry
        </button>
      </section>
    );
  }

  const inputClass = "mt-1 w-full rounded-lg border border-[#d8e2d4] bg-white px-3 py-2 text-[13px] text-[#14241b] outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]";
  const labelClass = "block text-[11.5px] font-bold text-[#24382b]";

  return (
    <form onSubmit={submit} noValidate className="rounded-2xl bg-white p-5 ring-1 ring-[#e4ebe2]">
      <div className="grid gap-3 sm:grid-cols-2">
        {!signedIn ? (
          <>
            <div>
              <label className={labelClass} htmlFor="contact-name">Your name</label>
              <input id="contact-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoComplete="name" className={inputClass} aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? "contact-name-error" : undefined} />
              {fieldErrors.name ? <p id="contact-name-error" className="mt-1 text-[11px] font-semibold text-[#b42318]">{fieldErrors.name}</p> : null}
            </div>
            <div>
              <label className={labelClass} htmlFor="contact-email">Email</label>
              <input id="contact-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} autoComplete="email" className={inputClass} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "contact-email-error" : undefined} />
              {fieldErrors.email ? <p id="contact-email-error" className="mt-1 text-[11px] font-semibold text-[#b42318]">{fieldErrors.email}</p> : null}
            </div>
          </>
        ) : (
          <p className="sm:col-span-2 rounded-lg bg-[#eef5ea] px-3 py-2 text-[11.5px] text-[#3f4d45]">Signed in as {signedInEmail}. Replies appear in Account → Support.</p>
        )}
        <div>
          <label className={labelClass} htmlFor="contact-vertical">Service</label>
          <select id="contact-vertical" value={vertical} onChange={(event) => setVertical(event.target.value)} className={inputClass}>
            {verticalList.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="contact-topic">Topic</label>
          <select id="contact-topic" value={topic} onChange={(event) => setTopic(event.target.value)} className={inputClass}>
            {TOPICS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="contact-subject">Subject</label>
          <input id="contact-subject" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={160} className={inputClass} aria-invalid={Boolean(fieldErrors.subject)} aria-describedby={fieldErrors.subject ? "contact-subject-error" : undefined} />
          {fieldErrors.subject ? <p id="contact-subject-error" className="mt-1 text-[11px] font-semibold text-[#b42318]">{fieldErrors.subject}</p> : null}
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="contact-message">Message</label>
          <textarea id="contact-message" value={message} onChange={(event) => setMessage(event.target.value)} rows={7} maxLength={8000} className={inputClass} aria-invalid={Boolean(fieldErrors.message)} aria-describedby={fieldErrors.message ? "contact-message-error" : "contact-message-help"} />
          <p id="contact-message-help" className="mt-1 text-[11px] text-[#6b7a70]">
            Include an order, booking or trip reference if you have one. A reference alone does not give us access on your behalf.
          </p>
          {fieldErrors.message ? <p id="contact-message-error" className="mt-1 text-[11px] font-semibold text-[#b42318]">{fieldErrors.message}</p> : null}
        </div>
      </div>

      {error ? (
        <div role="alert" className="mt-3 rounded-lg border border-[#e5b4b4] bg-[#fdecec] px-3 py-2 text-[11.5px] font-semibold text-[#8f1d1d]">
          {error}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
          className="inline-flex min-h-10 items-center rounded-full bg-[#0b5c33] px-5 text-[12px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Sending…" : "Send enquiry"}
        </button>
        <p className="text-[11px] text-[#6b7a70]">
          {submitting ? "Creating your ticket — keep this page open." : "We never ask for passwords or card details."}
        </p>
      </div>
    </form>
  );
}
