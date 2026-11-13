/**
 * Publish the Kie-generated taxonomy products through the seller + Control Center
 * workflow. Seller creates validated drafts with category attributes; admin marks
 * DEMO and publishes. Idempotent by slug prefix.
 */
const fs = require("node:fs");
const { chromium } = require("playwright");
const B = process.env.REVIEW_BASE_URL || "http://localhost:3047";
const cred = (p) => fs.readFileSync(p, "utf8").trim().split(String.fromCharCode(10)).map((x) => x.trim());
const PRODUCTS = [
  { key: "teff-flour", name: "DEMO — Teff flour, 1kg", priceKobo: 320000, image: "/generated/taxonomy/teff-flour.webp", alt: "Wooden bowl of ivory teff flour beside a jute sack and teff grains", description: "Demonstration listing. Fine-milled teff flour for injera and porridge; grind and pack weight are illustrative and not a seller specification.", attributes: { net_weight_kg: 1, grind: "Fine" } },
  { key: "african-print-fabrics", name: "DEMO — African-print cotton fabric, 6 yards", priceKobo: 1850000, image: "/generated/taxonomy/african-print-fabrics.webp", alt: "Folded stack of vibrant blue, gold and green African wax-print cotton fabrics", description: "Demonstration listing. Wax-print style cotton fabric sold by the six-yard piece; pattern repeat and exact colour are illustrative.", attributes: { fabric_style: "Ankara / wax print", length_yards: 6, material: "Cotton" } },
  { key: "handwoven-dyed-fabrics", name: "DEMO — Handwoven kente-style cloth, 2 yards", priceKobo: 2400000, image: "/generated/taxonomy/kente-cloth.webp", alt: "Folded handwoven strip-weave cloth in gold, green, red and black geometric patterns", description: "Demonstration listing. Handwoven strip-weave cloth in a kente-style pattern, sold as a two-yard length; weave and motif are illustrative.", attributes: { technique: "Handwoven strip-weave", length_yards: 2 } },
  { key: "shea-natural-butters", name: "DEMO — Raw shea butter, 500g", priceKobo: 450000, image: "/generated/taxonomy/shea-butter.webp", alt: "Raw ivory shea butter in a carved calabash bowl with shea nuts", description: "Demonstration listing. Unrefined shea butter in a 500g pack; origin, texture and certification are illustrative and not verified.", attributes: { form: "Raw", net_weight_kg: 0.5 } },
  { key: "traditional-cleansers-black-soap", name: "DEMO — African black soap bar, 300g", priceKobo: 220000, image: "/generated/taxonomy/black-soap.webp", alt: "Three rustic dark African black soap bars on a wooden tray with shea butter", description: "Demonstration listing. Traditional dark soap bar; ingredients, ash source and skin suitability are illustrative and unverified.", attributes: { form: "Bar", net_weight_g: 300 } },
  { key: "cassava-processing-equipment", name: "DEMO — Electric cassava grater", priceKobo: 38000000, image: "/generated/taxonomy/cassava-grater.webp", alt: "Compact stainless-steel electric cassava grating machine on a workshop floor", description: "Demonstration listing. Compact electric cassava grater; throughput, motor rating and warranty are illustrative, not manufacturer specifications.", attributes: { equipment_type: "Grater", power_source: "Electric" } },
  { key: "maize-meal-porridge", name: "DEMO — Fine white maize meal, 5kg", priceKobo: 380000, image: "/generated/taxonomy/maize-meal.webp", alt: "Fine white maize meal in a woven basket beside dried maize cobs", description: "Demonstration listing. Fine white maize meal for pap, ugali and porridge; milling grade and pack are illustrative.", attributes: { net_weight_kg: 5, form: "Fine meal", grain: "White maize" } },
  { key: "storage-organisation", name: "DEMO — Woven storage baskets, set of three", priceKobo: 620000, image: "/generated/taxonomy/woven-baskets.webp", alt: "Set of three nested handwoven straw storage baskets with dark geometric bands", description: "Demonstration listing. Nested handwoven storage baskets; fibre, dimensions and finish are illustrative.", attributes: { storage_type: "Basket", material: "Woven straw" } }
];

(async () => {
  const browser = await chromium.launch();
  const sellerCtx = await browser.newContext();
  const adminCtx = await browser.newContext();
  const [se, sp] = cred("qa-artifacts/review-basket/.seller-credential");
  const [ae, ap] = cred("qa-artifacts/review-basket/.admin-credential");
  const sr = sellerCtx.request, ar = adminCtx.request;
  const sellerLogin = await sr.post(`${B}/api/auth/login`, { data: { email: se, password: sp }, headers: { Origin: B } });
  const adminLogin = await ar.post(`${B}/api/auth/login`, { data: { email: ae, password: ap }, headers: { Origin: B } });
  if (sellerLogin.status() !== 200 || adminLogin.status() !== 200) throw new Error(`login failed seller=${sellerLogin.status()} admin=${adminLogin.status()}`);

  const cats = (await (await sr.get(`${B}/api/seller/categories`)).json()).categories;
  const byKey = new Map(cats.map((c) => [c.key, c]));
  const adminCatalogue = await (await ar.get(`${B}/api/admin/catalogue`)).json();
  const checks = [];
  const check = (name, ok, detail = "") => checks.push({ name, ok, detail });

  for (const item of PRODUCTS) {
    const category = byKey.get(item.key);
    if (!category) throw new Error(`missing seller category ${item.key}`);
    const existing = adminCatalogue.products.find((p) => p.name === item.name);
    let product = existing;
    if (!existing) {
      const created = await sr.post(`${B}/api/seller/products`, {
        data: { name: item.name, description: item.description, categoryId: category.id, priceKobo: item.priceKobo, quantity: 10, imageUrl: item.image, attributes: item.attributes, status: "DRAFT" },
        headers: { Origin: B }
      });
      if (created.status() !== 201) throw new Error(`create failed ${item.name}: ${created.status()} ${(await created.text()).slice(0, 160)}`);
      product = await created.json();
    }
    const demo = await ar.patch(`${B}/api/admin/catalogue/products`, { data: { id: product.id, isDemo: true }, headers: { Origin: B } });
    check(`${item.key} marked DEMO`, demo.status() === 200, `status=${demo.status()}`);
    const publish = await ar.patch(`${B}/api/admin/catalogue/products`, { data: { id: product.id, action: "publish" }, headers: { Origin: B } });
    const publishBody = await publish.text();
    const alreadyPublished = publish.status() === 409 && publishBody.includes("already_published");
    check(`${item.key} published`, publish.status() === 200 || alreadyPublished, `status=${publish.status()}${alreadyPublished ? " (idempotent)" : ""}`);
  }

  const final = await (await ar.get(`${B}/api/admin/catalogue`)).json();
  for (const item of PRODUCTS) {
    const product = final.products.find((p) => p.name === item.name);
    check(`${item.key} ACTIVE and DEMO`, Boolean(product) && product.status === "ACTIVE" && product.isDemo === true, product ? `${product.status}/${product.isDemo}` : "missing");
    if (product) {
      const page = await ar.get(`${B}/product/${product.slug}`);
      check(`${item.key} public 200`, page.status() === 200, `status=${page.status()}`);
    }
  }
  await browser.close();
  const failed = checks.filter((c) => !c.ok);
  console.log(JSON.stringify({ checks, passed: checks.length - failed.length, total: checks.length }, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((error) => { console.error("TAXONOMY PRODUCT ERROR", error.message); process.exit(2); });
