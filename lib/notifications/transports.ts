import { appendFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { NotificationChannel } from "@prisma/client";

/**
 * Transport adapters.
 *
 * A transport is the only place that talks to a delivery provider. Nothing here
 * hardcodes a vendor: the chain for each channel is built from configuration,
 * and a channel with no configured transport produces an explicit
 * `no_provider_configured` result rather than a fake success.
 *
 * Implemented today:
 *  - `in-app`  the notification row is the delivery; nothing external is sent
 *  - `capture` writes a local, privacy-minimised record of an email instead of
 *              sending it, so a developer can prove the pipeline ran
 *
 * Not implemented, and deliberately not faked: SMS and push. They need an
 * approved provider account; until one exists those channels are SUPPRESSED.
 */

export type NotificationMessage = {
  notificationId: string;
  userId?: string | null;
  to: string;
  subject?: string;
  body: string;
  data?: Record<string, unknown>;
};

export type TransportResult = {
  ok: boolean;
  /** True when retrying later could plausibly succeed. */
  retryable: boolean;
  provider: string;
  messageId?: string;
  error?: string;
};

export interface NotificationTransport {
  readonly name: string;
  readonly channel: NotificationChannel;
  configured(): boolean;
  send(message: NotificationMessage): Promise<TransportResult>;
}

/**
 * Writes the in-app feed row (`PartnerNotification`), which is the table the
 * existing seller, driver, courier, gigs and stream screens already read.
 * The delivery engine extends that feed rather than replacing it.
 */
export function inAppTransport(persist: (message: NotificationMessage) => Promise<string>): NotificationTransport {
  return {
    name: "in-app",
    channel: "IN_APP",
    configured: () => true,
    async send(message) {
      if (!message.userId) {
        return { ok: false, retryable: false, provider: "in-app", error: "no_recipient" };
      }
      try {
        const feedId = await persist(message);
        return { ok: true, retryable: false, provider: "in-app", messageId: feedId };
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return { ok: false, retryable: true, provider: "in-app", error: detail.slice(0, 200) };
      }
    }
  };
}

export class EmailCaptureTransport implements NotificationTransport {
  readonly name = "capture";
  readonly channel = "EMAIL" as const;

  constructor(private readonly directory: string) {}

  configured(): boolean {
    return true;
  }

  async send(message: NotificationMessage): Promise<TransportResult> {
    try {
      await mkdir(this.directory, { recursive: true });
      const day = new Date().toISOString().slice(0, 10);
      // Minimised on purpose: the recipient is masked and the body is replaced
      // by a reference, so a log file never becomes a second copy of user data.
      // Set EMAIL_CAPTURE_BODIES=1 only for local debugging.
      const record: Record<string, unknown> = {
        at: new Date().toISOString(),
        notificationId: message.notificationId,
        to: maskAddress(message.to),
        subject: message.subject,
        bodySha256: createHash("sha256").update(message.body).digest("hex")
      };
      if (process.env.EMAIL_CAPTURE_BODIES === "1") record.body = message.body;
      await appendFile(join(this.directory, `${day}.jsonl`), `${JSON.stringify(record)}\n`, "utf8");
      return { ok: true, retryable: false, provider: "capture", messageId: `capture:${message.notificationId}` };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { ok: false, retryable: true, provider: "capture", error: detail.slice(0, 200) };
    }
  }
}

/** A channel with no provider account: explicit, never a silent success. */
function unconfigured(name: string, channel: NotificationChannel): NotificationTransport {
  return {
    name,
    channel,
    configured: () => false,
    async send() {
      return { ok: false, retryable: false, provider: name, error: "no_provider_configured" };
    }
  };
}

export function maskAddress(address: string): string {
  const at = address.indexOf("@");
  if (at <= 0) {
    const digits = address.replace(/\D/g, "");
    return digits.length > 4 ? `${"*".repeat(digits.length - 4)}${digits.slice(-4)}` : "***";
  }
  const local = address.slice(0, at);
  const domain = address.slice(at + 1);
  const shown = local.slice(0, 1);
  return `${shown}${"*".repeat(Math.max(local.length - 1, 2))}@${domain}`;
}

function chainFromEnv(channel: NotificationChannel, fallback: string[]): string[] {
  const raw = process.env[`NOTIFY_${channel}_CHAIN`];
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Ordered transports for a channel. The list is the failover order: the first
 * transport that accepts the message wins, and a retryable failure moves to the
 * next one.
 */
export function transportsFor(
  channel: NotificationChannel,
  options: { captureDirectory: string; feed: (message: NotificationMessage) => Promise<string> }
): NotificationTransport[] {
  const capture = new EmailCaptureTransport(options.captureDirectory);

  const available: Record<NotificationChannel, Record<string, NotificationTransport>> = {
    IN_APP: { "in-app": inAppTransport(options.feed) },
    EMAIL: { capture },
    SMS: { none: unconfigured("none", "SMS") },
    PUSH: { none: unconfigured("none", "PUSH") }
  };

  const defaults: Record<NotificationChannel, string[]> = {
    IN_APP: ["in-app"],
    EMAIL: ["capture"],
    SMS: ["none"],
    PUSH: ["none"]
  };

  const names = chainFromEnv(channel, defaults[channel]);
  const selected = names.map((name) => available[channel][name]).filter(Boolean);
  return selected.length ? selected : [available[channel][defaults[channel][0]]];
}
