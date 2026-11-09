/**
 * NaijaSend image generator (Kie.ai GPT Image 2, 1K tier).
 *
 * Every NaijaSend image is generated via Kie.ai — no stock photography.
 *
 * Ownership rule enforced in the prompts: the artwork depicts transport modes
 * operated by INDEPENDENT providers. No image claims NaijaSend owns a truck,
 * aircraft, ship, rail network or warehouse, and no NaijaSend livery is put on a
 * third-party asset.
 *
 * Usage:
 *   node --env-file=.env scripts/generate-send-images.mjs --plan
 *   node --env-file=.env scripts/generate-send-images.mjs --only=hero,mode-truck
 *   node --env-file=.env scripts/generate-send-images.mjs
 */
import fs from "node:fs";
import path from "node:path";

const API_BASE = process.env.KIE_API_BASE ?? "https://api.kie.ai/api/v1";
const MODEL = process.env.KIE_MODEL ?? "gpt-image-2-text-to-image";
const SIZE = process.env.KIE_IMAGE_SIZE ?? "1K";
const CREDITS_PER_IMAGE = 6;
const USD_PER_CREDIT = 0.005;
const POLL_INTERVAL_MS = 15000;
const MAX_POLLS = 40;
const REGISTRY_PATH = path.join(process.cwd(), "scripts", "image-registry.json");
const OUT_DIR = path.join(process.cwd(), "public", "generated", "send");

const STYLE =
  "Photorealistic editorial logistics photography, bright natural daylight, authentic African operating environment, realistic vehicles and equipment, premium marketplace campaign quality, no text, no words, no watermark, no logos";

