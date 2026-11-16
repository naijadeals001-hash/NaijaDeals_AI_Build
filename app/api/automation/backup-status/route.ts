import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/auth/api-error";
import { jsonError } from "@/lib/auth/guard";
import { requireAutomationConsumer } from "@/lib/services/core/automation-auth";
import { recordBackupStatus } from "@/lib/services/core/operations-automation.service";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, private", Vary: "Cookie" };
const MAX_BODY_BYTES = 8 * 1024;
const MAX_MESSAGE = 500;
const STATUSES = new Set(["success", "failure"]);
const TARGETS = new Set(["staging-db", "n8n", "files"]);
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

function field(input: Record<string, unknown>, name: string, max: number): string {
  const value = input[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(400, "validation_error", `${name} is required.`);
  }
  const text = value.trim();
  if (text.length > max) {
    throw new ApiError(400, "validation_error", `${name} must be ${max} characters or fewer.`);
  }
  return text;
}

/**
 * Records a backup job outcome and alerts unscoped operations staff.
 *
 * Bearer-token authenticated server-to-server call: no session, no Origin
 * check and no website redirect. The body is at most 8 KiB of JSON. A repeated
 * report for the same run id is idempotent (one SystemEvent, one intent per
 * recipient), so a retried HTTP request cannot double-alert.
 */
export async function POST(request: NextRequest) {
  try {
    requireAutomationConsumer(request);

    const declaredLength = Number(request.headers.get("content-length") ?? "");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      throw new ApiError(413, "payload_too_large", `Request body must be ${MAX_BODY_BYTES} bytes or fewer.`);
    }

    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
      throw new ApiError(413, "payload_too_large", `Request body must be ${MAX_BODY_BYTES} bytes or fewer.`);
    }

    let parsed: unknown;
    try {
      parsed = raw.trim() ? JSON.parse(raw) : null;
    } catch {
      throw new ApiError(400, "invalid_json", "Request body must be valid JSON.");
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ApiError(400, "invalid_body", "Request body must be a JSON object.");
    }
    const input = parsed as Record<string, unknown>;

    const runId = field(input, "runId", 80);
    const status = field(input, "status", 16);
    if (!STATUSES.has(status)) {
      throw new ApiError(400, "validation_error", "status must be success or failure.");
    }
    const target = field(input, "target", 32);
    if (!TARGETS.has(target)) {
      throw new ApiError(400, "validation_error", "target must be staging-db, n8n or files.");
    }
    const finishedAtText = field(input, "finishedAt", 64);
    if (!ISO_INSTANT.test(finishedAtText) || Number.isNaN(new Date(finishedAtText).getTime())) {
      throw new ApiError(400, "validation_error", "finishedAt must be an ISO date.");
    }

    let message: string | undefined;
    if (input.message !== undefined && input.message !== null) {
      if (typeof input.message !== "string" || input.message.trim().length > MAX_MESSAGE) {
        throw new ApiError(400, "validation_error", `message must be ${MAX_MESSAGE} characters or fewer.`);
      }
      message = input.message.trim() || undefined;
    }

    const result = await recordBackupStatus({
      runId,
      status: status as "success" | "failure",
      target: target as "staging-db" | "n8n" | "files",
      finishedAt: new Date(finishedAtText),
      message
    });

    return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE });
  } catch (error) {
    return jsonError(error);
  }
}
