/**
 * One structured log line per event, JSON encoded.
 *
 * Workers and background tasks cannot return a value to a caller, so their only
 * durable trace is the log. JSON keeps it greppable and machine-readable.
 *
 * Callers pass only the fields they mean to publish: no email address, phone
 * number, token or amount-bearing payload belongs in a log line.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export function logEvent(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    level,
    event,
    pid: process.pid,
    ...fields
  });
  if (level === "error" || level === "warn") process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const log = {
  info: (event: string, fields?: Record<string, unknown>) => logEvent("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => logEvent("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => logEvent("error", event, fields),
  debug: (event: string, fields?: Record<string, unknown>) => logEvent("debug", event, fields)
};
