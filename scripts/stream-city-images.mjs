/**
 * NaijaStream city imagery + missing artist portraits via the verified Kie.ai
 * GPT Image 2 pipeline (1K, 6 credits ≈ $0.03 per image).
 *
 * Every prompt names a real, researched landmark or district for that city so
 * images are geographically specific rather than a generic African skyline.
 * Outputs are labelled AI-generated city illustrations in the registry — they
 * are editorial artwork, not documentary photographs.
 *
 * Usage:
 *   node --env-file=.env scripts/stream-city-images.mjs --queue      # print queue + cost
 *   node --env-file=.env scripts/stream-city-images.mjs --run        # generate pending
 *   node --env-file=.env scripts/stream-city-images.mjs --run --only=lagos,accra
 */
import fs from "node:fs";
import path from "node:path";

const API_BASE = "https://api.kie.ai/api/v1";
const MODEL = "gpt-image-2-text-to-image";
const SIZE = "1K";
const CREDITS_PER_IMAGE = 6;
const USD_PER_CREDIT = 0.005;
const REGISTRY_PATH = path.join(process.cwd(), "scripts", "image-registry.json");
const OUT_DIR = path.join(process.cwd(), "public", "generated", "stream", "cities");

const STYLE =
  "Wide cinematic editorial cityscape illustration, warm late-afternoon light, rich but natural colour grading, clean composition with clear sky area for text overlay, no text, no lettering, no watermark, no logo";

