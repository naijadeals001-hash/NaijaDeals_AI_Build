const base = process.env.QA_BASE_URL ?? "http://localhost:3001";

async function get(cookie, path = "/") {
  const response = await fetch(base + path, { headers: { cookie } });
  return response.text();
}

const ar = await get("nd_lang=ar; nd_country=KE; nd_city=Nairobi");
const sw = await get("nd_lang=sw; nd_country=NG; nd_city=Lagos");

const checks = {
  "ar html rtl": ar.includes('<html lang="ar" dir="rtl"'),
  "ar hero title": ar.includes("تطبيق واحد"),
  "ar city": ar.includes("Nairobi") && ar.includes("Kenya"),
  "ar nav products": ar.includes("المنتجات"),
  "sw html": sw.includes('<html lang="sw" dir="ltr"'),
  "sw hero title": sw.includes("Programu moja"),
  "sw all products": sw.includes("Bidhaa zote"),
  "sw nav orders": sw.includes("Maagizo")
};

console.log(checks);
const failed = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);
if (failed.length > 0) {
  console.error("Failed:", failed.join(", "));
  process.exitCode = 1;
}