const ASSETS = [
  { id: "send-hero", kind: "scene", prompt: `${STYLE}. A confident African logistics coordinator in a high-visibility green vest with arms folded, standing on a highway shoulder with a scene of independent transport behind them: a green container truck, a white delivery van, a white delivery car, a motorcycle courier in green, and in the distance a cargo aircraft on approach over a port with stacked shipping containers and a container ship` },
  { id: "send-banner-business", kind: "scene", prompt: `${STYLE}. Warehouse dock at an African business campus where workers load stacked pallets and cartons into an independent truck, forklift in the background` },
  { id: "send-banner-farm", kind: "scene", prompt: `${STYLE}. Fresh African farm produce in woven baskets and crates ready to be loaded into a small truck at a farm gate, tomatoes and root vegetables, farmer supervising` },
  { id: "send-banner-transporter", kind: "scene", prompt: `${STYLE}. Portrait of a smiling independent African truck owner in a green work shirt beside the cab of their own white truck, holding a clipboard` },
  { id: "send-banner-enterprise", kind: "scene", prompt: `${STYLE}. Two African logistics managers in hard hats and hi-vis vests reviewing a tablet at a busy distribution centre with trucks at loading bays` },
  { id: "send-banner-network", kind: "scene", prompt: `${STYLE}. Wide view of an African integrated freight hub: trucks queued at a warehouse, an aircraft on the apron in the distance and a container terminal behind` },

  { id: "send-mode-truck", kind: "mode", prompt: `${STYLE}. A large green box-body semi truck with a white trailer parked on an African highway, front three-quarter view, clear daylight` },
  { id: "send-mode-van", kind: "mode", prompt: `${STYLE}. White cargo van with its rear doors open at a city kerb, parcel boxes stacked inside` },
  { id: "send-mode-car", kind: "mode", prompt: `${STYLE}. White sedan car with its boot open holding a neatly packed carton, city street in Lagos` },
  { id: "send-mode-motorcycle", kind: "mode", prompt: `${STYLE}. African motorcycle courier in a green delivery vest and helmet, riding with a secured parcel box, side view on a city road` },
  { id: "send-mode-air", kind: "mode", prompt: `${STYLE}. Cargo aircraft on the apron at an African airport with freight pallets being loaded by a loader, morning light` },
  { id: "send-mode-sea", kind: "mode", prompt: `${STYLE}. Container ship alongside a busy African port with gantry cranes and stacked containers` },
  { id: "send-mode-rail", kind: "mode", prompt: `${STYLE}. Freight train with container wagons on tracks through open African terrain, side view` },
  { id: "send-mode-warehouse", kind: "mode", prompt: `${STYLE}. Bright modern warehouse interior with racking, pallets and a forklift, worker checking inventory on a tablet` },

  { id: "send-cat-farm-produce", kind: "category", prompt: `${STYLE}. Crates of fresh African tomatoes, yams, plantain and leafy vegetables arranged for shipment, overhead square frame` },
  { id: "send-cat-food-perishables", kind: "category", prompt: `${STYLE}. Insulated shipping cartons and cold packs with fresh food produce, set in a refrigerated loading area` },
  { id: "send-cat-market-retail", kind: "category", prompt: `${STYLE}. Stacks of cardboard retail cartons and shrink-wrapped goods on a hand truck` },
  { id: "send-cat-industrial", kind: "category", prompt: `${STYLE}. Industrial materials: steel pipes, rolls of wire and timber bundles on a flatbed` },
  { id: "send-cat-construction", kind: "category", prompt: `${STYLE}. Cement bags, bricks and sand arranged on a construction site loading area` },
  { id: "send-cat-machinery", kind: "category", prompt: `${STYLE}. Yellow excavator and generator equipment loaded onto a heavy-haul flatbed trailer` },
  { id: "send-cat-ecommerce", kind: "category", prompt: `${STYLE}. A neat pile of e-commerce parcel boxes with a delivery worker sorting them on a city doorstep` },
  { id: "send-cat-household", kind: "category", prompt: `${STYLE}. Household moving items: wrapped furniture, sealed boxes and mattresses inside a moving van` },

  { id: "send-sol-individuals", kind: "solution", prompt: `${STYLE}. Young African person receiving a wrapped parcel at their front door from a courier` },
  { id: "send-sol-businesses", kind: "solution", prompt: `${STYLE}. African shop owner handing a boxed order to a courier across a shop counter` },
  { id: "send-sol-farmers", kind: "solution", prompt: `${STYLE}. African farmer inspecting freshly harvested produce loaded in a truck bed` },
  { id: "send-sol-manufacturers", kind: "solution", prompt: `${STYLE}. Manufacturing worker in a hi-vis vest beside stacked finished goods awaiting dispatch` },
  { id: "send-sol-institutions", kind: "solution", prompt: `${STYLE}. Modern African hospital or school receiving a delivery of supply cartons at its entrance` },

  { id: "send-step-request", kind: "step", prompt: `${STYLE}. African woman using a smartphone to photograph a box for shipment, warm natural light` },
  { id: "send-step-match", kind: "step", prompt: `${STYLE}. African transport provider in a green vest reviewing orders on a phone outside a truck` },
  { id: "send-step-pickup", kind: "step", prompt: `${STYLE}. Warehouse worker operating a forklift loading cartons into a truck` },
  { id: "send-step-track", kind: "step", prompt: `${STYLE}. Hand holding a smartphone showing an abstract map route, truck visible through a window` },
  { id: "send-step-delivered", kind: "step", prompt: `${STYLE}. Courier handing a parcel to a smiling African customer and shaking hands at the door` },

  { id: "send-app-mockup", kind: "scene", prompt: `${STYLE}. A smartphone in a hand displaying an abstract logistics app interface (colour blocks and route shapes only, no readable text) with a delivery van behind` }
];

function readRegistry() {
  return fs.existsSync(REGISTRY_PATH) ? JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8")) : { currency: "USD", model: MODEL, creditsPerImage: CREDITS_PER_IMAGE, usdPerCredit: USD_PER_CREDIT, assets: [] };
}

function plan(registry) {
  const have = new Set(registry.assets.filter((a) => a.vertical === "send" && a.storagePath).map((a) => a.id));
  const missing = ASSETS.filter((a) => !have.has(a.id));
  const byKind = {};
  for (const a of ASSETS) {
    byKind[a.kind] = byKind[a.kind] ?? { total: 0, have: 0 };
    byKind[a.kind].total += 1;
    if (have.has(a.id)) byKind[a.kind].have += 1;
  }
  return {
    totalAssets: ASSETS.length,
    alreadyGenerated: ASSETS.length - missing.length,
    pending: missing.length,
    byKind,
    costEstimate: {
      model: MODEL,
      size: SIZE,
      creditsPerImage: CREDITS_PER_IMAGE,
      usdPerCredit: USD_PER_CREDIT,
      estimatedCredits: missing.length * CREDITS_PER_IMAGE,
      estimatedUsd: Number((missing.length * CREDITS_PER_IMAGE * USD_PER_CREDIT).toFixed(2)),
      note: "Kie.ai list price, not an invoice; actual credits are read back per job."
    }
  };
}