/** City prompts: real landmark/district, distinguishing detail, explicit avoidance. */
export const CITIES = [
  // West Africa
  { slug: "lagos", subject: "Lekki-Ikoyi Link Bridge", prompt: "Lagos, Nigeria: the white Lekki-Ikoyi Link Bridge with its single pylon and fan of stay cables crossing Five Cowrie Creek, low-rise Ikoyi and Lekki towers behind, golden-hour lagoon haze; avoid Third Mainland Bridge shapes and cliffs" },
  { slug: "abuja", subject: "National Mosque and National Christian Centre", prompt: "Abuja, Nigeria: the golden-domed National Mosque and its four slender minarets across the boulevard from the white tent-shaped National Christian Centre, with the granite Aso Rock monolith on the skyline behind; no beach, no glass-tower fantasy" },
  { slug: "accra", subject: "Jamestown lighthouse and Independence Arch", prompt: "Accra, Ghana: the red-and-white banded Jamestown lighthouse above the corrugated-iron fishing quarter on the Atlantic coast, with the gold-and-white Black Star Independence Arch nearby; not a European castle" },
  { slug: "kumasi", subject: "Kejetia Market", prompt: "Kumasi, Ghana: the vast sweeping roof of Kejetia Central Market packed with colourful stalls, Akan red and gold kente cloth, market traders in motion, green Ashanti hills behind; a living modern market, not a village hut bazaar" },
  { slug: "dakar", subject: "African Renaissance Monument", prompt: "Dakar, Senegal: the 49-metre bronze African Renaissance Monument group on its volcanic hill at Ouakam with the staircase below and the Atlantic and Cap-Vert coast beyond, warm evening light; a group of figures, not a single statue or pyramid" },
  { slug: "abidjan", subject: "St Paul's Cathedral and Plateau skyline", prompt: "Abidjan, Côte d'Ivoire: the striking triangular concrete St Paul's Cathedral with sweeping cable-tied arms, over the Ébrié Lagoon with the Plateau district glass towers on the far bank at dusk; lagoon not ocean beach" },
  { slug: "cotonou", subject: "Monument Amazone", prompt: "Cotonou, Benin: the 30-metre bronze Amazone warrior statue with spear and shield on the Marina esplanade by the lagoon, palm trees and city lights behind, Benin flag colours of green yellow and red in the scene; not an abstract sculpture" },
  { slug: "freetown", subject: "Aberdeen-Lumley coastline", prompt: "Freetown, Sierra Leone: the white-sand Aberdeen and Lumley beachfront beneath steep green forested hills, clapboard houses and the city rising up the hillside, fishing boats on the Atlantic; not a flat coastal city" },
  { slug: "monrovia", subject: "Ducor Hotel hilltop and Mesurado estuary", prompt: "Monrovia, Liberia: the hilltop shell of the Ducor Hotel overlooking the Atlantic and the Mesurado river mouth, weather-worn concrete arches, low rooftops and wetlands of the city below, humid tropical light; not a functioning luxury hotel, not a resort beach" },
  // East Africa
  { slug: "nairobi", subject: "KICC tower", prompt: "Nairobi, Kenya: the 1970s cylindrical concrete KICC tower with its terracotta conical auditorium standing above the dense downtown high-rise grid, clear African highland daylight; not a generic postmodern glass tower" },
  { slug: "mombasa", subject: "Fort Jesus and Old Town", prompt: "Mombasa, Kenya: the ochre coral-stone ramparts and bastions of the 1593 Portuguese Fort Jesus above Kilindini harbour, with the whitewashed lanes and carved wooden doors of the Swahili Old Town below, Indian Ocean light; not a European medieval castle" },
  { slug: "kampala", subject: "Uganda National Mosque on Old Kampala Hill", prompt: "Kampala, Uganda: the green-and-white domes and tall minaret of the Uganda National Mosque rising over the seven green hills of the city, tropical haze and Lake Victoria light beyond; not a generic brick church" },
  { slug: "kigali", subject: "Kigali Convention Centre dome", prompt: "Kigali, Rwanda: the glowing translucent steel lattice dome of the Kigali Convention Centre on its green hill beside the woven-basket-pattern banded hotel facade, clean orderly hillside streets, soft dusk light; not a plain glass pyramid" },
  { slug: "dar-es-salaam", subject: "Azania Front church and harbour waterfront", prompt: "Dar es Salaam, Tanzania: the white German colonial Gothic Azania Front Lutheran Church with red tiled roof and spires framed by palms along Sokoine Drive, the Indian Ocean harbour beyond, bright coastal light; not grey European stonework" },
  { slug: "addis-ababa", subject: "St George's Cathedral", prompt: "Addis Ababa, Ethiopia: the octagonal St George's Cathedral with its ribbed silver dome and arched porch above the lived-in commercial Piazza district, highland light and hazy hills; not bungalow villages" },
  // Southern Africa
  { slug: "johannesburg", subject: "Ponte City", prompt: "Johannesburg, South Africa: the 54-storey cylindrical brutalist Ponte City tower with its hollow core seen from above, dense Hillbrow mid-rise flats and the cityscape behind, late-afternoon haze; not a shiny glass skyscraper, not abandoned ruin" },
  { slug: "cape-town", subject: "Table Mountain above Bo-Kaap", prompt: "Cape Town, South Africa: the sheer flat-topped Table Mountain with its cloud tablecloth behind the steep cobbled Bo-Kaap streets and lime, turquoise, pink and mustard two-storey houses, Signal Hill to the side; not random neon houses" },
  { slug: "durban", subject: "Golden Mile beachfront promenade", prompt: "Durban, South Africa: the long landscaped Golden Mile beachfront promenade with palm trees, piers and apartment buildings along the warm Indian Ocean surf, late afternoon light; not an empty tropical beach" },
  { slug: "pretoria", subject: "Union Buildings", prompt: "Pretoria, South Africa: the symmetrical semicircular light-sandstone Union Buildings with twin wings on Meintjieskop above terraced indigenous gardens with a jacaranda bloom, warm afternoon; not a single rectangular parliament block" },
  { slug: "lusaka", subject: "Findeco House on Cairo Road", prompt: "Lusaka, Zambia: the slender 1970s modernist Findeco House tower rising out of a low-rise, leafy tree-lined dual-carriageway CBD, wide sky and warm highland light; not a generic glass tower" },
  { slug: "harare", subject: "Eastgate Centre", prompt: "Harare, Zimbabwe: the Eastgate Centre with pale stone facade, horizontal sun baffles, twin brick ventilation chimneys and red tiled roof beside a glazed atrium, granite-aggregate finish, jacaranda street trees, bright highveld light; not mirrored glass" },
  { slug: "gaborone", subject: "Three Dikgosi Monument", prompt: "Gaborone, Botswana: the Three Dikgosi Monument, three tall bronze statues of the chiefs on plinths under an enormous clear sky, low government CBD buildings and wide boulevards in the foreground, dry sahelian light; not a dense metropolis" },
  { slug: "maputo", subject: "Maputo Central Railway Station", prompt: "Maputo, Mozambique: the Beaux-Arts Central Railway Station with its tall central arch, three domes topped by a copper-green cupola and wrought-iron lattice, palm-lined Praça dos Trabalhadores and colonial arcades, Indian Ocean light; not an iron-glass shed" },
  // Central Africa
  { slug: "kinshasa", subject: "Tour de l'Échangeur de Limete", prompt: "Kinshasa, DR Congo: the four slender white concrete columns of the Limete tower monument rising from its sculptural base across the flat industrial plain, boulevard traffic and market sprawl below, humid Congo basin light; not a glass office tower" },
  { slug: "brazzaville", subject: "Basilique Sainte-Anne-du-Congo", prompt: "Brazzaville, Republic of the Congo: the ogival concrete arches and emerald-green scaled tile roof of Sainte-Anne Basilica with its 52-metre lacework spire above the Congo River bank, tropical dusk; not European Gothic stained glass" },
  { slug: "douala", subject: "La Nouvelle Liberté at Rond-Point Deïdo", prompt: "Douala, Cameroon: the 12-metre welded scrap-metal La Nouvelle Liberté sculpture holding a globe aloft on the Deïdo roundabout, flooded streetscape with yellow taxis and market stalls, the massif of Mount Cameroon silhouetted on the horizon, humid light; not a smooth bronze hero statue" },
  { slug: "yaounde", subject: "Monument de la Réunification", prompt: "Yaoundé, Cameroon: the conical spiral concrete tower of the Reunification Monument at Plateau Atemengue with its twin intertwining staircases and the seated colossus with a torch, green forested hills of the city behind; not classical robes or the newer ten-pillar monument" },
  { slug: "libreville", subject: "Notre-Dame de Libreville azulejo facade", prompt: "Libreville, Gabon: the church facade covered in blue-and-white Portuguese azulejo tile paintings, equatorial trees and low oceanfront city buildings of the Estuary, humid golden light; not a modern glass skyline or plain white mega-church" },
  // North Africa
  { slug: "cairo", subject: "Al-Muizz Street and Khan el-Khalili", prompt: "Cairo, Egypt: the Mamluk stone facades of Al-Muizz Street and the lantern-lit alleys of Khan el-Khalili bazaar with carved wooden mashrabiyya balconies, brass lanterns and café tables, minarets in warm evening haze, modern towers faintly beyond; no pyramids in the city centre" },
  { slug: "alexandria", subject: "Qaitbay Citadel and Bibliotheca Alexandrina", prompt: "Alexandria, Egypt: the pale-stone Qaitbay Citadel fort at the harbour mouth with the Mediterranean on three sides, and the tilted granite sun-disk Bibliotheca Alexandrina with its carved script wall nearby, sea breeze and bright light; not the ancient Pharos lighthouse standing alone" },
  { slug: "casablanca", subject: "Hassan II Mosque", prompt: "Casablanca, Morocco: the polychrome coral-pink stone Hassan II Mosque on reclaimed Atlantic shoreline, its 210-metre green-tiled minaret with a laser tip, waves breaking against the esplanade at sunset; not a plain modern glass mosque" },
  { slug: "marrakech", subject: "Koutoubia minaret and Jemaa el-Fnaa", prompt: "Marrakech, Morocco: the clay-red Almohad Koutoubia minaret with ceramic tile bands, copper balls and merlons above the busy lantern-and-smoke Jemaa el-Fnaa square at dusk, rose-pink rammed-earth medina walls and palm trees; not a blue-and-white medina, no desert dunes" },
  { slug: "rabat", subject: "Hassan Tower and Mausoleum of Mohammed V", prompt: "Rabat, Morocco: the unfinished red-sandstone Hassan Tower rising above rows of ancient column stubs, the white marble Mausoleum of Mohammed V with a green-tiled roof beside it, and the blue-and-white alleys of the Kasbah of the Udayas over the Bou Regreg river; not a finished polished tower" },
  { slug: "tunis", subject: "Medina and Zitouna Mosque rooftops", prompt: "Tunis, Tunisia: the square stone minaret of the Zitouna Mosque rising over the dense white-and-blue painted rooftops and narrow souks of the medina with copper and leather stalls, date palms, warm Mediterranean light; not a garish painted bazaar, sea not adjacent to the medina" },
  { slug: "algiers", subject: "Casbah and Maqam Echahid", prompt: "Algiers, Algeria: the steep whitewashed stair alleys and Ottoman-era houses of the Casbah cascading to the bay, with the three white concrete fronds of the 97-metre Martyrs' Memorial on the El Hamma hills above, bright Mediterranean haze; not palm-tree shaped fronds" }
];

