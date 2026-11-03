import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { COUNTRIES } from "@/lib/config/commerce";
import { CITIES } from "@/lib/config/regions";
import { ApiError } from "@/lib/auth/guard";
import { recordAudit } from "./audit.service";

export type CityActivation = {
  countryCode: string;
  countryName: string;
  city: string;
  code: string;
  enabled: boolean;
  source: "database" | "configuration";
  updatedAt: string | null;
};

type CityRow = { countryCode: string; code: string; name: string; enabled: boolean; updatedAt: Date };

function citySlug(city: string) {
  return city.trim().toLowerCase().replace(/\s+/g, "-");
}

/** Absent rows inherit the country's delivery readiness rather than inventing activation. */
function defaultEnabled(countryCode: string) {
  return Boolean(COUNTRIES[countryCode]?.deliveryEnabled);
}

async function readRows() {
  return prisma.$queryRaw<CityRow[]>`SELECT "countryCode", code, name, enabled, "updatedAt" FROM "CitySetting"`;
}

export async function listCityActivations(): Promise<CityActivation[]> {
  const rows = await readRows();
  const byKey = new Map(rows.map((row) => [`${row.countryCode}:${row.code}`, row]));
  return Object.keys(CITIES).flatMap((countryCode) =>
    CITIES[countryCode].map((city) => {
      const code = citySlug(city);
      const row = byKey.get(`${countryCode}:${code}`);
      return {
        countryCode,
        countryName: COUNTRIES[countryCode]?.name ?? countryCode,
        city,
        code,
        enabled: row?.enabled ?? defaultEnabled(countryCode),
        source: row ? ("database" as const) : ("configuration" as const),
        updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null
      };
    })
  );
}

export async function isCityActivated(countryCode: string, city: string) {
  const code = citySlug(city);
  const rows = await prisma.$queryRaw<CityRow[]>`SELECT "countryCode", code, name, enabled, "updatedAt" FROM "CitySetting" WHERE "countryCode" = ${countryCode.toUpperCase()} AND code = ${code} LIMIT 1`;
  return rows[0] ? rows[0].enabled : defaultEnabled(countryCode.toUpperCase());
}

export async function updateCityActivation(input: {
  actorId: string;
  countryCode: string;
  city: string;
  enabled: boolean;
}): Promise<CityActivation> {
  const countryCode = String(input.countryCode ?? "").trim().toUpperCase();
  const list = CITIES[countryCode];
  if (!list) throw new ApiError(400, "unknown_country", "Unknown country code.");
  const name = list.find((city) => citySlug(city) === citySlug(input.city));
  if (!name) throw new ApiError(400, "unknown_city", "That city is not part of the country catalogue.");
  const code = citySlug(name);
  const before = await isCityActivated(countryCode, name);

  const rows = await prisma.$queryRaw<CityRow[]>`
    INSERT INTO "CitySetting" (id, "countryCode", code, name, enabled, "updatedById", "updatedAt")
    VALUES (${randomUUID()}, ${countryCode}, ${code}, ${name}, ${input.enabled}, ${input.actorId}, NOW())
    ON CONFLICT ("countryCode", code) DO UPDATE SET
      name = EXCLUDED.name,
      enabled = EXCLUDED.enabled,
      "updatedById" = EXCLUDED."updatedById",
      "updatedAt" = NOW()
    RETURNING "countryCode", code, name, enabled, "updatedAt"`;
  const row = rows[0];

  await recordAudit({
    actorId: input.actorId,
    action: "city.updated",
    entity: "City",
    entityId: `${countryCode}:${code}`,
    metadata: { countryCode, city: name, before: { enabled: before }, after: { enabled: row.enabled } }
  });

  return {
    countryCode,
    countryName: COUNTRIES[countryCode]?.name ?? countryCode,
    city: name,
    code,
    enabled: row.enabled,
    source: "database",
    updatedAt: new Date(row.updatedAt).toISOString()
  };
}
