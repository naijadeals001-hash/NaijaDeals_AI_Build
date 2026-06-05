import type { ServiceResult, TrackingMission } from "@/lib/services/types";

export async function getTrackingMission(missionId: string): ServiceResult<TrackingMission> {
  // TODO(backend): Connect NaijaSend/NaijaDrive dispatch events, GPS pings, QR scans, and route risk scoring.
  return {
    id: missionId,
    kind: "delivery",
    status: "in_transit",
    events: [
      { label: "Escrow hold confirmed", at: new Date().toISOString(), proofType: "gps" },
      { label: "Pickup QR scanned", at: new Date().toISOString(), proofType: "qr" }
    ]
  };
}

export async function recordProofEvent(missionId: string, proofType: "qr" | "barcode" | "photo" | "gps"): ServiceResult<TrackingMission> {
  // TODO(backend): Validate proof payload, prevent replay, and emit escrow/dispute workflow events.
  const mission = await getTrackingMission(missionId);
  return { ...mission, events: [...mission.events, { label: `${proofType} proof received`, at: new Date().toISOString(), proofType }] };
}