/** Missing canonical portraits for the six pan-African artists (all fictional). */
export const PORTRAITS = [
  { id: "stream-artist-chinaza", slug: "chinaza-oke", prompt: "Editorial studio portrait of a fictional Nigerian male Afro-fusion singer-songwriter with a short fade and small gold earrings, wearing a textured cream agbada over an embroidered shirt, deep charcoal background with warm gold and soft green rim light, premium music-platform campaign photography, single person, no text, no watermark" },
  { id: "stream-artist-bisi", slug: "bisi-alade", prompt: "Editorial studio portrait of a fictional Nigerian female highlife torch singer with a sleek low bun and pearl earrings, wearing a deep emerald velvet dress with gold shoulder detail, holding a vintage microphone, deep charcoal background with warm amber rim light, premium music campaign photography, single person, no text, no watermark" },
  { id: "stream-artist-abena", slug: "abena-sankofa", prompt: "Editorial studio portrait of a fictional young Ghanaian female Hiplife artist with patterned braids and gold hoops, wearing a vibrant Ankara-print jacket, deep charcoal background with warm gold and emerald rim light, premium music-platform campaign photography, single person, no text, no watermark" },
  { id: "stream-artist-aminata", slug: "aminata-diop", prompt: "Editorial studio portrait of a fictional Senegalese female Mbalax singer with long sleek braids and bold gold jewellery, wearing rich indigo and gold embroidered fabric, deep charcoal background with teal rim light, premium music campaign photography, single person, no text, no watermark" },
  { id: "stream-artist-wanjiru", slug: "wanjiru-kamau", prompt: "Editorial studio portrait of a fictional Kenyan female singer-songwriter with natural coily hair and hoop earrings, wearing a modern copper-toned jacket, deep charcoal background with warm amber rim light, premium music campaign photography, single person, no text, no watermark" },
  { id: "stream-artist-thandiwe", slug: "thandiwe-mokoena", prompt: "Editorial studio portrait of a fictional South African female amapiano producer and DJ wearing over-ear headphones and a cream designer knit, deep charcoal background with violet and magenta rim light, premium music campaign photography, single person, no text, no watermark" },
  { id: "stream-artist-moise", slug: "moise-kabangu", prompt: "Editorial studio portrait of a fictional Congolese male rumba guitarist holding a hollow-body electric guitar, wearing a tailored patterned shirt, deep charcoal background with warm amber rim light, premium music campaign photography, single person, no text, no watermark" },
  { id: "stream-artist-yasmine", slug: "yasmine-benali", prompt: "Editorial studio portrait of a fictional Moroccan female Gnawa and chaabi singer with dark wavy hair and silver jewellery, wearing a deep burgundy modern kaftan, deep charcoal background with warm copper rim light, premium music campaign photography, single person, no text, no watermark" }
];

