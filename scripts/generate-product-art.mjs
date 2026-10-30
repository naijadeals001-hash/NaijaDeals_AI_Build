/**
 * Generates original studio-style artwork for the seeded NaijaShop catalogue.
 * Every shape, colour and label is composed here; no stock photography, traced
 * artwork or third-party assets are used.
 *
 * Run: node scripts/generate-product-art.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "products");
mkdirSync(outDir, { recursive: true });

const W = 800;
const H = 600;

function frame(label, palette, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${label}">
  <defs>
    <linearGradient id="stage" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="${palette.bg1}"/>
      <stop offset="1" stop-color="${palette.bg2}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.55">
      <stop offset="0" stop-color="${palette.glow}" stop-opacity="0.85"/>
      <stop offset="1" stop-color="${palette.glow}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="product" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="${palette.a}"/>
      <stop offset="1" stop-color="${palette.b}"/>
    </linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.42"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0.06"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <filter id="drop" x="-30%" y="-30%" width="160%" height="180%">
      <feDropShadow dx="0" dy="22" stdDeviation="20" flood-color="#0b1220" flood-opacity="0.28"/>
    </filter>
    <filter id="blur"><feGaussianBlur stdDeviation="22"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#stage)"/>
  <circle cx="400" cy="250" r="300" fill="url(#glow)"/>
  <path d="M0 430 q200 -70 400 -18 t400 -12 v200 H0z" fill="#ffffff" opacity="0.10"/>
  <ellipse cx="400" cy="486" rx="250" ry="44" fill="#0b1220" opacity="0.20" filter="url(#blur)"/>
  ${body}
  <text x="400" y="566" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="19" font-weight="800" letter-spacing="5" fill="${palette.label}">${palette.brand}</text>
</svg>
`;
}

const art = {
  "infinix-hot-40i": {
    label: "Original NaijaDeals studio illustration of a blue Infinix smartphone",
    palette: { bg1: "#eef4ff", bg2: "#ffffff", glow: "#93c5fd", a: "#3b82f6", b: "#1e3a8a", label: "#1d4ed8", brand: "INFINIX HOT 40i" },
    body: `<g filter="url(#drop)">
      <rect x="288" y="118" width="224" height="360" rx="38" fill="#0f172a"/>
      <rect x="298" y="128" width="204" height="340" rx="30" fill="url(#product)"/>
      <rect x="310" y="142" width="180" height="248" rx="20" fill="#0b1220" opacity="0.9"/>
      <path d="M310 300 q60 -70 120 -20 t60 -30 v128 H310z" fill="#60a5fa" opacity="0.35"/>
      <rect x="382" y="136" width="36" height="8" rx="4" fill="#1e3a8a"/>
      <circle cx="400" cy="416" r="18" fill="#0b1220" opacity="0.9"/><circle cx="400" cy="416" r="10" fill="#60a5fa" opacity="0.6"/>
      <rect x="310" y="142" width="180" height="248" rx="20" fill="url(#shine)"/>
      <circle cx="466" cy="270" r="30" fill="#fbbf24" opacity="0.9"/><circle cx="466" cy="270" r="14" fill="#fef3c7"/>
    </g>`
  },
  "tecno-spark-20": {
    label: "Original NaijaDeals studio illustration of a green Tecno Spark smartphone",
    palette: { bg1: "#ecfdf5", bg2: "#ffffff", glow: "#6ee7b7", a: "#34d399", b: "#065f46", label: "#047857", brand: "TECNO SPARK 20" },
    body: `<g filter="url(#drop)">
      <rect x="288" y="118" width="224" height="360" rx="38" fill="#052e16"/>
      <rect x="298" y="128" width="204" height="340" rx="30" fill="url(#product)"/>
      <rect x="310" y="142" width="180" height="248" rx="20" fill="#022c22" opacity="0.85"/>
      <circle cx="400" cy="250" r="62" fill="#a7f3d0" opacity="0.22"/>
      <circle cx="400" cy="250" r="40" fill="#6ee7b7" opacity="0.35"/>
      <rect x="382" y="136" width="36" height="8" rx="4" fill="#064e3b"/>
      <circle cx="400" cy="416" r="18" fill="#022c22"/><circle cx="400" cy="416" r="10" fill="#6ee7b7" opacity="0.7"/>
      <rect x="310" y="142" width="180" height="248" rx="20" fill="url(#shine)"/>
      <rect x="486" y="200" width="52" height="18" rx="9" fill="#fbbf24" opacity="0.9"/>
    </g>`
  },
  "hp-elitebook-840-g6": {
    label: "Original NaijaDeals studio illustration of a silver business laptop",
    palette: { bg1: "#f1f5f9", bg2: "#ffffff", glow: "#cbd5e1", a: "#cbd5e1", b: "#64748b", label: "#334155", brand: "HP ELITEBOOK 840" },
    body: `<g filter="url(#drop)">
      <rect x="236" y="132" width="328" height="220" rx="14" fill="#475569"/>
      <rect x="246" y="142" width="308" height="200" rx="8" fill="#0f172a"/>
      <rect x="258" y="154" width="284" height="176" rx="4" fill="url(#product)"/>
      <path d="M258 270 q80 -90 160 -20 t124 -40 v120 H258z" fill="#38bdf8" opacity="0.28"/>
      <rect x="246" y="142" width="308" height="200" rx="8" fill="url(#shine)" opacity="0.5"/>
      <path d="M196 352 h408 l28 58 q4 10 -8 10 H176 q-12 0 -8 -10z" fill="#94a3b8"/>
      <path d="M196 352 h408 l6 14 H190z" fill="#cbd5e1"/>
      <rect x="336" y="386" width="128" height="10" rx="5" fill="#64748b" opacity="0.55"/>
      <circle cx="400" cy="126" r="5" fill="#1e293b"/>
    </g>`
  },
  "dell-24-monitor": {
    label: "Original NaijaDeals studio illustration of a 24 inch desktop monitor",
    palette: { bg1: "#eef2ff", bg2: "#ffffff", glow: "#a5b4fc", a: "#1e293b", b: "#020617", label: "#312e81", brand: "DELL 24 MONITOR" },
    body: `<g filter="url(#drop)">
      <rect x="196" y="118" width="408" height="262" rx="16" fill="#0f172a"/>
      <rect x="208" y="130" width="384" height="238" rx="8" fill="url(#product)"/>
      <rect x="220" y="142" width="360" height="214" rx="4" fill="#111827"/>
      <path d="M220 300 q90 -100 180 -30 t180 -60 v146 H220z" fill="#6366f1" opacity="0.35"/>
      <circle cx="280" cy="200" r="34" fill="#a5b4fc" opacity="0.5"/>
      <rect x="220" y="142" width="360" height="214" rx="4" fill="url(#shine)" opacity="0.4"/>
      <path d="M378 380 h44 l10 66 h-64z" fill="#475569"/>
      <rect x="310" y="444" width="180" height="16" rx="8" fill="#334155"/>
    </g>`
  },
  "anker-power-bank-20000": {
    label: "Original NaijaDeals studio illustration of a black power bank with charge lights",
    palette: { bg1: "#f5f3ff", bg2: "#ffffff", glow: "#c4b5fd", a: "#312e81", b: "#0b1026", label: "#4c1d95", brand: "ANKER 20000mAh" },
    body: `<g filter="url(#drop)">
      <rect x="286" y="150" width="228" height="300" rx="30" fill="url(#product)"/>
      <rect x="300" y="164" width="200" height="272" rx="22" fill="#1e1b4b" opacity="0.55"/>
      <rect x="300" y="164" width="200" height="272" rx="22" fill="url(#shine)" opacity="0.5"/>
      <g fill="#a5f3fc">
        <circle cx="336" cy="196" r="5"/><circle cx="358" cy="196" r="5"/><circle cx="380" cy="196" r="5"/><circle cx="402" cy="196" r="5"/>
      </g>
      <rect x="336" y="238" width="128" height="8" rx="4" fill="#e0e7ff" opacity="0.7"/>
      <rect x="336" y="262" width="86" height="6" rx="3" fill="#e0e7ff" opacity="0.35"/>
      <rect x="336" y="382" width="60" height="18" rx="9" fill="#0b1026"/>
      <rect x="404" y="382" width="60" height="18" rx="9" fill="#0b1026"/>
      <path d="M430 320 l-22 34 h18 l-8 30 28 -40 h-18z" fill="#fbbf24"/>
    </g>`
  },
  "xbox-wireless-controller": {
    label: "Original NaijaDeals studio illustration of a wireless game controller",
    palette: { bg1: "#ecfdf5", bg2: "#ffffff", glow: "#86efac", a: "#166534", b: "#052e16", label: "#14532d", brand: "WIRELESS CONTROLLER" },
    body: `<g filter="url(#drop)">
      <path d="M268 208 q40 -34 92 -12 q40 18 80 0 q52 -22 92 12 q46 44 26 118 q-14 52 -48 46 q-34 -6 -52 -44 l-18 -34 q-40 20 -80 0 l-18 34 q-18 38 -52 44 q-34 6 -48 -46 q-20 -74 26 -118z" fill="url(#product)"/>
      <path d="M268 208 q40 -34 92 -12 q40 18 80 0 q52 -22 92 12 q46 44 26 118 q-14 52 -48 46 q-34 -6 -52 -44 l-18 -34 q-40 20 -80 0 l-18 34 q-18 38 -52 44 q-34 6 -48 -46 q-20 -74 26 -118z" fill="url(#shine)" opacity="0.35"/>
      <circle cx="352" cy="286" r="26" fill="#052e16"/><circle cx="352" cy="286" r="14" fill="#22c55e" opacity="0.7"/>
      <circle cx="452" cy="266" r="20" fill="#052e16"/><circle cx="452" cy="266" r="9" fill="#22c55e" opacity="0.6"/>
      <circle cx="482" cy="304" r="20" fill="#052e16"/><circle cx="482" cy="304" r="9" fill="#22c55e" opacity="0.6"/>
      <path d="M298 254 h32 M314 238 v32" stroke="#a7f3d0" stroke-width="8" stroke-linecap="round"/>
      <circle cx="430" cy="222" r="7" fill="#fbbf24"/><circle cx="456" cy="214" r="7" fill="#fbbf24" opacity="0.6"/>
    </g>`
  },
  "ankara-sneakers": {
    label: "Original NaijaDeals studio illustration of colourful Ankara print sneakers",
    palette: { bg1: "#fff7ed", bg2: "#ffffff", glow: "#fdba74", a: "#f97316", b: "#7c2d12", label: "#9a3412", brand: "ANKARA SNEAKERS" },
    body: `<g filter="url(#drop)" transform="translate(0 18)">
      <path d="M180 340 q10 -70 70 -88 l64 -18 q28 -8 44 12 l26 32 q34 12 82 26 q70 20 96 44 q22 20 16 48 H196 q-20 0 -16 -56z" fill="url(#product)"/>
      <path d="M180 340 q10 -70 70 -88 l64 -18 q28 -8 44 12 l26 32 q34 12 82 26 q70 20 96 44 q22 20 16 48 H196 q-20 0 -16 -56z" fill="url(#shine)" opacity="0.28"/>
      <path d="M196 384 h378 q8 0 8 14 t-8 14 H196 q-10 0 -10 -14 t10 -14z" fill="#fef3c7"/>
      <path d="M196 400 h378" stroke="#b45309" stroke-width="4" opacity="0.5"/>
      <g stroke="#fef3c7" stroke-width="6" stroke-linecap="round" opacity="0.9">
        <path d="M282 286 l38 16"/><path d="M298 270 l38 18"/><path d="M316 256 l36 20"/><path d="M336 246 l34 20"/>
      </g>
      <g fill="#fbbf24" opacity="0.85">
        <circle cx="236" cy="322" r="7"/><circle cx="266" cy="308" r="5"/><circle cx="470" cy="356" r="6"/><circle cx="510" cy="332" r="5"/>
      </g>
      <path d="M430 300 q40 18 92 34" stroke="#7c2d12" stroke-width="5" fill="none" opacity="0.5"/>
      <path d="M430 300 q40 18 92 34" stroke="#fbbf24" stroke-width="2" fill="none" opacity="0.8"/>
    </g>`
  },
  "adire-throw-pillows": {
    label: "Original NaijaDeals studio illustration of indigo Adire throw pillows",
    palette: { bg1: "#eff6ff", bg2: "#ffffff", glow: "#93c5fd", a: "#1d4ed8", b: "#172554", label: "#1e3a8a", brand: "ADIRE PILLOWS" },
    body: `<g filter="url(#drop)">
      <g transform="translate(228 210) rotate(-12)">
        <rect x="0" y="0" width="220" height="200" rx="40" fill="url(#product)"/>
        <g fill="none" stroke="#dbeafe" stroke-width="4" opacity="0.65">
          <circle cx="110" cy="100" r="66"/><circle cx="110" cy="100" r="44"/><circle cx="110" cy="100" r="22"/>
          <path d="M110 34 v132 M44 100 h132"/>
        </g>
        <rect x="90" y="180" width="40" height="14" rx="7" fill="#0b1220" opacity="0.35"/>
      </g>
      <g transform="translate(370 236) rotate(10)">
        <rect x="0" y="0" width="194" height="178" rx="36" fill="#e0e7ff"/>
        <g fill="none" stroke="#1d4ed8" stroke-width="4" opacity="0.6">
          <path d="M0 44 q48 30 97 0 t97 0"/><path d="M0 88 q48 30 97 0 t97 0"/><path d="M0 132 q48 30 97 0 t97 0"/>
        </g>
        <rect x="77" y="158" width="40" height="14" rx="7" fill="#0b1220" opacity="0.3"/>
      </g>
    </g>`
  },
  "binatone-blender-15l": {
    label: "Original NaijaDeals studio illustration of a countertop blender",
    palette: { bg1: "#fef2f2", bg2: "#ffffff", glow: "#fca5a5", a: "#dc2626", b: "#7f1d1d", label: "#991b1b", brand: "BINATONE BLENDER" },
    body: `<g filter="url(#drop)">
      <path d="M300 150 h200 l-18 190 q-4 30 -34 30 h-96 q-30 0 -34 -30z" fill="#e5e7eb" opacity="0.9"/>
      <path d="M316 166 h168 l-14 162 q-2 18 -22 18 h-96 q-20 0 -22 -18z" fill="#f8fafc"/>
      <path d="M334 240 q66 -30 132 0 l-6 66 q-60 -26 -120 0z" fill="#f97316" opacity="0.75"/>
      <rect x="292" y="138" width="216" height="22" rx="10" fill="#111827"/>
      <rect x="292" y="366" width="216" height="34" rx="10" fill="#1f2937"/>
      <rect x="276" y="390" width="248" height="104" rx="24" fill="url(#product)"/>
      <rect x="300" y="412" width="200" height="60" rx="14" fill="#111827" opacity="0.55"/>
      <circle cx="340" cy="442" r="13" fill="#fef3c7"/>
      <circle cx="382" cy="442" r="13" fill="#fbbf24"/>
      <circle cx="424" cy="442" r="13" fill="#f87171"/>
      <rect x="452" y="432" width="36" height="20" rx="10" fill="#111827"/>
      <path d="M470 150 q22 -20 44 0" stroke="#111827" stroke-width="8" fill="none"/>
    </g>`
  },
  "nivea-radiance-face-wash": {
    label: "Original NaijaDeals studio illustration of a NIVEA face wash bottle",
    palette: { bg1: "#eff6ff", bg2: "#ffffff", glow: "#bfdbfe", a: "#2563eb", b: "#1e3a8a", label: "#1e40af", brand: "NIVEA FACE WASH" },
    body: `<g filter="url(#drop)">
      <rect x="322" y="196" width="156" height="250" rx="34" fill="#f8fafc" stroke="#cbd5e1" stroke-width="4"/>
      <rect x="322" y="196" width="156" height="86" rx="34" fill="url(#product)"/>
      <rect x="322" y="252" width="156" height="30" fill="url(#product)"/>
      <rect x="346" y="300" width="108" height="6" rx="3" fill="#1e3a8a" opacity="0.7"/>
      <rect x="360" y="318" width="80" height="6" rx="3" fill="#1e3a8a" opacity="0.4"/>
      <circle cx="400" cy="366" r="30" fill="#dbeafe"/><path d="M388 366 q12 -18 24 0 q-12 18 -24 0z" fill="#60a5fa"/>
      <rect x="372" y="168" width="56" height="34" rx="10" fill="#1e3a8a"/>
      <path d="M372 176 h-30 q-12 0 -12 12 v10" stroke="#1e3a8a" stroke-width="10" fill="none"/>
      <rect x="322" y="196" width="156" height="250" rx="34" fill="url(#shine)" opacity="0.5"/>
    </g>`
  },
  "smoked-pepper-250g": {
    label: "Original NaijaDeals studio illustration of a smoked pepper pouch",
    palette: { bg1: "#fef2f2", bg2: "#ffffff", glow: "#fca5a5", a: "#b91c1c", b: "#450a0a", label: "#7f1d1d", brand: "SMOKED PEPPER 250g" },
    body: `<g filter="url(#drop)">
      <path d="M312 178 q0 -26 20 -26 h136 q20 0 20 26 l-14 268 q-2 20 -22 20 h-104 q-20 0 -22 -20z" fill="url(#product)"/>
      <path d="M312 178 q0 -26 20 -26 h136 q20 0 20 26 l-14 268 q-2 20 -22 20 h-104 q-20 0 -22 -20z" fill="url(#shine)" opacity="0.25"/>
      <rect x="336" y="196" width="128" height="120" rx="14" fill="#fef3c7" opacity="0.92"/>
      <g fill="#dc2626">
        <ellipse cx="372" cy="250" rx="20" ry="12" transform="rotate(-20 372 250)"/>
        <ellipse cx="410" cy="268" rx="18" ry="11" transform="rotate(18 410 268)"/>
        <ellipse cx="432" cy="234" rx="14" ry="9" transform="rotate(-8 432 234)"/>
      </g>
      <path d="M372 250 q10 -8 18 0" stroke="#7f1d1d" stroke-width="3" fill="none"/>
      <rect x="356" y="340" width="88" height="8" rx="4" fill="#fef3c7" opacity="0.85"/>
      <rect x="370" y="358" width="60" height="6" rx="3" fill="#fef3c7" opacity="0.55"/>
      <path d="M312 178 h196" stroke="#7f1d1d" stroke-width="6" opacity="0.45"/>
      <circle cx="400" cy="170" r="8" fill="#fef3c7"/>
    </g>`
  },
  "solar-king-200w-kit": {
    label: "Original NaijaDeals studio illustration of a solar panel kit with sun",
    palette: { bg1: "#eef2ff", bg2: "#ffffff", glow: "#fde68a", a: "#1e3a8a", b: "#0b1220", label: "#1e3a8a", brand: "SOLAR KING 200W" },
    body: `<g filter="url(#drop)">
      <circle cx="614" cy="166" r="46" fill="#fbbf24"/><circle cx="614" cy="166" r="74" fill="#fbbf24" opacity="0.2" filter="url(#blur)"/>
      <g transform="translate(180 190) rotate(-8)">
        <rect x="0" y="0" width="380" height="250" rx="14" fill="#0f172a"/>
        <rect x="12" y="12" width="356" height="226" rx="8" fill="url(#product)"/>
        <g stroke="#93c5fd" stroke-width="3" opacity="0.55">
          <path d="M12 68 h356 M12 124 h356 M12 180 h356 M100 12 v226 M188 12 v226 M276 12 v226"/>
        </g>
        <path d="M12 12 l70 0 -70 70z" fill="#ffffff" opacity="0.2"/>
        <rect x="0" y="0" width="380" height="250" rx="14" fill="url(#shine)" opacity="0.35"/>
      </g>
      <rect x="430" y="420" width="14" height="66" fill="#475569"/>
      <rect x="360" y="476" width="154" height="14" rx="7" fill="#334155"/>
      <rect x="236" y="404" width="120" height="64" rx="10" fill="#111827"/>
      <rect x="248" y="416" width="96" height="18" rx="4" fill="#22c55e" opacity="0.6"/>
      <circle cx="272" cy="452" r="8" fill="#fbbf24"/>
    </g>`
  }
};

let count = 0;
for (const [slug, item] of Object.entries(art)) {
  writeFileSync(join(outDir, `${slug}.svg`), frame(item.label, item.palette, item.body), "utf8");
  count += 1;
}
console.log(`Generated ${count} original product illustrations in public/products`);
