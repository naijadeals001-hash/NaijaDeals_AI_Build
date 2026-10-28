/**
 * Generates original, locally-owned SVG artwork for the development catalogue.
 * No external images, brand logos or Amazon assets are used.
 */
const fs = require("node:fs");
const path = require("node:path");

const outDir = path.join(process.cwd(), "public", "products");
fs.mkdirSync(outDir, { recursive: true });

const palettes = [
  ["#006d38", "#00a859", "#e7f8ed"],
  ["#1d4ed8", "#60a5fa", "#eff6ff"],
  ["#b45309", "#f59e0b", "#fffbeb"],
  ["#7e22ce", "#c084fc", "#faf5ff"],
  ["#be123c", "#fb7185", "#fff1f2"],
  ["#0f766e", "#2dd4bf", "#f0fdfa"],
  ["#4338ca", "#818cf8", "#eef2ff"],
  ["#a16207", "#facc15", "#fefce8"],
  ["#9d174d", "#f472b6", "#fdf2f8"],
  ["#065f46", "#34d399", "#ecfdf5"],
  ["#7c2d12", "#fb923c", "#fff7ed"],
  ["#1e3a8a", "#38bdf8", "#f0f9ff"]
];

const products = [
  { slug: "tecno-spark-20", label: "TECNO", shape: "phone" },
  { slug: "infinix-hot-40i", label: "INFINIX", shape: "phone" },
  { slug: "hp-elitebook-840-g6", label: "ELITEBOOK", shape: "laptop" },
  { slug: "anker-power-bank-20000", label: "ANKER", shape: "battery" },
  { slug: "binatone-blender-15l", label: "BINATONE", shape: "blender" },
  { slug: "nivea-radiance-face-wash", label: "NIVEA", shape: "bottle" },
  { slug: "adire-throw-pillows", label: "ADIRE", shape: "pillow" },
  { slug: "solar-king-200w-kit", label: "SOLAR", shape: "solar" },
  { slug: "xbox-wireless-controller", label: "GAMING", shape: "controller" },
  { slug: "smoked-pepper-250g", label: "PEPPER", shape: "jar" },
  { slug: "ankara-sneakers", label: "ANKARA", shape: "shoe" },
  { slug: "dell-24-monitor", label: "DELL", shape: "monitor" }
];