const readRegistry = () => JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
const writeRegistry = (registry) => fs.writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`);

function plannedQueue(registry) {
  const done = new Set(registry.assets.map((asset) => asset.id));
  return [
    ...CITIES.map((city) => ({ id: `stream-city-${city.slug}`, kind: "city illustration", vertical: "stream", component: `Explore Africa — ${city.slug}`, slug: city.slug, subject: city.subject, prompt: `${city.prompt}. ${STYLE}` })),
    ...PORTRAITS.map((portrait) => ({ id: portrait.id, kind: "artist portrait", vertical: "stream", component: `Artist portrait — ${portrait.slug}`, slug: portrait.slug, subject: "artist portrait", prompt: portrait.prompt }))
  ].filter((asset) => !done.has(asset.id));
}

async function generate(asset, apiKey) {
  const create = await fetch(`${API_BASE}/jobs/createTask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, input: { prompt: asset.prompt, size: SIZE } })
  });
  const created = await create.json();
  if (created?.code !== 200 || !created?.data?.taskId) throw new Error(`createTask failed HTTP ${create.status}: ${JSON.stringify(created).slice(0, 160)}`);
  const taskId = created.data.taskId;
  for (let i = 0; i < 40; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 15000));
    const poll = await fetch(`${API_BASE}/jobs/recordInfo?taskId=${taskId}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    const body = await poll.json().catch(() => null);
    const data = body?.data;
    if (!data) continue;
    if (data.state === "success") {
      const url = JSON.parse(data.resultJson ?? "{}")?.resultUrls?.[0] ?? null;
      if (!url) throw new Error("no result url");
      return { url, taskId, credits: data.creditsConsumed ?? CREDITS_PER_IMAGE };
    }
    if (data.state === "fail" || data.state === "error") throw new Error(data.failMsg ?? "failed");
  }
  throw new Error("timed out waiting for the image");
}

async function run() {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) throw new Error("KIE_API_KEY is not set; run with node --env-file=.env");
  const registry = readRegistry();
  const queue = plannedQueue(registry);
  if (queue.length === 0) {
    console.log(JSON.stringify({ status: "complete", generated: 0 }));
    return;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let spent = 0;
  let generated = 0;

  for (const [index, asset] of queue.entries()) {
    process.stdout.write(`[${index + 1}/${queue.length}] ${asset.id} … `);
    try {
      const result = await generate(asset, apiKey);
      const response = await fetch(result.url);
      if (!response.ok) throw new Error(`download HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const file = path.join(OUT_DIR, `${asset.slug}.png`);
      fs.writeFileSync(file, bytes);
      const costUsd = (result.credits * USD_PER_CREDIT);
      spent += costUsd;
      generated += 1;
      const current = readRegistry();
      current.assets.push({
        id: asset.id,
        vertical: "stream",
        kind: asset.kind,
        component: asset.component,
        subject: asset.subject,
        prompt: asset.prompt,
        model: MODEL,
        size: SIZE,
        status: "generated",
        provenance: "AI-generated illustration (Kie.ai GPT Image 2). Not a documentary photograph.",
        history: [],
        taskId: result.taskId,
        storagePath: `generated\\stream\\cities\\${asset.slug}.png`,
        publicPath: `/generated/stream/cities/${asset.slug}.png`,
        resultUrl: result.url,
        generatedAt: new Date().toISOString(),
        creditsConsumed: result.credits,
        costUsd,
        qualityReview: "pending-owner-review",
        usageReferences: []
      });
      writeRegistry(current);
      process.stdout.write(`ok (${Math.round(bytes.length / 1024)} KB)\n`);
    } catch (error) {
      process.stdout.write(`FAILED ${String(error.message).slice(0, 120)}\n`);
    }
  }

  console.log(JSON.stringify({ generated, failed: queue.length - generated, spentUsd: Number(spent.toFixed(3)), remaining: plannedQueue(readRegistry()).length }));
}

const args = process.argv.slice(2);
const onlyArg = args.find((arg) => arg.startsWith("--only="));
if (args.includes("--queue")) {
  const registry = readRegistry();
  const queue = plannedQueue(registry);
  console.log(JSON.stringify({
    pending: queue.length,
    images: queue.length,
    estimatedCostUsd: Number((queue.length * CREDITS_PER_IMAGE * USD_PER_CREDIT).toFixed(2)),
    model: MODEL,
    size: SIZE,
    sample: queue.map((asset) => ({ id: asset.id, subject: asset.subject }))
  }, null, 2));
} else if (args.includes("--run")) {
  if (onlyArg) {
    const only = new Set(onlyArg.slice("--only=".length).split(","));
    CITIES.splice(0, CITIES.length, ...CITIES.filter((city) => only.has(city.slug)));
    PORTRAITS.splice(0, PORTRAITS.length, ...PORTRAITS.filter((portrait) => only.has(portrait.slug)));
  }
  await run();
} else {
  console.log("Usage: --queue | --run [--only=slug,slug]");
}
