/**
 * Generates the original NaijaDeals ecosystem artwork used on the public site.
 *
 * Every image is composed here from primitive shapes and gradients. Nothing is
 * downloaded, traced or copied from another product, so the output is original
 * NaijaDeals artwork and can be regenerated deterministically.
 *
 * Run: node scripts/generate-ecosystem-art.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "generated");
mkdirSync(outDir, { recursive: true });

const W = 640;
const H = 480;

function svg(label, body, defs = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${label}">
  <defs>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="18"/></filter>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0.05"/></feComponentTransfer><feComposite in2="SourceGraphic" operator="over"/></filter>
    ${defs}
  </defs>
  ${body}
</svg>
`;
}

const grain = `<rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.55"/>`;

function sky(id, a, b, c) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="0.55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`;
}

function priceTag(x, y, color = "#0f172a") {
  return `<g transform="translate(${x} ${y}) rotate(-8)">
    <rect x="0" y="0" width="74" height="34" rx="8" fill="#fffdf7" stroke="${color}" stroke-width="2"/>
    <circle cx="10" cy="17" r="3" fill="${color}" opacity="0.5"/>
    <rect x="20" y="12" width="44" height="4" rx="2" fill="${color}" opacity="0.7"/>
    <rect x="20" y="21" width="30" height="3" rx="1.5" fill="${color}" opacity="0.35"/>
  </g>`;
}

const scenes = {
  "module-shop": {
    label: "Original NaijaDeals artwork: a Nigerian market street with fabric stalls, baskets and price tags",
    defs: `${sky("skyShop", "#0b3b2e", "#12704f", "#f3b23c")}
      <linearGradient id="awning" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f97316"/><stop offset="0.5" stop-color="#fbbf24"/><stop offset="1" stop-color="#f97316"/></linearGradient>
      <linearGradient id="fabric" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e11d48"/><stop offset="1" stop-color="#7c2d12"/></linearGradient>`,
    body: `<rect width="${W}" height="${H}" fill="url(#skyShop)"/>
    <circle cx="510" cy="120" r="74" fill="#ffd479" opacity="0.85"/>
    <circle cx="510" cy="120" r="120" fill="#ffd479" opacity="0.18" filter="url(#soft)"/>
    <g opacity="0.35" fill="#08301f">
      <rect x="20" y="210" width="70" height="150"/><rect x="100" y="180" width="52" height="180"/>
      <rect x="470" y="196" width="60" height="164"/><rect x="545" y="222" width="72" height="138"/>
      <rect x="30" y="230" width="8" height="8"/><rect x="48" y="230" width="8" height="8"/><rect x="66" y="230" width="8" height="8"/>
      <rect x="30" y="252" width="8" height="8"/><rect x="110" y="200" width="8" height="8"/><rect x="128" y="200" width="8" height="8"/>
    </g>
    <rect x="0" y="356" width="${W}" height="124" fill="#0a2f22"/>
    <rect x="0" y="356" width="${W}" height="8" fill="#062017"/>
    <g transform="translate(120 150)">
      <rect x="0" y="0" width="300" height="176" rx="10" fill="#0f4a37"/>
      <rect x="12" y="188" width="10" height="130" fill="#0b3327"/><rect x="278" y="188" width="10" height="130" fill="#0b3327"/>
      <path d="M-16 26 L316 26 L296 64 L4 64 Z" fill="url(#awning)"/>
      <path d="M4 64 v14 a14 14 0 0 0 28 0 v-14 z M32 64 v14 a14 14 0 0 0 28 0 v-14 z M60 64 v14 a14 14 0 0 0 28 0 v-14 z M88 64 v14 a14 14 0 0 0 28 0 v-14 z M116 64 v14 a14 14 0 0 0 28 0 v-14 z M144 64 v14 a14 14 0 0 0 28 0 v-14 z M172 64 v14 a14 14 0 0 0 28 0 v-14 z M200 64 v14 a14 14 0 0 0 28 0 v-14 z" fill="#fff7e6" opacity="0.9"/>
      <g transform="translate(22 86)">
        <rect x="0" y="24" width="86" height="66" rx="6" fill="#f6c667"/>
        <path d="M0 24 h86 v14 H0 z" fill="#1f7a5a" opacity="0.4"/>
        <circle cx="22" cy="62" r="12" fill="#e11d48"/><circle cx="52" cy="62" r="12" fill="#f97316"/><circle cx="70" cy="58" r="10" fill="#a3e635"/>
      </g>
      <g transform="translate(122 82)">
        <rect x="0" y="0" width="74" height="102" rx="8" fill="url(#fabric)"/>
        <path d="M8 0 v102 M24 0 v102 M40 0 v102 M56 0 v102" stroke="#fbbf24" stroke-width="3" opacity="0.5"/>
        <circle cx="37" cy="51" r="14" stroke="#fde68a" stroke-width="3" fill="none" opacity="0.8"/>
      </g>
      <g transform="translate(210 96)">
        <path d="M0 44 h70 l-8 52 h-54 z" fill="#d97706"/>
        <path d="M10 44 q25 -34 50 0" stroke="#f59e0b" stroke-width="6" fill="none"/>
        <ellipse cx="35" cy="44" rx="35" ry="8" fill="#b45309"/>
      </g>
      ${priceTag(226, 44)}
    </g>
    <g transform="translate(40 392)" opacity="0.9">
      <ellipse cx="30" cy="46" rx="34" ry="9" fill="#04150f"/>
      <path d="M2 20 h56 l-7 28 h-42 z" fill="#c2833f"/>
      <path d="M2 20 q28 -16 56 0" stroke="#e0a35c" stroke-width="5" fill="none"/>
    </g>
    <g transform="translate(520 396)" opacity="0.9">
      <rect x="0" y="0" width="86" height="54" rx="8" fill="#0f4a37" stroke="#1d8a63" stroke-width="2"/>
      <circle cx="20" cy="20" r="6" fill="#fbbf24"/><circle cx="40" cy="20" r="6" fill="#f97316"/><circle cx="60" cy="20" r="6" fill="#a3e635"/>
      <rect x="10" y="34" width="60" height="5" rx="2.5" fill="#ffffff" opacity="0.4"/>
    </g>
    ${grain}`
  },

  "module-eats": {
    label: "Original NaijaDeals artwork: a bowl of Nigerian jollof rice with plantain and steam on a warm table",
    defs: `${sky("bgEats", "#3b0d0d", "#8a1c1c", "#f59e0b")}
      <radialGradient id="plate" cx="0.45" cy="0.4" r="0.75"><stop offset="0" stop-color="#fff7ed"/><stop offset="0.7" stop-color="#fde68a"/><stop offset="1" stop-color="#d97706"/></radialGradient>
      <linearGradient id="rice" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fb923c"/><stop offset="0.55" stop-color="#ea580c"/><stop offset="1" stop-color="#b91c1c"/></linearGradient>`,
    body: `<rect width="${W}" height="${H}" fill="url(#bgEats)"/>
    <circle cx="120" cy="90" r="110" fill="#f59e0b" opacity="0.16" filter="url(#soft)"/>
    <rect x="0" y="330" width="${W}" height="150" fill="#2a0a0a"/>
    <ellipse cx="320" cy="352" rx="250" ry="62" fill="#000" opacity="0.35"/>
    <ellipse cx="320" cy="320" rx="196" ry="128" fill="#1a0707" opacity="0.6"/>
    <ellipse cx="320" cy="300" rx="172" ry="112" fill="url(#plate)"/>
    <ellipse cx="320" cy="296" rx="132" ry="82" fill="url(#rice)"/>
    <g fill="#fbbf24" opacity="0.85">
      <ellipse cx="278" cy="272" rx="7" ry="4" transform="rotate(-18 278 272)"/>
      <ellipse cx="305" cy="292" rx="7" ry="4" transform="rotate(12 305 292)"/>
      <ellipse cx="344" cy="270" rx="7" ry="4" transform="rotate(-8 344 270)"/>
      <ellipse cx="360" cy="300" rx="7" ry="4" transform="rotate(22 360 300)"/>
      <ellipse cx="300" cy="255" rx="6" ry="3.5" transform="rotate(-30 300 255)"/>
      <ellipse cx="330" cy="316" rx="6" ry="3.5" transform="rotate(10 330 316)"/>
    </g>
    <g fill="#16a34a">
      <circle cx="286" cy="300" r="5"/><circle cx="352" cy="286" r="5"/><circle cx="318" cy="262" r="4"/>
    </g>
    <g transform="translate(400 246) rotate(12)">
      <ellipse cx="0" cy="0" rx="48" ry="30" fill="#b45309"/>
      <ellipse cx="0" cy="-4" rx="44" ry="26" fill="#d97706"/>
      <path d="M-30 -6 q30 -20 60 0" stroke="#fbbf24" stroke-width="5" fill="none" opacity="0.7"/>
    </g>
    <g transform="translate(232 300)">
      <circle cx="0" cy="0" r="22" fill="#facc15"/><circle cx="0" cy="0" r="16" fill="#fde68a"/>
      <circle cx="-6" cy="-4" r="3" fill="#f59e0b"/><circle cx="5" cy="5" r="3" fill="#f59e0b"/>
    </g>
    <g stroke="#fff7ed" stroke-width="3" opacity="0.35" fill="none" stroke-linecap="round">
      <path d="M272 196 q-16 -30 0 -58"/><path d="M320 188 q-18 -34 0 -66"/><path d="M368 196 q-14 -28 0 -54"/>
    </g>
    <g transform="translate(506 150) rotate(18)" opacity="0.9">
      <rect x="0" y="0" width="14" height="150" rx="7" fill="#e5e7eb"/>
      <path d="M-6 0 h26 v18 h-26 z" fill="#e5e7eb"/><path d="M-6 0 h26 v6 h-26 z" fill="#9ca3af"/>
    </g>
    <g transform="translate(64 380)" opacity="0.5" fill="#fbbf24">
      <circle cx="0" cy="0" r="4"/><circle cx="26" cy="14" r="3"/><circle cx="12" cy="34" r="2.5"/>
    </g>
    ${grain}`
  },

  "module-gigs": {
    label: "Original NaijaDeals artwork: tools, a solar panel and a hard hat for verified service professionals",
    defs: `${sky("bgGigs", "#0b1a3a", "#123b6b", "#38bdf8")}
      <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1e3a8a"/><stop offset="0.5" stop-color="#2563eb"/><stop offset="1" stop-color="#0f172a"/></linearGradient>
      <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e5e7eb"/><stop offset="1" stop-color="#6b7280"/></linearGradient>`,
    body: `<rect width="${W}" height="${H}" fill="url(#bgGigs)"/>
    <circle cx="520" cy="90" r="130" fill="#38bdf8" opacity="0.15" filter="url(#soft)"/>
    <g opacity="0.25" fill="#93c5fd">
      <rect x="40" y="40" width="120" height="3" rx="1.5"/><rect x="40" y="60" width="80" height="3" rx="1.5"/>
      <rect x="480" y="300" width="120" height="3" rx="1.5"/><rect x="500" y="318" width="90" height="3" rx="1.5"/>
    </g>
    <rect x="0" y="372" width="${W}" height="108" fill="#081226"/>
    <g transform="translate(330 120) rotate(-7)">
      <rect x="0" y="0" width="230" height="160" rx="10" fill="url(#panel)" stroke="#93c5fd" stroke-width="4"/>
      <g stroke="#bfdbfe" stroke-width="2" opacity="0.55">
        <path d="M0 40 h230 M0 80 h230 M0 120 h230 M58 0 v160 M116 0 v160 M174 0 v160"/>
      </g>
      <path d="M0 0 l40 0 -40 40 z" fill="#ffffff" opacity="0.18"/>
    </g>
    <rect x="438" y="270" width="12" height="108" fill="#475569" transform="rotate(6 438 270)"/>
    <g transform="translate(64 232)">
      <path d="M0 130 L44 16 L88 130 z" fill="#dc2626"/>
      <path d="M20 130 L44 44 L68 130 z" fill="#f87171" opacity="0.6"/>
      <path d="M-14 130 h116 v14 h-116 z" fill="#7f1d1d"/>
      <path d="M28 78 h32 M44 52 v80" stroke="#fff" stroke-width="8" opacity="0.8"/>
    </g>
    <g transform="translate(196 300) rotate(-24)">
      <rect x="0" y="0" width="120" height="14" rx="7" fill="url(#metal)"/>
      <circle cx="10" cy="7" r="14" fill="none" stroke="#9ca3af" stroke-width="8"/>
      <circle cx="10" cy="7" r="14" fill="none" stroke="#e5e7eb" stroke-width="3"/>
      <path d="M112 0 l24 -8 v30 l-24 -8 z" fill="#d1d5db"/>
    </g>
    <g transform="translate(84 100)">
      <rect x="0" y="0" width="96" height="60" rx="10" fill="#f59e0b"/>
      <rect x="0" y="0" width="96" height="16" rx="8" fill="#fbbf24"/>
      <path d="M20 0 v-14 a28 28 0 0 1 56 0 v14" stroke="#fbbf24" stroke-width="8" fill="none"/>
      <rect x="38" y="28" width="20" height="10" rx="4" fill="#78350f"/>
    </g>
    <g transform="translate(506 372)">
      <circle cx="0" cy="0" r="26" fill="#0ea5e9"/><path d="M-8 0 l6 7 11 -14" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>
    </g>
    ${grain}`
  },

  "module-stay": {
    label: "Original NaijaDeals artwork: a modern Lagos shortlet building at dusk with warm lit windows and palms",
    defs: `${sky("bgStay", "#1b1035", "#5b2160", "#f59e0b")}
      <linearGradient id="tower" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a1240"/><stop offset="0.6" stop-color="#3b1a52"/><stop offset="1" stop-color="#1e0b30"/></linearGradient>
      <linearGradient id="window" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>`,
    body: `<rect width="${W}" height="${H}" fill="url(#bgStay)"/>
    <circle cx="96" cy="96" r="52" fill="#fef3c7" opacity="0.9"/>
    <circle cx="96" cy="96" r="96" fill="#fef3c7" opacity="0.12" filter="url(#soft)"/>
    <g fill="#2a1240" opacity="0.7">
      <rect x="0" y="250" width="90" height="150"/><rect x="520" y="230" width="120" height="170"/>
    </g>
    <rect x="0" y="398" width="${W}" height="82" fill="#150a25"/>
    <g transform="translate(150 88)">
      <rect x="0" y="0" width="330" height="330" rx="10" fill="url(#tower)"/>
      <rect x="0" y="0" width="330" height="20" fill="#4c1d95"/>
      <g fill="url(#window)">
        <rect x="28" y="44" width="48" height="40" rx="4"/><rect x="96" y="44" width="48" height="40" rx="4" opacity="0.55"/><rect x="164" y="44" width="48" height="40" rx="4"/><rect x="232" y="44" width="48" height="40" rx="4" opacity="0.35"/>
        <rect x="28" y="112" width="48" height="40" rx="4" opacity="0.4"/><rect x="96" y="112" width="48" height="40" rx="4"/><rect x="164" y="112" width="48" height="40" rx="4" opacity="0.7"/><rect x="232" y="112" width="48" height="40" rx="4"/>
        <rect x="28" y="180" width="48" height="40" rx="4"/><rect x="96" y="180" width="48" height="40" rx="4" opacity="0.5"/><rect x="164" y="180" width="48" height="40" rx="4"/><rect x="232" y="180" width="48" height="40" rx="4" opacity="0.6"/>
        <rect x="28" y="248" width="48" height="40" rx="4" opacity="0.55"/><rect x="96" y="248" width="48" height="40" rx="4"/><rect x="164" y="248" width="48" height="40" rx="4" opacity="0.35"/><rect x="232" y="248" width="48" height="40" rx="4"/>
      </g>
      <g fill="#0f0718">
        <rect x="28" y="44" width="48" height="12" rx="3"/><rect x="96" y="44" width="48" height="12" rx="3"/><rect x="164" y="44" width="48" height="12" rx="3"/><rect x="232" y="44" width="48" height="12" rx="3"/>
      </g>
      <rect x="0" y="316" width="330" height="14" fill="#240d38"/>
      <rect x="150" y="150" width="30" height="46" rx="4" fill="#fbbf24"/>
    </g>
    <g transform="translate(96 258)">
      <path d="M0 150 q-6 -90 28 -140" stroke="#166534" stroke-width="10" fill="none"/>
      <g fill="#15803d">
        <path d="M28 10 q40 -22 64 -4 q-34 26 -64 4z"/><path d="M28 10 q-6 -34 16 -46 q10 32 -16 46z"/>
        <path d="M18 52 q44 -18 64 4 q-38 20 -64 -4z"/><path d="M8 96 q40 -14 58 8 q-36 16 -58 -8z"/>
        <path d="M2 140 q34 -10 48 10 q-30 12 -48 -10z"/>
      </g>
    </g>
    <g transform="translate(486 300)">
      <path d="M0 100 q-4 -60 20 -96" stroke="#166534" stroke-width="8" fill="none"/>
      <g fill="#15803d"><path d="M20 4 q34 -16 52 -2 q-28 20 -52 2z"/><path d="M12 40 q36 -12 52 6 q-32 16 -52 -6z"/><path d="M4 76 q30 -10 44 8 q-28 12 -44 -8z"/></g>
    </g>
    ${grain}`
  },

  "module-drive": {
    label: "Original NaijaDeals artwork: a ride-hailing car on a Lagos road at sunset with skyline and street lights",
    defs: `${sky("bgDrive", "#06121f", "#0f2c3f", "#f59e0b")}
      <linearGradient id="car" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#111827"/><stop offset="0.55" stop-color="#1f2937"/><stop offset="1" stop-color="#030712"/></linearGradient>
      <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#93c5fd"/><stop offset="1" stop-color="#1e3a8a"/></linearGradient>
      <linearGradient id="road" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f2937"/><stop offset="1" stop-color="#0b1220"/></linearGradient>`,
    body: `<rect width="${W}" height="${H}" fill="url(#bgDrive)"/>
    <circle cx="470" cy="140" r="76" fill="#fbbf24" opacity="0.9"/>
    <circle cx="470" cy="140" r="140" fill="#f59e0b" opacity="0.14" filter="url(#soft)"/>
    <g fill="#071b26" opacity="0.9">
      <rect x="40" y="196" width="46" height="160"/><rect x="96" y="170" width="34" height="186"/><rect x="140" y="212" width="52" height="144"/>
      <rect x="470" y="206" width="44" height="150"/><rect x="524" y="182" width="30" height="174"/><rect x="564" y="216" width="40" height="140"/>
    </g>
    <g fill="#fbbf24" opacity="0.75">
      <rect x="50" y="212" width="7" height="7"/><rect x="66" y="212" width="7" height="7"/><rect x="50" y="230" width="7" height="7"/>
      <rect x="102" y="190" width="6" height="6"/><rect x="116" y="190" width="6" height="6"/><rect x="102" y="208" width="6" height="6"/>
      <rect x="480" y="222" width="6" height="6"/><rect x="494" y="222" width="6" height="6"/><rect x="480" y="240" width="6" height="6"/>
      <rect x="532" y="200" width="5" height="5"/><rect x="544" y="200" width="5" height="5"/>
    </g>
    <rect x="0" y="348" width="${W}" height="132" fill="url(#road)"/>
    <path d="M0 348 h640" stroke="#334155" stroke-width="4"/>
    <path d="M190 480 L286 348 M450 480 L354 348" stroke="#fde68a" stroke-width="6" opacity="0.55" stroke-dasharray="26 22"/>
    <g transform="translate(132 250)">
      <path d="M34 62 q8 -34 34 -42 l40 -8 q26 -6 46 8 l44 34 q12 10 12 26 v26 q0 8 -8 8 h-30 q-10 0 -10 -10 v-4 h-108 v4 q0 10 -10 10 h-28 q-8 0 -8 -8 v-30 q0 -10 16 -14z" fill="url(#car)"/>
      <path d="M82 26 q14 -6 30 -4 l34 4 -18 28 h-64z" fill="url(#glass)" opacity="0.9"/>
      <path d="M132 26 l30 4 32 24 h-62z" fill="url(#glass)" opacity="0.75"/>
      <rect x="30" y="70" width="212" height="12" rx="6" fill="#f8fafc" opacity="0.08"/>
      <rect x="232" y="66" width="26" height="12" rx="5" fill="#fef3c7"/>
      <rect x="18" y="66" width="18" height="14" rx="5" fill="#ef4444"/>
      <circle cx="86" cy="118" r="22" fill="#030712" stroke="#475569" stroke-width="5"/><circle cx="86" cy="118" r="8" fill="#94a3b8"/>
      <circle cx="204" cy="118" r="22" fill="#030712" stroke="#475569" stroke-width="5"/><circle cx="204" cy="118" r="8" fill="#94a3b8"/>
      <rect x="100" y="46" width="52" height="6" rx="3" fill="#0ea5e9" opacity="0.9"/>
    </g>
    <g transform="translate(40 330)" opacity="0.5" stroke="#fde68a" stroke-width="3" stroke-linecap="round">
      <path d="M0 0 h30 M12 -12 h18 M24 -24 h12"/>
    </g>
    <g transform="translate(496 92)" opacity="0.9">
      <rect x="0" y="0" width="92" height="40" rx="10" fill="#0b1220" stroke="#fbbf24" stroke-width="2"/>
      <circle cx="20" cy="20" r="8" fill="#fbbf24"/><rect x="36" y="12" width="44" height="5" rx="2.5" fill="#fbbf24" opacity="0.7"/><rect x="36" y="24" width="30" height="4" rx="2" fill="#fbbf24" opacity="0.4"/>
    </g>
    ${grain}`
  },

  "module-send": {
    label: "Original NaijaDeals artwork: a courier rider carrying a parcel through a Nigerian street",
    defs: `${sky("bgSend", "#052e2b", "#0f766e", "#a7f3d0")}
      <linearGradient id="box" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbbf24"/><stop offset="1" stop-color="#d97706"/></linearGradient>`,
    body: `<rect width="${W}" height="${H}" fill="url(#bgSend)"/>
    <circle cx="520" cy="96" r="120" fill="#a7f3d0" opacity="0.14" filter="url(#soft)"/>
    <g fill="#064e3b" opacity="0.85">
      <rect x="20" y="180" width="80" height="170"/><rect x="112" y="206" width="60" height="144"/>
      <rect x="456" y="170" width="70" height="180"/><rect x="538" y="200" width="80" height="150"/>
    </g>
    <g fill="#34d399" opacity="0.5">
      <rect x="38" y="204" width="10" height="10"/><rect x="60" y="204" width="10" height="10"/><rect x="38" y="230" width="10" height="10"/>
      <rect x="474" y="196" width="9" height="9"/><rect x="496" y="196" width="9" height="9"/><rect x="474" y="220" width="9" height="9"/>
    </g>
    <rect x="0" y="350" width="${W}" height="130" fill="#032b28"/>
    <path d="M0 350 h640" stroke="#0f766e" stroke-width="5"/>
    <g transform="translate(128 210)">
      <ellipse cx="190" cy="220" rx="150" ry="18" fill="#000" opacity="0.35"/>
      <circle cx="86" cy="196" r="34" fill="#0b1518" stroke="#0f766e" stroke-width="6"/><circle cx="86" cy="196" r="10" fill="#64748b"/>
      <circle cx="268" cy="196" r="34" fill="#0b1518" stroke="#0f766e" stroke-width="6"/><circle cx="268" cy="196" r="10" fill="#64748b"/>
      <path d="M70 130 h150 l34 52 h-42 l-24 -34 h-92 l-30 34 h-46 z" fill="#0f172a"/>
      <path d="M196 84 l66 24 -22 34 -58 -18z" fill="url(#box)" stroke="#92400e" stroke-width="3"/>
      <path d="M196 84 l16 6 -12 34 -16 -6z" fill="#fde68a"/>
      <path d="M250 146 h44" stroke="#e2e8f0" stroke-width="8" stroke-linecap="round"/>
      <circle cx="252" cy="146" r="10" fill="#e2e8f0"/>
      <g transform="translate(96 30)">
        <circle cx="42" cy="34" r="26" fill="#f5d0a9"/>
        <path d="M16 34 q4 -34 26 -34 q22 0 26 34 q-14 -10 -26 -10 q-12 0 -26 10z" fill="#1f2937"/>
        <rect x="22" y="58" width="40" height="52" rx="14" fill="#0ea5e9"/>
        <path d="M22 66 q-20 8 -18 34 l12 4 q6 -20 18 -26z" fill="#0ea5e9"/>
        <path d="M62 66 q22 6 26 24" stroke="#f5d0a9" stroke-width="11" stroke-linecap="round"/>
      </g>
      <path d="M96 96 l-24 -30" stroke="#0f172a" stroke-width="18" stroke-linecap="round" opacity="0.25"/>
    </g>
    <g transform="translate(496 300) rotate(-6)">
      <rect x="0" y="0" width="104" height="60" rx="10" fill="#0b3b33" stroke="#34d399" stroke-width="2"/>
      <path d="M52 0 v60" stroke="#34d399" stroke-width="2" opacity="0.6"/>
      <circle cx="20" cy="20" r="7" fill="#34d399"/><rect x="14" y="38" width="72" height="6" rx="3" fill="#ffffff" opacity="0.35"/>
    </g>
    <g transform="translate(64 96) rotate(-10)" opacity="0.9">
      <rect x="0" y="0" width="120" height="70" rx="8" fill="#fefce8" stroke="#a16207" stroke-width="2"/>
      <path d="M0 24 h120 M60 24 v46" stroke="#d97706" stroke-width="2" opacity="0.6"/>
      <circle cx="20" cy="46" r="8" fill="none" stroke="#a16207" stroke-width="2"/>
    </g>
    ${grain}`
  },

  "module-stream": {
    label: "Original NaijaDeals artwork: headphones, vinyl and a music waveform for African creators",
    defs: `${sky("bgStream", "#1a0630", "#4c1d95", "#f472b6")}
      <linearGradient id="phones" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0abfc"/><stop offset="0.5" stop-color="#a855f7"/><stop offset="1" stop-color="#4c1d95"/></linearGradient>
      <radialGradient id="vinyl" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#f9a8d4"/><stop offset="0.2" stop-color="#a21caf"/><stop offset="0.6" stop-color="#1e1b4b"/><stop offset="1" stop-color="#0b0616"/></radialGradient>`,
    body: `<rect width="${W}" height="${H}" fill="url(#bgStream)"/>
    <circle cx="520" cy="110" r="120" fill="#f472b6" opacity="0.16" filter="url(#soft)"/>
    <g transform="translate(330 90)">
      <circle cx="140" cy="150" r="132" fill="url(#vinyl)"/>
      <g fill="none" stroke="#f9a8d4" stroke-width="1.5" opacity="0.28">
        <circle cx="140" cy="150" r="112"/><circle cx="140" cy="150" r="92"/><circle cx="140" cy="150" r="72"/><circle cx="140" cy="150" r="52"/>
      </g>
      <circle cx="140" cy="150" r="30" fill="#fbbf24"/><circle cx="140" cy="150" r="6" fill="#1e1b4b"/>
      <path d="M198 66 a100 100 0 0 1 8 44" stroke="#fff" stroke-width="4" opacity="0.25" fill="none"/>
    </g>
    <g transform="translate(60 130)">
      <path d="M40 210 q-14 -140 64 -166 q78 26 64 166" stroke="url(#phones)" stroke-width="22" fill="none" stroke-linecap="round"/>
      <rect x="0" y="182" width="52" height="96" rx="24" fill="#1e1b4b" stroke="#f0abfc" stroke-width="4"/>
      <rect x="10" y="196" width="32" height="68" rx="16" fill="url(#phones)" opacity="0.9"/>
      <rect x="196" y="182" width="52" height="96" rx="24" fill="#1e1b4b" stroke="#f0abfc" stroke-width="4"/>
      <rect x="206" y="196" width="32" height="68" rx="16" fill="url(#phones)" opacity="0.9"/>
    </g>
    <g transform="translate(70 380)" fill="#f472b6">
      ${[18, 30, 22, 44, 34, 54, 26, 40, 20, 32, 24, 46].map((h, i) => `<rect x="${i * 18}" y="${50 - h}" width="10" height="${h}" rx="4" opacity="${0.45 + (i % 3) * 0.18}"/>`).join("")}
    </g>
    <g transform="translate(470 372)">
      <circle cx="0" cy="0" r="40" fill="#fbbf24"/><path d="M-10 -16 l28 16 -28 16 z" fill="#1e1b4b"/>
    </g>
    <g fill="#f9a8d4" opacity="0.6">
      <circle cx="470" cy="240" r="4"/><circle cx="520" cy="270" r="3"/><circle cx="440" cy="300" r="3"/><circle cx="560" cy="210" r="3.5"/>
    </g>
    ${grain}`
  },

  "module-wallet": {
    label: "Original NaijaDeals artwork: a mobile wallet phone with a bank card, naira coins and transfer arrows",
    defs: `${sky("bgWallet", "#052e16", "#065f46", "#34d399")}
      <linearGradient id="phone" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f172a"/><stop offset="1" stop-color="#020617"/></linearGradient>
      <linearGradient id="card" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbbf24"/><stop offset="0.6" stop-color="#f59e0b"/><stop offset="1" stop-color="#b45309"/></linearGradient>`,
    body: `<rect width="${W}" height="${H}" fill="url(#bgWallet)"/>
    <circle cx="120" cy="110" r="130" fill="#34d399" opacity="0.16" filter="url(#soft)"/>
    <g opacity="0.18" fill="none" stroke="#d1fae5" stroke-width="2">
      <path d="M0 400 q160 -80 320 0 t320 0"/><path d="M0 432 q160 -80 320 0 t320 0"/>
    </g>
    <g transform="translate(214 44)">
      <rect x="0" y="0" width="212" height="380" rx="34" fill="url(#phone)" stroke="#134e4a" stroke-width="5"/>
      <rect x="12" y="14" width="188" height="352" rx="24" fill="#042f2e"/>
      <rect x="76" y="24" width="60" height="8" rx="4" fill="#134e4a"/>
      <rect x="28" y="48" width="156" height="110" rx="16" fill="#065f46"/>
      <text x="42" y="78" fill="#6ee7b7" font-family="Inter, Arial, sans-serif" font-size="11" font-weight="700" letter-spacing="1">NAIJAPAY BALANCE</text>
      <text x="42" y="112" fill="#ecfdf5" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="800">&#8358; 24,500</text>
      <rect x="42" y="128" width="70" height="6" rx="3" fill="#34d399" opacity="0.6"/>
      <g transform="translate(28 174)">
        <rect x="0" y="0" width="156" height="34" rx="10" fill="#0f766e"/>
        <text x="16" y="22" fill="#a7f3d0" font-family="Inter, Arial, sans-serif" font-size="11" font-weight="700">Transfer to bank</text>
        <path d="M138 17 h8 m-3 -4 l4 4 -4 4" stroke="#a7f3d0" stroke-width="2" fill="none"/>
      </g>
      <g transform="translate(28 216)">
        <rect x="0" y="0" width="74" height="34" rx="10" fill="#115e59"/>
        <text x="10" y="22" fill="#a7f3d0" font-family="Inter, Arial, sans-serif" font-size="10" font-weight="700">Airtime</text>
        <rect x="82" y="0" width="74" height="34" rx="10" fill="#115e59"/>
        <text x="92" y="22" fill="#a7f3d0" font-family="Inter, Arial, sans-serif" font-size="10" font-weight="700">Pay bill</text>
      </g>
      <g transform="translate(28 266)" fill="#0f766e">
        <rect x="0" y="0" width="156" height="30" rx="6"/><rect x="0" y="38" width="156" height="30" rx="6"/><rect x="0" y="76" width="156" height="30" rx="6"/>
        <circle cx="16" cy="15" r="8" fill="#34d399"/><circle cx="16" cy="53" r="8" fill="#34d399"/><circle cx="16" cy="91" r="8" fill="#34d399"/>
        <rect x="32" y="11" width="60" height="6" rx="3" fill="#a7f3d0" opacity="0.6"/><rect x="32" y="49" width="46" height="6" rx="3" fill="#a7f3d0" opacity="0.6"/><rect x="32" y="87" width="54" height="6" rx="3" fill="#a7f3d0" opacity="0.6"/>
      </g>
    </g>
    <g transform="translate(72 250) rotate(-14)">
      <rect x="0" y="0" width="190" height="118" rx="16" fill="url(#card)"/>
      <rect x="18" y="22" width="34" height="26" rx="5" fill="#fef3c7" opacity="0.9"/>
      <rect x="18" y="62" width="90" height="8" rx="4" fill="#78350f" opacity="0.4"/>
      <circle cx="150" cy="84" r="16" fill="#fde68a" opacity="0.8"/><circle cx="166" cy="84" r="16" fill="#fbbf24" opacity="0.8"/>
      <text x="18" y="102" fill="#451a03" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="800">NAIJADEALS</text>
    </g>
    <g transform="translate(480 300)">
      <circle cx="0" cy="0" r="46" fill="#fbbf24"/><circle cx="0" cy="0" r="36" fill="#f59e0b"/>
      <path d="M-10 -14 h20 M-10 0 h20 M-10 14 h20 M0 -14 v28" stroke="#78350f" stroke-width="4" stroke-linecap="round"/>
    </g>
    <g transform="translate(492 150)" stroke="#6ee7b7" stroke-width="3" fill="none" stroke-linecap="round">
      <path d="M0 0 h44 m-12 -10 l12 10 -12 10"/><path d="M60 34 h-44 m12 -10 l-12 10 12 10"/>
    </g>
    ${grain}`
  },

  "module-aura": {
    label: "Original NaijaDeals artwork: a glowing Aura assistant orb with chat bubbles and sparkles",
    defs: `${sky("bgAura", "#0b1026", "#312e81", "#22d3ee")}
      <radialGradient id="orb" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#ffffff"/><stop offset="0.25" stop-color="#a5f3fc"/><stop offset="0.6" stop-color="#6366f1"/><stop offset="1" stop-color="#1e1b4b"/></radialGradient>
      <linearGradient id="bubble" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e0f2fe"/><stop offset="1" stop-color="#bae6fd"/></linearGradient>`,
    body: `<rect width="${W}" height="${H}" fill="url(#bgAura)"/>
    <g fill="#e0e7ff" opacity="0.5">
      <circle cx="90" cy="80" r="2.5"/><circle cx="150" cy="130" r="2"/><circle cx="520" cy="90" r="3"/><circle cx="560" cy="180" r="2"/>
      <circle cx="80" cy="300" r="2"/><circle cx="540" cy="340" r="2.5"/><circle cx="440" cy="60" r="2"/>
    </g>
    <circle cx="320" cy="232" r="170" fill="#22d3ee" opacity="0.16" filter="url(#soft)"/>
    <circle cx="320" cy="232" r="112" fill="url(#orb)"/>
    <circle cx="320" cy="232" r="112" fill="none" stroke="#a5f3fc" stroke-width="2" opacity="0.5"/>
    <g stroke="#a5f3fc" stroke-width="2" fill="none" opacity="0.55">
      <ellipse cx="320" cy="232" rx="168" ry="58" transform="rotate(-18 320 232)"/>
      <ellipse cx="320" cy="232" rx="168" ry="58" transform="rotate(18 320 232)"/>
    </g>
    <g transform="translate(52 78)">
      <rect x="0" y="0" width="188" height="74" rx="20" fill="url(#bubble)"/>
      <path d="M28 74 l-6 22 30 -22z" fill="#bae6fd"/>
      <circle cx="42" cy="37" r="6" fill="#6366f1"/><circle cx="70" cy="37" r="6" fill="#6366f1" opacity="0.7"/><circle cx="98" cy="37" r="6" fill="#6366f1" opacity="0.4"/>
      <rect x="120" y="32" width="48" height="8" rx="4" fill="#6366f1" opacity="0.25"/>
    </g>
    <g transform="translate(406 300)">
      <rect x="0" y="0" width="180" height="66" rx="20" fill="#0f172a" stroke="#22d3ee" stroke-width="2"/>
      <path d="M150 66 l8 24 -34 -24z" fill="#0f172a" stroke="#22d3ee" stroke-width="2"/>
      <rect x="20" y="18" width="90" height="7" rx="3.5" fill="#67e8f9" opacity="0.8"/>
      <rect x="20" y="34" width="120" height="7" rx="3.5" fill="#67e8f9" opacity="0.35"/>
      <circle cx="156" cy="33" r="8" fill="#22d3ee" opacity="0.7"/>
    </g>
    <g fill="#fbbf24">
      <path d="M320 88 l6 18 18 6 -18 6 -6 18 -6 -18 -18 -6 18 -6z"/>
      <path d="M458 204 l4 12 12 4 -12 4 -4 12 -4 -12 -12 -4 12 -4z" opacity="0.8"/>
      <path d="M186 300 l4 12 12 4 -12 4 -4 12 -4 -12 -12 -4 12 -4z" opacity="0.7"/>
    </g>
    ${grain}`
  },

  "module-fresh": {
    label: "Original NaijaDeals artwork: a basket of fresh Nigerian produce with tomatoes, plantain and leafy greens",
    defs: `${sky("bgFresh", "#052e16", "#166534", "#bef264")}
      <linearGradient id="basket" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d97706"/><stop offset="1" stop-color="#7c2d12"/></linearGradient>`,
    body: `<rect width="${W}" height="${H}" fill="url(#bgFresh)"/>
    <circle cx="500" cy="100" r="120" fill="#d9f99d" opacity="0.18" filter="url(#soft)"/>
    <g opacity="0.25" stroke="#bbf7d0" stroke-width="2" fill="none">
      <path d="M0 420 q160 -60 320 0 t320 0"/><path d="M40 450 q140 -50 280 0 t280 0"/>
    </g>
    <g transform="translate(112 130)">
      <path d="M0 150 h416 l-42 116 q-8 18 -28 18 h-276 q-20 0 -28 -18z" fill="url(#basket)"/>
      <g stroke="#92400e" stroke-width="6" opacity="0.7">
        <path d="M26 186 h364 M38 226 h340 M56 262 h304"/>
      </g>
      <path d="M90 150 q0 -110 118 -110 q118 0 118 110" stroke="#a16207" stroke-width="14" fill="none"/>
      <path d="M70 150 q0 -90 138 -90 q138 0 138 90" stroke="#d97706" stroke-width="7" fill="none" opacity="0.6"/>
      <g>
        <circle cx="86" cy="112" r="40" fill="#dc2626"/><circle cx="76" cy="102" r="10" fill="#f87171" opacity="0.6"/>
        <path d="M86 72 q-2 -18 14 -22 q4 16 -14 22z" fill="#15803d"/>
        <circle cx="166" cy="96" r="38" fill="#ea580c"/><circle cx="156" cy="86" r="9" fill="#fdba74" opacity="0.6"/>
        <path d="M166 58 q-4 -16 12 -22 q6 16 -12 22z" fill="#15803d"/>
        <path d="M250 136 q-44 -10 -30 -58 q40 -4 52 34 q-6 22 -22 24z" fill="#facc15"/>
        <path d="M250 136 q-30 -18 -18 -48" stroke="#a16207" stroke-width="4" fill="none"/>
        <path d="M330 152 q-40 -34 -8 -70 q40 8 40 48 q-8 24 -32 22z" fill="#22c55e"/>
        <path d="M330 152 q-16 -32 8 -52" stroke="#166534" stroke-width="4" fill="none"/>
        <circle cx="286" cy="120" r="24" fill="#f97316"/><circle cx="279" cy="112" r="6" fill="#fed7aa" opacity="0.7"/>
      </g>
    </g>
    <g transform="translate(56 300) rotate(-18)" opacity="0.9">
      <path d="M0 0 q40 -10 60 14 q-34 18 -60 -14z" fill="#65a30d"/>
      <path d="M0 0 q-10 -32 18 -40 q14 26 -18 40z" fill="#4d7c0f"/>
    </g>
    <g transform="translate(488 330) rotate(12)" opacity="0.9">
      <path d="M0 0 q36 -8 54 12 q-30 16 -54 -12z" fill="#84cc16"/>
    </g>
    ${grain}`
  },

  "module-business": {
    label: "Original NaijaDeals artwork: a business briefcase with a growing chart and city skyline for company accounts",
    defs: `${sky("bgBiz", "#0c1222", "#1e293b", "#38bdf8")}
      <linearGradient id="case" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#334155"/><stop offset="1" stop-color="#0f172a"/></linearGradient>
      <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7dd3fc"/><stop offset="1" stop-color="#2563eb"/></linearGradient>`,
    body: `<rect width="${W}" height="${H}" fill="url(#bgBiz)"/>
    <circle cx="110" cy="96" r="110" fill="#38bdf8" opacity="0.14" filter="url(#soft)"/>
    <g fill="#0b1220" opacity="0.9">
      <rect x="28" y="210" width="58" height="150"/><rect x="96" y="176" width="42" height="184"/><rect x="148" y="230" width="62" height="130"/>
      <rect x="452" y="196" width="50" height="164"/><rect x="512" y="164" width="38" height="196"/><rect x="560" y="222" width="56" height="138"/>
    </g>
    <g fill="#38bdf8" opacity="0.5">
      <rect x="40" y="224" width="8" height="8"/><rect x="62" y="224" width="8" height="8"/><rect x="40" y="250" width="8" height="8"/>
      <rect x="462" y="212" width="7" height="7"/><rect x="482" y="212" width="7" height="7"/><rect x="462" y="236" width="7" height="7"/>
    </g>
    <rect x="0" y="382" width="${W}" height="98" fill="#080d18"/>
    <g transform="translate(160 214)">
      <rect x="0" y="40" width="300" height="150" rx="16" fill="url(#case)" stroke="#475569" stroke-width="3"/>
      <path d="M106 40 v-18 q0 -12 12 -12 h64 q12 0 12 12 v18" stroke="#94a3b8" stroke-width="8" fill="none"/>
      <rect x="0" y="88" width="300" height="8" fill="#0b1220"/>
      <rect x="130" y="76" width="40" height="30" rx="6" fill="#fbbf24"/>
      <g transform="translate(210 24)" opacity="0.9">
        <rect x="0" y="0" width="74" height="72" rx="12" fill="#0f172a" stroke="#38bdf8" stroke-width="2"/>
        <rect x="10" y="40" width="10" height="20" rx="3" fill="url(#bar)"/>
        <rect x="26" y="30" width="10" height="30" rx="3" fill="url(#bar)"/>
        <rect x="42" y="20" width="10" height="40" rx="3" fill="url(#bar)"/>
        <rect x="58" y="10" width="10" height="50" rx="3" fill="url(#bar)"/>
        <path d="M10 30 l16 -10 16 -6 18 -8" stroke="#fbbf24" stroke-width="2.5" fill="none"/>
      </g>
    </g>
    <g transform="translate(96 120)" fill="#fbbf24">
      <circle cx="0" cy="0" r="4"/><circle cx="30" cy="20" r="3"/><circle cx="14" cy="40" r="2.5"/>
    </g>
    ${grain}`
  },

  "hero-ecosystem": {
    label: "Original NaijaDeals artwork: a warm Lagos evening skyline with a phone showing the NaijaDeals ecosystem",
    defs: `${sky("bgHero", "#04140f", "#0b3b2c", "#f59e0b")}
      <linearGradient id="heroPhone" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f172a"/><stop offset="1" stop-color="#020617"/></linearGradient>
      <linearGradient id="heroGlow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbbf24" stop-opacity="0.6"/><stop offset="1" stop-color="#f59e0b" stop-opacity="0"/></linearGradient>`,
    body: `<rect width="${W}" height="${H}" fill="url(#bgHero)"/>
    <rect x="0" y="250" width="${W}" height="230" fill="url(#heroGlow)" opacity="0.35"/>
    <circle cx="520" cy="120" r="64" fill="#fde68a" opacity="0.9"/>
    <circle cx="520" cy="120" r="150" fill="#fbbf24" opacity="0.12" filter="url(#soft)"/>
    <g fill="#04241a" opacity="0.85">
      <rect x="20" y="250" width="70" height="230"/><rect x="106" y="286" width="52" height="194"/>
      <rect x="420" y="262" width="64" height="218"/><rect x="500" y="226" width="48" height="254"/><rect x="564" y="276" width="60" height="204"/>
    </g>
    <g fill="#fbbf24" opacity="0.55">
      <rect x="36" y="274" width="8" height="8"/><rect x="58" y="274" width="8" height="8"/><rect x="36" y="300" width="8" height="8"/>
      <rect x="432" y="286" width="7" height="7"/><rect x="452" y="286" width="7" height="7"/><rect x="432" y="310" width="7" height="7"/>
      <rect x="512" y="250" width="6" height="6"/><rect x="530" y="250" width="6" height="6"/><rect x="512" y="272" width="6" height="6"/>
    </g>
    <path d="M0 372 h640 v108 h-640z" fill="#031a12"/>
    <path d="M0 372 h640" stroke="#0f766e" stroke-width="3"/>
    <g transform="translate(196 96)">
      <rect x="0" y="0" width="248" height="366" rx="36" fill="url(#heroPhone)" stroke="#134e4a" stroke-width="6"/>
      <rect x="14" y="14" width="220" height="338" rx="26" fill="#052e22"/>
      <rect x="92" y="26" width="64" height="8" rx="4" fill="#134e4a"/>
      <circle cx="38" cy="66" r="14" fill="#fbbf24"/>
      <text x="38" y="72" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="900" fill="#052e22">N</text>
      <rect x="60" y="58" width="86" height="8" rx="4" fill="#a7f3d0" opacity="0.8"/>
      <rect x="60" y="72" width="54" height="6" rx="3" fill="#34d399" opacity="0.45"/>
      <rect x="30" y="96" width="188" height="96" rx="18" fill="#064e3b"/>
      <circle cx="70" cy="140" r="22" fill="#fbbf24" opacity="0.9"/>
      <rect x="104" y="122" width="92" height="10" rx="5" fill="#d1fae5" opacity="0.8"/>
      <rect x="104" y="142" width="64" height="8" rx="4" fill="#6ee7b7" opacity="0.5"/>
      <rect x="104" y="158" width="76" height="8" rx="4" fill="#6ee7b7" opacity="0.3"/>
      <g transform="translate(30 210)">
        ${[0, 1, 2, 3].map((i) => `<g transform="translate(0 ${i * 44})"><rect x="0" y="0" width="188" height="36" rx="12" fill="#0b3b2c"/><circle cx="20" cy="18" r="9" fill="${["#fbbf24", "#34d399", "#38bdf8", "#f472b6"][i]}" opacity="0.9"/><rect x="40" y="11" width="70" height="6" rx="3" fill="#d1fae5" opacity="0.55"/><rect x="40" y="23" width="44" height="4" rx="2" fill="#d1fae5" opacity="0.3"/><path d="M166 18 h10" stroke="#6ee7b7" stroke-width="2"/></g>`).join("")}
      </g>
    </g>
    <g transform="translate(54 150)" opacity="0.95">
      <rect x="0" y="0" width="118" height="46" rx="12" fill="#fbbf24"/>
      <circle cx="23" cy="23" r="10" fill="#78350f"/><rect x="40" y="14" width="60" height="6" rx="3" fill="#78350f" opacity="0.7"/><rect x="40" y="28" width="40" height="5" rx="2.5" fill="#78350f" opacity="0.4"/>
    </g>
    <g transform="translate(470 236)" opacity="0.95">
      <rect x="0" y="0" width="120" height="46" rx="12" fill="#ecfdf5"/>
      <circle cx="23" cy="23" r="10" fill="#0f766e"/><rect x="40" y="14" width="62" height="6" rx="3" fill="#065f46" opacity="0.7"/><rect x="40" y="28" width="38" height="5" rx="2.5" fill="#065f46" opacity="0.4"/>
    </g>
    <g transform="translate(480 316)">
      <circle cx="0" cy="0" r="26" fill="#34d399" opacity="0.9"/><path d="M-9 0 l6 7 12 -15" stroke="#04241a" stroke-width="4" fill="none" stroke-linecap="round"/>
    </g>
    ${grain}`
  }
};

let generated = 0;
for (const [name, scene] of Object.entries(scenes)) {
  const file = join(outDir, `${name}.svg`);
  writeFileSync(file, svg(scene.label, scene.body, scene.defs), "utf8");
  generated += 1;
}

console.log(`Generated ${generated} original artwork files in public/generated`);
