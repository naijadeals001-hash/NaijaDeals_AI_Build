/** NaijaEats partner imagery via the verified Kie.ai GPT Image 2 REST integration. */
import fs from "node:fs";
import path from "node:path";
const API = process.env.KIE_API_BASE ?? "https://api.kie.ai/api/v1";
const MODEL = process.env.KIE_MODEL ?? "gpt-image-2-text-to-image";
const SIZE = process.env.KIE_IMAGE_SIZE ?? "1K";
const KEY = process.env.KIE_API_KEY;
if (!KEY) { console.error("KIE_API_KEY missing"); process.exit(2); }
const OUT = path.join(process.cwd(), "public", "generated", "eats");
const ASSETS = [
  { id: "partners-delivery", file: "partners-delivery.png", prompt: "Photorealistic editorial photograph, Lagos Nigeria. Three African food delivery partners standing together: a smiling man in a deep forest-green uniform and helmet seated on a red motorbike with a large insulated green food bag, a smiling woman in the same uniform on a bicycle with a green insulated delivery backpack, and a smiling man beside a silver hatchback holding a green insulated food bag. Bright daylight, leafy modern Lagos street cafe backdrop, authentic Nigerian people, realistic faces, natural skin tones, premium brand campaign photography, shallow depth of field. Each insulated bag and shirt carries a small embroidered badge reading NaijaEats. No other text, no watermarks." },
  { id: "partners-restaurant", file: "partners-restaurant.png", prompt: "Photorealistic editorial photograph inside a warm Nigerian restaurant. A Nigerian female chef in a white chef jacket and apron smiling as she hands a plain kraft paper takeaway bag to a Nigerian male delivery rider in a deep forest-green uniform holding a green insulated food bag. Shelves of ingredients behind them, warm natural window light, authentic faces, premium brand campaign photography. Each insulated bag and the rider shirt carry a small embroidered badge reading NaijaEats. No other text, no watermarks." }
];
async function create(asset) {
  const res = await fetch(`${API}/jobs/createTask`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` }, body: JSON.stringify({ model: MODEL, input: { prompt: asset.prompt, size: SIZE } }) });
  const body = await res.json();
  if (body?.code !== 200 || !body?.data?.taskId) throw new Error(`createTask ${res.status} ${String(body?.msg ?? "").slice(0, 120)}`);
  return body.data.taskId;
}
async function wait(taskId) {
  for (let i = 0; i < 50; i += 1) {
    await new Promise((r) => setTimeout(r, 12000));
    const data = (await (await fetch(`${API}/jobs/recordInfo?taskId=${taskId}`, { headers: { Authorization: `Bearer ${KEY}` } })).json().catch(() => null))?.data;
    if (!data) continue;
    if (data.state === "success") {
      const url = JSON.parse(data.resultJson ?? "{}")?.resultUrls?.[0];
      if (!url) throw new Error("no result URL");
      return { url, credits: data.creditsConsumed ?? 6 };
    }
    if (data.state === "fail" || data.state === "error") throw new Error(`job failed: ${data.failMsg ?? data.state}`);
  }
  throw new Error("timed out");
}
fs.mkdirSync(OUT, { recursive: true });
const registryPath = path.join(OUT, "partners-provenance.json");
const registry = fs.existsSync(registryPath) ? JSON.parse(fs.readFileSync(registryPath, "utf8")) : { provider: "kie.ai", model: MODEL, size: SIZE, assets: [] };
let spent = 0;
for (const asset of ASSETS) {
  const file = path.join(OUT, asset.file);
  if (fs.existsSync(file) && registry.assets.some((row) => row.id === asset.id)) { console.log(`skip ${asset.id}`); continue; }
  const taskId = await create(asset);
  const { url, credits } = await wait(taskId);
  fs.writeFileSync(file, Buffer.from(await (await fetch(url)).arrayBuffer()));
  spent += credits;
  registry.assets = registry.assets.filter((row) => row.id !== asset.id).concat({ id: asset.id, path: `/generated/eats/${asset.file}`, prompt: asset.prompt, created: new Date().toISOString().slice(0, 10), credits, costUsd: Number((credits * 0.005).toFixed(2)) });
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
  console.log(`generated ${asset.id} credits=${credits}`);
}
console.log(`session_credits=${spent}`);
