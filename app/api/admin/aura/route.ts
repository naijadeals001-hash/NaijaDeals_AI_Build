import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { providerInfo } from "@/lib/aura/provider";
import { TOOL_SPECS } from "@/lib/aura/capabilities";
import { TOOL_STATUS } from "@/lib/aura/tools";

export const dynamic = "force-dynamic";

/**
 * Aura administration in the Control Center.
 *
 * Reports provider and tool status, usage, latency and failure counts. It never
 * returns message content — only counts — so support does not become a way to
 * read private conversations. Keys are never included; only whether one is set.
 */
export async function GET() {
  try {
    await requireAdminPermission("finance:read");
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [total, ok, failed, byTool, recent, conversations, savedCount] = await Promise.all([
      prisma.auraUsage.count({ where: { createdAt: { gte: since } } }),
      prisma.auraUsage.count({ where: { createdAt: { gte: since }, status: "ok" } }),
      prisma.auraUsage.count({ where: { createdAt: { gte: since }, status: "error" } }),
      prisma.auraUsage.aggregate({ where: { createdAt: { gte: since } }, _sum: { promptTokens: true, completionTokens: true, toolCalls: true }, _avg: { latencyMs: true } }),
      prisma.auraUsage.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 20, select: { provider: true, model: true, status: true, latencyMs: true, toolCalls: true, errorCode: true, createdAt: true } }),
      prisma.auraConversation.count(),
      prisma.auraMessage.count({ where: { saved: true } })
    ]);

    const info = providerInfo();
    return NextResponse.json(
      jsonSafe({
        provider: {
          id: info.id,
          model: info.model,
          configured: info.configured,
          capabilities: info.capabilities
        },
        tools: TOOL_SPECS.map((spec) => ({ name: spec.name, description: spec.description, status: TOOL_STATUS[spec.name] ?? null })),
        usage7d: {
          turns: total,
          succeeded: ok,
          failed,
          promptTokens: byTool._sum.promptTokens ?? 0,
          completionTokens: byTool._sum.completionTokens ?? 0,
          toolCalls: byTool._sum.toolCalls ?? 0,
          averageLatencyMs: Math.round(byTool._avg.latencyMs ?? 0)
        },
        recent: recent.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
        conversations,
        savedAnswers: savedCount,
        privacy: "Usage rows record counts and latency only. Message content is never returned by this endpoint."
      })
    );
  } catch (error) {
    return jsonError(error);
  }
}
