import { prisma } from "@/lib/prisma";
import { COUNTRIES } from "@/lib/config/commerce";
import { ApiError } from "@/lib/auth/guard";
import { recordAudit } from "./audit.service";

export type CountryActivation = {
  code: string;
  name: string;
  currency: string;
  enabled: boolean;
  deliveryEnabled: boolean;
  configuredEnabled: boolean;
  configuredDeliveryEnabled: boolean;
  source: "database" | "configuration";
  updatedAt: string | null;
};

type SettingRow = { code: string; enabled: boolean; deliveryEnabled: boolean; updatedAt: Date };

/**
 * Raw SQL keeps activation working even when a long-running dev server still has
 * a generated Prisma client from before the CountrySetting model existed.
 */
async function readOverrides(): Promise<SettingRow[]> {
  return prisma.$queryRaw<SettingRow[]>`SELECT code, enabled, "deliveryEnabled", "updatedAt" FROM "CountrySetting"`;
}

export async function activationFor(code: string): Promise<{ enabled: boolean; deliveryEnabled: boolean } | null> {
  const rows = await prisma.$queryRaw<SettingRow[]>`SELECT code, enabled, "deliveryEnabled", "updatedAt" FROM "CountrySetting" WHERE code = ${code} LIMIT 1`;
  const row = rows[0];
  return row ? { enabled: row.enabled, deliveryEnabled: row.deliveryEnabled } : null;
}

export async function listCountryActivations(): Promise<CountryActivation[]> {
  const rows = await readOverrides();
  const byCode = new Map(rows.map((row) => [row.code, row]));
  return Object.values(COUNTRIES).map((country) => {
    const row = byCode.get(country.code);
    return {
      code: country.code,
      name: country.name,
      currency: country.currency,
      enabled: row?.enabled ?? country.enabled,
      deliveryEnabled: row?.deliveryEnabled ?? country.deliveryEnabled,
      configuredEnabled: country.enabled,
      configuredDeliveryEnabled: country.deliveryEnabled,
      source: row ? ("database" as const) : ("configuration" as const),
      updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null
    };
  });
}

export async function updateCountryActivation(input: {
  actorId: string;
  code: string;
  enabled: boolean;
  deliveryEnabled: boolean;
}): Promise<CountryActivation> {
  const code = String(input.code ?? "").trim().toUpperCase();
  const country = COUNTRIES[code];
  if (!country) throw new ApiError(400, "unknown_country", "Unknown country code.");

  const current = await activationFor(code);
  const before = {
    enabled: current?.enabled ?? country.enabled,
    deliveryEnabled: current?.deliveryEnabled ?? country.deliveryEnabled
  };

  const rows = await prisma.$queryRaw<SettingRow[]>`
    INSERT INTO "CountrySetting" (code, enabled, "deliveryEnabled", "updatedById", "updatedAt")
    VALUES (${code}, ${input.enabled}, ${input.deliveryEnabled}, ${input.actorId}, NOW())
    ON CONFLICT (code) DO UPDATE SET
      enabled = EXCLUDED.enabled,
      "deliveryEnabled" = EXCLUDED."deliveryEnabled",
      "updatedById" = EXCLUDED."updatedById",
      "updatedAt" = NOW()
    RETURNING code, enabled, "deliveryEnabled", "updatedAt"`;
  const row = rows[0];

  await recordAudit({
    actorId: input.actorId,
    action: "country.updated",
    entity: "Country",
    entityId: code,
    metadata: {
      before,
      after: { enabled: row.enabled, deliveryEnabled: row.deliveryEnabled }
    }
  });

  return {
    code,
    name: country.name,
    currency: country.currency,
    enabled: row.enabled,
    deliveryEnabled: row.deliveryEnabled,
    configuredEnabled: country.enabled,
    configuredDeliveryEnabled: country.deliveryEnabled,
    source: "database" as const,
    updatedAt: new Date(row.updatedAt).toISOString()
  };
}