function shapeMarkup(shape, fill, accent) {
  switch (shape) {
    case "phone":
      return `<rect x="300" y="150" width="200" height="330" rx="34" fill="${fill}" stroke="${accent}" stroke-width="8"/>
        <rect x="322" y="188" width="156" height="244" rx="12" fill="${accent}" opacity="0.28"/>
        <circle cx="400" cy="452" r="12" fill="${accent}"/>`;
    case "laptop":
      return `<rect x="245" y="185" width="310" height="200" rx="14" fill="${fill}" stroke="${accent}" stroke-width="8"/>
        <rect x="268" y="208" width="264" height="154" rx="6" fill="${accent}" opacity="0.3"/>
        <path d="M210 385 H590 L560 440 H240 Z" fill="${fill}" stroke="${accent}" stroke-width="8"/>`;
    case "battery":
      return `<rect x="315" y="175" width="170" height="300" rx="30" fill="${fill}" stroke="${accent}" stroke-width="8"/>
        <rect x="360" y="145" width="80" height="40" rx="10" fill="${fill}" stroke="${accent}" stroke-width="8"/>
        <path d="M415 235 L350 330 H400 L380 420 L450 315 H398 Z" fill="${accent}"/>`;
    case "blender":
      return `<path d="M330 150 H470 L450 330 H350 Z" fill="${fill}" stroke="${accent}" stroke-width="8"/>
        <rect x="345" y="330" width="110" height="120" rx="18" fill="${fill}" stroke="${accent}" stroke-width="8"/>
        <rect x="375" y="360" width="50" height="30" rx="8" fill="${accent}"/>
        <rect x="355" y="450" width="90" height="22" rx="10" fill="${fill}" stroke="${accent}" stroke-width="8"/>`;
    case "bottle":
      return `<rect x="345" y="190" width="110" height="260" rx="26" fill="${fill}" stroke="${accent}" stroke-width="8"/>
        <rect x="370" y="150" width="60" height="46" rx="12" fill="${fill}" stroke="${accent}" stroke-width="8"/>
        <rect x="360" y="280" width="80" height="90" rx="8" fill="${accent}" opacity="0.45"/>`;
    case "pillow":
      return `<rect x="270" y="220" width="260" height="200" rx="46" fill="${fill}" stroke="${accent}" stroke-width="8"/>
        <path d="M300 270 L500 370 M500 270 L300 370" stroke="${accent}" stroke-width="8" opacity="0.5"/>
        <circle cx="400" cy="320" r="26" fill="${accent}"/>`;
    case "solar":
      return `<path d="M300 180 L500 180 L540 330 L260 330 Z" fill="${fill}" stroke="${accent}" stroke-width="8"/>
        <path d="M320 215 H480 M310 260 H490 M300 305 H500 M360 180 L340 330 M440 180 L460 330" stroke="${accent}" stroke-width="5"/>
        <rect x="380" y="330" width="40" height="120" fill="${fill}"/>`;
    case "controller":
      return `<path d="M300 220 Q400 180 500 220 Q560 250 540 330 Q520 410 470 400 Q430 392 400 360 Q370 392 330 400 Q280 410 260 330 Q240 250 300 220 Z" fill="${fill}" stroke="${accent}" stroke-width="8"/>
        <circle cx="345" cy="300" r="22" fill="${accent}"/><circle cx="455" cy="290" r="14" fill="${accent}"/><circle cx="480" cy="320" r="14" fill="${accent}"/>`;
    case "jar":
      return `<rect x="320" y="200" width="160" height="240" rx="28" fill="${fill}" stroke="${accent}" stroke-width="8"/>
        <rect x="300" y="165" width="200" height="50" rx="18" fill="${fill}" stroke="${accent}" stroke-width="8"/>
        <rect x="345" y="270" width="110" height="100" rx="10" fill="${accent}" opacity="0.45"/>`;
    case "shoe":
      return `<path d="M245 330 Q330 300 360 250 L400 290 Q470 330 555 340 L555 395 H245 Z" fill="${fill}" stroke="${accent}" stroke-width="8"/>
        <path d="M330 320 L380 360 M380 305 L430 350 M430 295 L480 340" stroke="${accent}" stroke-width="8"/>
        <rect x="240" y="395" width="320" height="24" rx="12" fill="${accent}"/>`;
    default:
      return `<rect x="230" y="170" width="340" height="230" rx="16" fill="${fill}" stroke="${accent}" stroke-width="8"/>
        <rect x="250" y="190" width="300" height="190" rx="8" fill="${accent}" opacity="0.3"/>
        <rect x="375" y="400" width="50" height="60" fill="${fill}"/>
        <rect x="330" y="455" width="140" height="20" rx="10" fill="${fill}"/>`;
  }
}

for (const [index, product] of products.entries()) {
  const [dark, bright, soft] = palettes[index % palettes.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600" role="img" aria-label="Original illustration for ${product.label}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${soft}"/>
      <stop offset="100%" stop-color="#ffffff"/>
    </linearGradient>
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${bright}"/>
      <stop offset="100%" stop-color="${dark}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="600" fill="url(#bg)"/>
  <circle cx="120" cy="90" r="150" fill="${bright}" opacity="0.12"/>
  <circle cx="700" cy="520" r="190" fill="${dark}" opacity="0.10"/>
  ${shapeMarkup(product.shape, "url(#body)", "#ffffff")}
  <text x="400" y="545" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="800" letter-spacing="6" fill="${dark}">${product.label}</text>
</svg>`;
  fs.writeFileSync(path.join(outDir, `${product.slug}.svg`), svg);
}

console.log(`Generated ${products.length} original product illustrations in public/products.`);