async function createTask(asset, apiKey) {
  const res = await fetch(`${API_BASE}/jobs/createTask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, input: { prompt: `${asset.prompt}. Square 1:1 orientation.`, size: SIZE } })
  });
  const body = await res.json();
  if (body?.code !== 200 || !body?.data?.taskId) throw new Error(`createTask failed: HTTP ${res.status} ${String(body?.msg ?? "").slice(0, 120)}`);
  return body.data.taskId;
}

async function waitFor(taskId, apiKey) {
  for (let i = 0; i < MAX_POLLS; i += 1) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const body = await (await fetch(`${API_BASE}/jobs/recordInfo?taskId=${taskId}`, { headers: { Authorization: `Bearer ${apiKey}` } })).json().catch(() => null);
    const data = body?.data;
    if (!data) continue;
    if (data.state === "success") {
      const url = JSON.parse(data.resultJson ?? "{}")?.resultUrls?.[0];
      if (!url) throw new Error("Job succeeded without a result URL");
      return { url, credits: data.creditsConsumed ?? CREDITS_PER_IMAGE };
    }
    if (data.state === "fail" || data.state === "error") throw new Error(`Kie.ai job failed: ${data.failMsg ?? data.state}`);
  }
  throw new Error("Kie.ai job timed out");
}

(async () => {
  const registry = readRegistry();
  const apiKey = process.env.KIE_API_KEY;
  if (process.argv.includes("--plan")) {
    console.log(JSON.stringify(plan(registry), null, 2));
    process.exit(0);
  }
  if (!apiKey) {
    console.error(JSON.stringify({ blocked: "missing_credentials", missingInput: "KIE_API_KEY (run with node --env-file=.env …)", ...plan(registry) }));
    process.exit(2);
  }
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const only = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",")) : null;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const byId = new Map(registry.assets.map((a) => [a.id, a]));
  let generated = 0;
  let failed = 0;
  for (const asset of ASSETS) {
    if (only && !only.has(asset.id)) continue;
    const existing = byId.get(asset.id);
    if (existing?.storagePath && fs.existsSync(path.join(process.cwd(), "public", existing.storagePath))) continue;

    let entry = existing ?? { id: asset.id, vertical: "send", kind: asset.kind, prompt: asset.prompt, model: MODEL, size: SIZE, status: "pending", history: [] };
    if (!entry.taskId) entry.taskId = await createTask(asset, apiKey).catch((error) => {
      entry.status = "failed";
      entry.history = [...(entry.history ?? []), { at: new Date().toISOString(), error: String(error).slice(0, 200) }];
      return null;
    });
    const i0 = registry.assets.findIndex((a) => a.id === asset.id);
    if (i0 >= 0) registry.assets[i0] = entry; else registry.assets.push(entry);
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
    if (!entry.taskId) { failed += 1; console.error(`FAILED ${asset.id}`); continue; }

    try {
      const { url, credits } = await waitFor(entry.taskId, apiKey);
      fs.writeFileSync(path.join(OUT_DIR, `${asset.id}.png`), Buffer.from(await (await fetch(url)).arrayBuffer()));
      entry = { ...entry, status: "generated", storagePath: `generated/send/${asset.id}.png`, resultUrl: url, generatedAt: new Date().toISOString(), creditsConsumed: credits, costUsd: Number((credits * USD_PER_CREDIT).toFixed(2)), qualityReview: "pending-owner-review", usageReferences: ["app/naijasend"] };
      generated += 1;
      console.log(`generated ${asset.id} (${credits} credits)`);
    } catch (error) {
      entry.status = "failed";
      entry.history = [...(entry.history ?? []).slice(-4), { at: new Date().toISOString(), error: String(error).slice(0, 200) }];
      failed += 1;
      console.error(`FAILED ${asset.id}: ${error}`);
    }
    const i = registry.assets.findIndex((a) => a.id === asset.id);
    registry.assets[i] = entry;
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  }
  console.log(JSON.stringify({ generated, failed, summary: plan(readRegistry()) }, null, 2));
})();
