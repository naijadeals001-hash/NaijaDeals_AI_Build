/**
 * Bounded Kie.ai generation for the reported Discover Africa theme repairs.
 *
 * Run:
 *   node --env-file=.env scripts/generate-country-image-repair.mjs --plan
 *   node --env-file=.env scripts/generate-country-image-repair.mjs --generate
 *
 * The manifest is deliberately explicit: one row per country/theme pair, never
 * deduplicated by a repeated label. Successful jobs are checkpointed by country
 * code + theme key; a rerun skips completed files and refuses to resubmit an
 * uncertain createTask. No purchase, top-up or alternate provider is used.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const API_BASE = process.env.KIE_API_BASE ?? "https://api.kie.ai/api/v1";
const MODEL = "gpt-image-2-5-flare-text-to-image";
const SIZE = "1K";
const ASPECT = "1:1";
const CREDITS_PER_IMAGE = 6;
const OUT_DIR = path.join(process.cwd(), "public", "generated", "countries");
const LEDGER_PATH = path.join(process.cwd(), "docs", "countries", "image-repair-ledger-2026-11-15.json");
const MANIFEST_PATH = path.join(process.cwd(), "docs", "countries", "image-repair-manifest-2026-11-15.json");
const STYLE =
  "Photorealistic editorial photograph for a premium African country guide, accurate materials, colours and textures, warm natural light, centred composition, generous edge margin, no people, no hands, no text, no letters, no numbers, no logos, no brands, no watermark, no flag, no landmark labels, accurate and recognisable at small card size, not a stock collage, no invented health or safety claims";

const TARGETS = [
  ["GA", "rubber", "Rubber", "rubber latex being tapped into a cup on a rubber tree and folded natural rubber sheets in a Gabonese forest"],
  ["BI", "wild-mushrooms", "Wild mushrooms", "a woven basket of mixed wild forest mushrooms with moss and fallen leaves in a Burundi highland forest"],
  ["KE", "cut-flowers", "Cut flowers", "bunches of fresh roses and seasonal cut flowers being packed in a Kenyan flower-farm workroom with plain unmarked sleeves"],
  ["KE", "export-manufacturing", "Export manufacturing", "a clean garment manufacturing floor with sewing machines, folded cotton fabric and thread spools in Kenya, no people"],
  ["KM", "ylang-ylang", "Ylang-ylang", "fresh yellow ylang-ylang flowers beside a copper distillation vessel and a small plain bottle of essential oil in the Comoros"],
  ["MU", "rum", "Rum and spirits", "an unlabelled amber rum bottle and glass beside cut sugarcane and a small barrel in Mauritius, neutral editorial still life"],
  ["RW", "imigongo", "Imigongo art", "a group of geometric black, white and ochre earth-painted Imigongo panels from Rwanda with raised angular patterns"],
  ["UG", "barkcloth", "Barkcloth", "folded textured barkcloth made from beaten fig-tree bark in Uganda, showing its natural grain and warm earth tone"],
  ["DZ", "carpets", "Woven carpets", "a hand-knotted wool Berber carpet from Algeria with geometric diamond motifs, folded to show pile and fringe"],
  ["DZ", "pottery", "Pottery and ceramics", "handmade Algerian Berber pottery with painted geometric bands, bowls and a tall vessel on a neutral surface"],
  ["EG", "furniture", "Furniture", "a handcrafted wooden Egyptian chair and side table with mashrabiya latticework and carved details in a neutral workshop"],
  ["LY", "gharyan-pottery", "Gharyan pottery", "traditional Gharyan Libyan glazed pottery in deep blue, green and cream, plates and a jug on a pale surface"],
  ["MA", "argan", "Argan", "argan nuts and kernels beside a small unlabelled bottle of golden argan oil and argan tree branches in Morocco"],
  ["MA", "woven-textiles", "Woven textiles", "a folded Moroccan handwoven wool textile with geometric bands and fringe, showing warp and weft texture"],
  ["SD", "henna", "Henna", "fresh henna leaves, a bowl of green henna powder and a small dish of prepared henna paste in Sudan"],
  ["TN", "carpets", "Carpets and flat-weave textiles", "a Tunisian flat-weave kilim with geometric bands and fringe, folded to show the weave and earthy colours"],
  ["TN", "ceramics", "Ceramics", "painted Nabeul Tunisian ceramic plates and bowls with blue, yellow and green floral motifs on a pale surface"],
  ["BW", "wiring-harnesses", "Vehicle wiring sets", "coiled automotive wiring harnesses with multi-pin connectors, insulated wires and a fuse block in Botswana, no vehicle branding"],
  ["LS", "wool", "Wool", "raw Lesotho wool fleece, carded wool and a skein of undyed yarn arranged on a neutral work surface"],
  ["LS", "mohair", "Mohair", "curly lustrous mohair locks and spun mohair yarn from Lesotho, showing the characteristic long fibre"],
  ["LS", "bottled-water", "Highland water", "clear highland spring water in a plain glass beside a rocky Lesotho mountain stream, no bottle branding"],
  ["LS", "automotive-components", "Automotive components", "machined gears, bearings and engine components arranged on a workshop bench in Lesotho, no vehicle branding"],
  ["MW", "tobacco", "Tobacco", "cured tobacco leaves hanging in neat rows in a Malawi drying barn, neutral editorial documentation"],
  ["SZ", "candles", "Handcrafted candles", "handmade plain candles in cream, ochre and green beside a wooden mould and cotton wicks in Eswatini"],
  ["ZA", "wine", "Wine", "a South African vineyard row beside an unlabelled dark wine bottle and a glass of red wine on a wooden table"],
  ["ZA", "mohair", "Mohair", "curly white mohair fleece and fine spun mohair yarn from South Africa on a neutral surface"],
  ["ZW", "tobacco", "Tobacco", "cured tobacco leaves in a Zimbabwean drying barn, stacked in neat bundles with natural leaf texture"],
  ["ZW", "crafts", "Stone sculpture and crafts", "carved Shona stone sculptures from Zimbabwe in dark serpentine and pale soapstone, with simple chisels"],
  ["CI", "hydrocarbons", "Oil and gas", "an offshore oil and gas platform with a flare stack on the horizon off Côte d'Ivoire, clear daylight, no branding"],
  ["GM", "tourism", "Tourism", "Kunta Kinteh Island and the River Gambia with mangroves and historic stone ruins, a verified Gambian heritage landscape"],
  ["GN", "hydropower", "Hydropower", "a concrete hydropower dam and spillway on a forested Guinean river with mist and falling water"],
  ["LR", "rubber", "Rubber", "rubber latex collection cups and scored rubber trees with folded natural rubber sheets in Liberia"],
  ["ML", "bogolan", "Bogolan", "folded Malian bogolan mud cloth with bold geometric symbols in black, white and ochre, showing hand-painted texture"],
  ["MR", "natural-gas", "Natural gas", "a natural-gas processing pipeline and compressor station in the Mauritanian desert, industrial editorial image, no branding"],
  ["MR", "tourism", "Tourism", "the stone library and narrow historic streets of Chinguetti, Mauritania, a verified Saharan heritage location"],
  ["NE", "oil", "Oil", "an oil drilling pumpjack and desert wellhead in Niger's Sahel landscape, neutral industrial documentation"],
  ["SL", "marine-fisheries", "Marine fisheries", "colourful fishing boats and drying nets on the Sierra Leone coast with local wooden pirogues"],
  ["SL", "tourism", "Tourism and heritage", "the stone ruins of Bunce Island on the Sierra Leone River surrounded by water and tropical vegetation, heritage editorial"],
  ["TG", "manufacturing", "Manufacturing", "a clean agro-processing workshop with stainless-steel machinery, sacks and plain containers in Togo, no people or branding"],
  ["CV", "tourism", "Island tourism", "the volcanic ridges and terraced valley of Santo Antão, Cabo Verde, with a winding mountain path, not a generic beach"],
  ["GW", "ecotourism", "Bijagós ecotourism", "a narrow mangrove channel in the Bijagós archipelago of Guinea-Bissau with a small traditional wooden boat"],
  ["GH", "handwoven-textiles", "Fugu and handwoven cloth", "folded Ghanaian kente and fugu handwoven strips with geometric patterns and visible handloom texture"],
  ["NG", "textiles-and-crafts", "Textiles and crafts", "Nigerian indigo adire cloth with resist-dyed patterns beside carved wooden craft objects and a woven basket"],
  ["CM", "rubber-palm-oil-and-bananas", "Rubber, palm oil and bananas", "rubber latex tapping, a bunch of red palm fruit and green bananas from Cameroon arranged as an agricultural still life"]
].map(([countryCode, key, label, subject]) => ({
  countryCode,
  key,
  label,
  file: `theme-${countryCode.toLowerCase()}-${key}.webp`,
  alt: `${subject}. Illustrative editorial image for the ${label} theme.`,
  prompt: `${subject}. ${STYLE}.`
}));

function fail(message) {
  console.error(`BLOCKED ${message}`);
  process.exit(2);
}
function readLedger() {
  if (!fs.existsSync(LEDGER_PATH)) {
    return { model: MODEL, size: SIZE, aspectRatio: ASPECT, price: { creditsPerImage: CREDITS_PER_IMAGE }, assets: [], balanceBefore: null, balanceAfter: null };
  }
  return JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8"));
}
function writeLedger(ledger) {
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  fs.writeFileSync(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`);
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify({ model: MODEL, size: SIZE, aspectRatio: ASPECT, targets: TARGETS.map(({ prompt, ...row }) => row) }, null, 2)}\n`);
}
async function credits(apiKey) {
  const response = await fetch(`${API_BASE}/chat/credit`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(30000) });
  const body = await response.json().catch(() => null);
  if (body?.code !== 200 || typeof body?.data !== "number") throw new Error(`credit read failed: ${response.status}/${body?.code}`);
  return body.data;
}
async function createTask(target, apiKey) {
  let response;
  try {
    response = await fetch(`${API_BASE}/jobs/createTask`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: MODEL, input: { prompt: target.prompt, resolution: SIZE, aspect_ratio: ASPECT } }),
      signal: AbortSignal.timeout(60000)
    });
  } catch (error) {
    throw new Error(`createTask transport error; no automatic retry: ${error.message}`);
  }
  const body = await response.json().catch(() => null);
  if (body?.code !== 200 || !body?.data?.taskId) throw new Error(`createTask failed: HTTP ${response.status} code=${body?.code}`);
  return body.data.taskId;
}
async function pollTask(taskId, apiKey) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10000));
    const response = await fetch(`${API_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(30000) });
    const body = await response.json().catch(() => null);
    const data = body?.data;
    if (!data) continue;
    if (data.state === "success") {
      const url = JSON.parse(data.resultJson ?? "{}")?.resultUrls?.[0] ?? null;
      if (!url) throw new Error("success without result URL");
      return { status: "success", url, credits: data.creditsConsumed ?? null };
    }
    if (data.state === "fail" || data.state === "error") {
      return { status: "failed", credits: data.creditsConsumed ?? 0, failMsg: String(data.failMsg ?? data.state).slice(0, 300) };
    }
  }
  return { status: "timeout" };
}
async function download(target, url, taskId) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`download HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const source = await sharp(buffer).metadata();
  if ((source.width ?? 0) < 900 || (source.height ?? 0) < 900) throw new Error(`provider output ${source.width}x${source.height} too small`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const webp = path.join(OUT_DIR, target.file);
  await sharp(buffer).resize(900, 900, { fit: "cover", position: "centre" }).webp({ quality: 82, effort: 5 }).toFile(webp);
  return { sourceWidth: source.width, sourceHeight: source.height, webpPath: `/generated/countries/${target.file}`, bytes: fs.statSync(webp).size };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const ledger = readLedger();
  const pending = TARGETS.filter((target) => {
    const entry = ledger.assets.find((row) => row.countryCode === target.countryCode && row.key === target.key);
    return !(entry?.status === "generated" && fs.existsSync(path.join(process.cwd(), "public", entry.webpPath.replace(/^\/+/, ""))));
  });
  if (args.has("--plan") || !args.has("--generate")) {
    console.log(JSON.stringify({ model: MODEL, size: SIZE, aspectRatio: ASPECT, targets: TARGETS.length, pending: pending.length, expectedCredits: pending.length * CREDITS_PER_IMAGE, balance: ledger.balanceBefore, pendingKeys: pending.map((row) => `${row.countryCode}/${row.key}`) }, null, 2));
    return;
  }
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) fail("KIE_API_KEY missing");
  ledger.balanceBefore = await credits(apiKey);
  writeLedger(ledger);
  const queue = [...pending];
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length > 0) {
      const target = queue.shift();
      if (!target) return;
      let entry = ledger.assets.find((row) => row.countryCode === target.countryCode && row.key === target.key);
      if (!entry) {
        entry = { countryCode: target.countryCode, key: target.key, label: target.label, file: target.file, alt: target.alt, prompt: target.prompt, status: "pending", taskId: null, credits: null };
        ledger.assets.push(entry);
      }
      if (entry.status === "submit_uncertain") {
        console.error(JSON.stringify({ skipped: `${target.countryCode}/${target.key}`, reason: "uncertain prior submission; refusing duplicate" }));
        continue;
      }
      if (!entry.taskId) {
        entry.status = "submitting";
        writeLedger(ledger);
        try {
          entry.taskId = await createTask(target, apiKey);
          entry.status = "submitted";
          writeLedger(ledger);
          console.log(JSON.stringify({ submitted: `${target.countryCode}/${target.key}`, taskId: entry.taskId }));
        } catch (error) {
          entry.status = "submit_uncertain";
          entry.lastError = error.message;
          writeLedger(ledger);
          continue;
        }
      }
      const result = await pollTask(entry.taskId, apiKey);
      if (result.status === "success") {
        try {
          Object.assign(entry, await download(target, result.url, entry.taskId), { status: "generated", credits: result.credits ?? CREDITS_PER_IMAGE, generatedAt: new Date().toISOString(), lastError: null });
          console.log(JSON.stringify({ generated: `${target.countryCode}/${target.key}`, taskId: entry.taskId, credits: entry.credits, webpPath: entry.webpPath }));
        } catch (error) {
          entry.status = "download_failed";
          entry.lastError = error.message;
        }
      } else if (result.status === "failed") {
        entry.status = "failed";
        entry.credits = result.credits ?? 0;
        entry.lastError = result.failMsg;
      } else {
        entry.status = "timeout";
        entry.lastError = "still processing; task id retained";
      }
      writeLedger(ledger);
    }
  });
  await Promise.all(workers);
  ledger.balanceAfter = await credits(apiKey).catch(() => null);
  writeLedger(ledger);
  const generated = ledger.assets.filter((row) => row.status === "generated");
  console.log(JSON.stringify({ generated: generated.length, expected: TARGETS.length, credits: generated.reduce((sum, row) => sum + (row.credits ?? 0), 0), balanceBefore: ledger.balanceBefore, balanceAfter: ledger.balanceAfter, failures: ledger.assets.filter((row) => ["failed", "timeout", "submit_uncertain", "download_failed"].includes(row.status)) }, null, 2));
}
main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
