"use client";

import type {
  ApiDriveQuote,
  DrivePresence,
  DrivePublicRoute,
  DriveTracking,
  DriverBoard,
  DriverNotification,
  RideRatingState,
  RideReceipt,
  RideSafetyReport,
  RideVerification
} from "./types";

export class DriveApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {})
    }
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const record = (body ?? {}) as { error?: unknown; message?: unknown; code?: unknown };
    const message =
      typeof record.error === "string"
        ? record.error
        : typeof record.message === "string"
          ? record.message
          : `Request failed with HTTP ${response.status}`;
    throw new DriveApiError(response.status, String(record.code ?? "request_failed"), message);
  }
  return body as T;
}

export function getAllQuotes(pickup: string, dropoff: string) {
  const params = new URLSearchParams({ pickup, dropoff, all: "true" });
  return request<{ quotes: ApiDriveQuote[] }>(`/api/drive/quote?${params.toString()}`).then(
    (body) => body.quotes
  );
}

export function getPublicRoute(pickup: string, dropoff: string) {
  const params = new URLSearchParams({ pickup, dropoff });
  return request<DrivePublicRoute>(`/api/drive/route?${params.toString()}`);
}

export function getDriverBoard() {
  return request<DriverBoard>("/api/drive/driver/rides");
}

export function getPresence() {
  return request<DrivePresence>("/api/drive/driver/presence");
}

export function postPresence(input: {
  action: "go_online" | "go_offline" | "heartbeat";
  latitude?: number;
  longitude?: number;
  accuracyM?: number;
}) {
  return request<DrivePresence>("/api/drive/driver/presence", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getTracking(rideId: string) {
  return request<DriveTracking>(`/api/drive/rides/${encodeURIComponent(rideId)}/tracking`);
}

export function getRideVerification(rideId: string) {
  return request<RideVerification>(`/api/drive/rides/${encodeURIComponent(rideId)}/verification`);
}

export function verifyPassenger(rideId: string, code: string) {
  return request<{ verified: boolean; alreadyVerified: boolean }>(
    `/api/drive/driver/rides/${encodeURIComponent(rideId)}/verify`,
    { method: "POST", body: JSON.stringify({ code }) }
  );
}

export function getRideReceipt(rideId: string) {
  return request<RideReceipt>(`/api/drive/rides/${encodeURIComponent(rideId)}/receipt`);
}

export function getRideRatingState(rideId: string) {
  return request<RideRatingState>(`/api/drive/ratings/${encodeURIComponent(rideId)}`);
}

export function submitRideRating(input: { rideId: string; score: number; feedback?: string | null }) {
  return request<{ idempotent: boolean; rating: { score: number; feedback: string | null; createdAt: string } }>(
    "/api/drive/ratings",
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function submitSafetyReport(input: { rideId: string; category: string; details: string }) {
  return request<RideSafetyReport>(`/api/drive/rides/${encodeURIComponent(input.rideId)}/safety-report`, {
    method: "POST",
    body: JSON.stringify({ category: input.category, details: input.details })
  });
}

export function getPartnerNotifications() {
  return request<{ notifications: DriverNotification[]; unread: number }>("/api/partner/notifications");
}

export function markPartnerNotificationsRead() {
  return request<{ ok: boolean }>("/api/partner/notifications", {
    method: "POST",
    body: JSON.stringify({ markAllRead: true })
  });
}

export function signOut() {
  return request<{ signedOut: boolean }>("/api/auth/logout", { method: "POST" });
}
