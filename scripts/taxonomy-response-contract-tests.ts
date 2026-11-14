#!/usr/bin/env node
/**
 * Public taxonomy response-contract tests.
 *
 * Pure client-side checks with a mocked `fetch`: no database, server, model or
 * external provider is contacted. Proves that:
 *   - a valid empty taxonomy stays an honest empty state;
 *   - missing/non-boolean `browsingVisible` or `canPublish`, a non-array root
 *     and malformed category entries fail closed with
 *     `TaxonomyApiError` 502 / `malformed_taxonomy_response`;
 *   - a partial but otherwise valid response (missing counts) still renders
 *     with unavailable counts rather than being rejected;
 *   - seller categories require an explicit boolean `canPublish`;
 *   - the rail mapper never promotes a missing flag into an eligible card.
 *
 * Usage:
 *   npx tsx scripts/taxonomy-response-contract-tests.ts
 */
import { categoryRailEntry } from "../components/shop/category-rail";
import {
  TaxonomyApiError,
  getPublicLevelOneCategories,
  getPublicTaxonomy,
  getSellerCategories
} from "../lib/taxonomy-api";

let failures = 0;
let passes = 0;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passes += 1;
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL  ${name} — ${error instanceof Error ? error.message : String(error)}`);
  }
}

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

/** Install a one-response fetch stub; call again for the next response. */
function respondWith(body: unknown, status = 200): { calls: string[] } {
  const calls: string[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    calls.push(String(input));
    return jsonResponse(body, status);
  }) as typeof fetch;
  return { calls };
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error;
  }
}

function expectMalformed(error: unknown, label: string) {
  assert(error instanceof TaxonomyApiError, `${label}: expected TaxonomyApiError, got ${String(error)}`);
  assert(error.status === 502, `${label}: expected status 502, got ${error.status}`);
  assert(
    error.code === "malformed_taxonomy_response",
    `${label}: expected code malformed_taxonomy_response, got ${String(error.code)}`
  );
  assert(/unusable response/i.test(error.message), `${label}: expected an unavailable-response message`);
}

const baseNode = {
  id: "node-1",
  key: "node.one",
  name: "Node One",
  slug: "node-one",
  level: 1,
  sortOrder: 1,
  browsingVisible: true,
  canPublish: true,
  restrictionNote: null,
  restrictionReason: null,
  isRegulated: false,
  productCount: 2,
  subtreeProductCount: 4,
  parentId: "dept-1",
  parentName: "Department One"
};

async function main() {
  try {
    await check("valid empty level-1 response is an honest empty state", async () => {
      const stub = respondWith({ countryCode: "NG", city: "Lagos", categories: [] });
      const result = await getPublicLevelOneCategories({ country: "NG", city: "Lagos" });
      assert(result.categories.length === 0, "empty categories were not preserved");
      assert(stub.calls.length === 1 && stub.calls[0].includes("country=NG"), "market query was not sent");
    });

    await check("valid empty department tree is an honest empty state", async () => {
      respondWith({ countryCode: "NG", city: null, departments: [] });
      const result = await getPublicTaxonomy({ country: "NG" });
      assert(result.departments.length === 0, "empty departments were not preserved");
    });

    await check("legacy categories alias is accepted when departments is absent", async () => {
      respondWith({ countryCode: "NG", city: null, categories: [baseNode] });
      const result = await getPublicTaxonomy({ country: "NG" });
      assert(result.departments.length === 1 && result.departments[0].slug === "node-one", "legacy alias failed");
    });

    await check("missing category canPublish is rejected, not defaulted", async () => {
      const node: Record<string, unknown> = { ...baseNode };
      delete node.canPublish;
      respondWith({ countryCode: "NG", city: null, categories: [node] });
      expectMalformed(
        await rejectionOf(getPublicLevelOneCategories({ country: "NG" })),
        "missing canPublish"
      );
    });

    await check("missing category browsingVisible is rejected, not defaulted", async () => {
      const node: Record<string, unknown> = { ...baseNode };
      delete node.browsingVisible;
      respondWith({ countryCode: "NG", city: null, categories: [node] });
      expectMalformed(
        await rejectionOf(getPublicLevelOneCategories({ country: "NG" })),
        "missing browsingVisible"
      );
    });

    await check("non-boolean eligibility flags are rejected", async () => {
      respondWith({
        countryCode: "NG",
        city: null,
        categories: [{ ...baseNode, browsingVisible: "true", canPublish: 1 }]
      });
      expectMalformed(
        await rejectionOf(getPublicLevelOneCategories({ country: "NG" })),
        "non-boolean flags"
      );
    });

    await check("a response for another market is rejected as stale data", async () => {
      respondWith({ countryCode: "GH", city: "Accra", categories: [baseNode] });
      expectMalformed(
        await rejectionOf(getPublicLevelOneCategories({ country: "NG", city: "Lagos" })),
        "cross-market categories"
      );
      respondWith({ countryCode: "GH", city: "Accra", departments: [] });
      expectMalformed(
        await rejectionOf(getPublicTaxonomy({ country: "NG", city: "Lagos" })),
        "cross-market departments"
      );
    });

    await check("non-array categories body is rejected", async () => {
      respondWith({ countryCode: "NG", city: null, categories: { id: "not-an-array" } });
      expectMalformed(
        await rejectionOf(getPublicLevelOneCategories({ country: "NG" })),
        "non-array categories"
      );
    });

    await check("missing categories key is rejected", async () => {
      respondWith({ countryCode: "NG", city: null });
      expectMalformed(
        await rejectionOf(getPublicLevelOneCategories({ country: "NG" })),
        "missing categories key"
      );
    });

    await check("non-object body is rejected", async () => {
      respondWith([baseNode]);
      expectMalformed(await rejectionOf(getPublicTaxonomy({ country: "NG" })), "array body");
      respondWith(null);
      expectMalformed(await rejectionOf(getPublicTaxonomy({ country: "NG" })), "null body");
    });

    await check("non-array departments body is rejected even with a categories alias", async () => {
      respondWith({ departments: null, categories: [baseNode] });
      expectMalformed(await rejectionOf(getPublicTaxonomy({ country: "NG" })), "non-array departments");
    });

    await check("malformed category entries are rejected", async () => {
      respondWith({ countryCode: "NG", city: null, categories: ["not-a-node"] });
      expectMalformed(
        await rejectionOf(getPublicLevelOneCategories({ country: "NG" })),
        "string category entry"
      );
      respondWith({ countryCode: "NG", city: null, categories: [{ ...baseNode, id: "" }] });
      expectMalformed(
        await rejectionOf(getPublicLevelOneCategories({ country: "NG" })),
        "empty category id"
      );
    });

    await check("non-array children are rejected", async () => {
      respondWith({
        countryCode: "NG",
        city: null,
        departments: [{ ...baseNode, level: 0, children: "none" }]
      });
      expectMalformed(await rejectionOf(getPublicTaxonomy({ country: "NG" })), "non-array children");
    });

    await check("missing counts stay valid and render as unavailable", async () => {
      const node: Record<string, unknown> = { ...baseNode };
      delete node.productCount;
      delete node.subtreeProductCount;
      respondWith({ countryCode: "NG", city: null, categories: [node] });
      const result = await getPublicLevelOneCategories({ country: "NG" });
      const entry = categoryRailEntry(result.categories[0]);
      assert(entry, "valid category with missing counts was rejected");
      assert(entry.count === null, `missing counts became ${String(entry.count)}`);
    });

    await check("seller categories require an explicit boolean canPublish", async () => {
      respondWith({ categories: [{ id: "seller-1", name: "Seller One", canPublish: "yes" }] });
      expectMalformed(await rejectionOf(getSellerCategories()), "seller canPublish string");
      respondWith({ categories: [{ id: "seller-1", name: "Seller One" }] });
      expectMalformed(await rejectionOf(getSellerCategories()), "seller missing canPublish");
      respondWith({ categories: {} });
      expectMalformed(await rejectionOf(getSellerCategories()), "seller non-array categories");
    });

    await check("seller categories fail closed for publication and selection", async () => {
      respondWith({
        categories: [
          { id: "seller-1", name: "Seller One", canPublish: false },
          { id: "seller-2", name: "Seller Two", canPublish: true, isSelectable: false },
          { id: "seller-3", name: "Seller Three", canPublish: true, isSelectable: true }
        ]
      });
      const rows = await getSellerCategories();
      assert(rows[0]?.canPublish === false, "explicit canPublish=false became publishable");
      assert(rows[1]?.canPublish === true && rows[1]?.isSelectable === false, "selection flag was not preserved");
      assert(rows[2]?.canPublish === true && rows[2]?.isSelectable === true, "valid seller category was rejected");
    });

    await check("rail mapper never promotes missing flags", async () => {
      const valid = categoryRailEntry(baseNode);
      assert(valid && valid.canPublish === true, "valid node was rejected by the rail mapper");
      const missingBrowsing = categoryRailEntry({ ...baseNode, browsingVisible: undefined } as never);
      assert(missingBrowsing === null, "missing browsingVisible was rendered");
      const missingPublish = categoryRailEntry({ ...baseNode, canPublish: undefined } as never);
      assert(missingPublish === null, "missing canPublish was rendered as eligible");
      const restricted = categoryRailEntry({ ...baseNode, canPublish: false });
      assert(restricted && restricted.canPublish === false, "explicit canPublish=false was not preserved");
      const notLevelOne = categoryRailEntry({ ...baseNode, level: 2 });
      assert(notLevelOne === null, "a leaf was rendered as a level-1 card");
    });

    await check("a blank market is rejected before any fetch", async () => {
      const calls: string[] = [];
      globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
        calls.push(String(input));
        return jsonResponse({});
      }) as typeof fetch;
      const error = await rejectionOf(getPublicLevelOneCategories({ country: " " }));
      assert(error instanceof TaxonomyApiError, "blank market did not throw TaxonomyApiError");
      assert(error.code === "country_required", `blank market code ${String(error.code)}`);
      assert(calls.length === 0, "blank market still performed a request");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("");
  console.log(`RESULT ${passes}/${passes + failures} checks passed.`);
  if (failures > 0) {
    console.error(`FAILED ${failures} check(s).`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});
