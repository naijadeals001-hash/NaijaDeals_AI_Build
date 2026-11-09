import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireUser, assertSameOrigin } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/services/core/audit.service";
import { jsonSafe } from "@/lib/services/core/serialize";
import {
  createTopUp,
  creditTopUp,
  failTopUp,
  listTopUps,
  testProviderAllowed,
  testProviderAvailable,
  TOP_UP_MIN_KOBO,
  TOP_UP_MAX_KOBO,
  type TopUpProvider
} from "@/lib/services/core/topup.service";

export const dynamic = "force-dynamic";

/**
 * Add Money (wallet top-up).
 *
 * GET  — the caller's own top-ups.
 * POST — start a top-up (action "create"), confirm a provider-verified payment
 *        (action "verify"), or record a provider failure (action "fail").
 *
 * The local test provider is only offered when ENABLE_TEST_PAYMENTS=true outside
 * production. Card and bank top-ups stay unavailable until a sandbox provider is
 * configured; the response says which variable is missing rather than pretending.
 */
async function availableProviders() {
  const providers = [];
  const paystack = Boolean(process.env.PAYSTACK_SECRET_KEY && String(process.env.PAYSTACK_SECRET_KEY).startsWith("sk_test_"));
  const flutterwave = Boolean(
    process.env.FLUTTERWAVE_SECRET_KEY &&
      (String(process.env.FLUTTERWAVE_SECRET_KEY).startsWith("FLWSECK_TEST") || String(process.env.FLUTTERWAVE_SECRET_KEY).startsWith("FLWSECK_TEST-"))
  );
  providers.push({
    id: "paystack",
    label: "Card or bank transfer (Paystack)",
    available: paystack,
    reason: paystack ? null : "Requires PAYSTACK_SECRET_KEY with a test key in this environment."
  });
  providers.push({
    id: "flutterwave",
    label: "Card or bank transfer (Flutterwave)",
    available: flutterwave,
    reason: flutterwave ? null : "Requires FLUTTERWAVE_SECRET_KEY with a test key in this environment."
  });
  const testOk = await testProviderAvailable(prisma);
  providers.push({
    id: "test",
    label: "Local test provider",
    available: testOk,
    reason: testOk
      ? null
      : testProviderAllowed()
        ? "The local test provider only runs against a TEST-classified database."
        : "Set ENABLE_TEST_PAYMENTS=true to use test money in this environment."
  });
  return providers;
}

export async function GET() {
  try {
    const user = await requireUser();
    const [topUps] = await Promise.all([listTopUps(user.id)]);
    // TopUp records carry BigInt amounts; JSON.stringify throws on those, so the
    // shared serialiser converts them to strings. Without it the whole endpoint
    // 500s as soon as the customer has one top-up.
    return NextResponse.json(
      jsonSafe({
        providers: await availableProviders(),
        limits: { minKobo: TOP_UP_MIN_KOBO.toString(), maxKobo: TOP_UP_MAX_KOBO.toString() },
        topUps
      })
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin(request);
    const user = await requireUser();
    const body = await request.json().catch(() => null);
    const action = String(body?.action ?? "create");

    const wallet = await prisma.wallet.findFirst({ where: { userId: user.id }, select: { id: true } });
    if (!wallet) return NextResponse.json({ error: "You have no NaijaPay wallet yet.", code: "wallet_not_found" }, { status: 404 });

    if (action === "create") {
      const provider = String(body?.provider ?? "test") as TopUpProvider;
      if (!["test", "paystack", "flutterwave"].includes(provider)) {
        return NextResponse.json({ error: "Unknown provider.", code: "invalid_provider" }, { status: 400 });
      }
      const offered = (await availableProviders()).find((p) => p.id === provider);
      if (!offered?.available) {
        return NextResponse.json({ error: offered?.reason ?? "That provider is not configured.", code: "provider_unavailable" }, { status: 503 });
      }
      const amountKobo = Number(body?.amountKobo);
      if (!Number.isSafeInteger(amountKobo) || amountKobo <= 0) {
        return NextResponse.json({ error: "Provide amountKobo as a positive integer.", code: "invalid_amount" }, { status: 400 });
      }
      const idempotencyKey = String(body?.idempotencyKey ?? "");
      const providerReference = `${provider.toUpperCase()}-${idempotencyKey}`;

      const { topUp, duplicate } = await createTopUp(prisma, {
        walletId: wallet.id,
        amountKobo: BigInt(amountKobo),
        provider,
        providerReference,
        idempotencyKey
      });
      await recordAudit({
        actorId: user.id,
        action: "pay.topup_created",
        entity: "WalletTopUp",
        entityId: topUp.id,
        metadata: { provider, amountKobo: String(amountKobo), duplicate }
      });
      return NextResponse.json(
        jsonSafe({
          topUpId: topUp.id,
          providerReference: topUp.providerReference,
          status: topUp.status,
          amountKobo: topUp.amountKobo.toString(),
          duplicate,
          // The test provider confirms on this page; real providers return a
          // checkout URL that the client redirects to.
          checkout:
            provider === "test"
              ? { kind: "inline", confirmAction: "verify" }
              : { kind: "redirect", url: null, note: "Sandbox checkout is not wired yet." }
        }),
        { status: duplicate ? 200 : 201 }
      );
    }

    if (action === "verify") {
      const providerReference = String(body?.providerReference ?? "");
      const [topUp] = await prisma.walletTopUp.findMany({ where: { providerReference, walletId: wallet.id }, take: 1 });
      if (!topUp) return NextResponse.json({ error: "Unknown top-up.", code: "topup_not_found" }, { status: 404 });

      // The local test provider is the only one that can confirm here: a real
      // provider must be verified server-side against the provider API.
      if (topUp.provider !== "test") {
        return NextResponse.json(
          { error: "This top-up must be confirmed by the provider's verified webhook, not from the browser.", code: "provider_verification_required" },
          { status: 409 }
        );
      }
      if (!(await testProviderAvailable(prisma))) {
        return NextResponse.json({ error: "The local test provider is disabled in this environment.", code: "test_provider_blocked" }, { status: 403 });
      }

      const result = await creditTopUp(prisma, {
        providerReference,
        verifiedAmountKobo: topUp.amountKobo,
        verifiedCurrency: topUp.currency,
        actorId: user.id,
        raw: { simulated: true, confirmedFrom: "local-test" }
      });
      await recordAudit({
        actorId: user.id,
        action: "pay.topup_credited",
        entity: "WalletTopUp",
        entityId: topUp.id,
        metadata: { provider: topUp.provider, result: result.status }
      });
      return NextResponse.json(result, { status: result.status === "credited" ? 201 : 200 });
    }

    if (action === "fail") {
      const providerReference = String(body?.providerReference ?? "");
      const result = await failTopUp(prisma, { providerReference, reason: String(body?.reason ?? "Provider reported failure.") });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action.", code: "invalid_action" }, { status: 400 });
  } catch (error) {
    return jsonError(error);
  }
}
