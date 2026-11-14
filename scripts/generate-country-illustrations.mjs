/**
 * Original, code-native editorial illustrations for Discover Africa themes that
 * do not have an accurate approved photograph. These are deliberately simple
 * vector scenes, not photographs and not claims of country-specific products.
 */
import { writeFileSync } from "node:fs";

const S = 900;
const c = { cream: "#f4ecdc", sand: "#e5d3b2", green: "#0b5c33", deep: "#07351f", gold: "#d9a441", clay: "#b56a43", rust: "#a24b2a", white: "#fffdf8", ink: "#233a2c" };

function svg(inner, bg = c.cream) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" role="img">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#e8efe2"/></linearGradient>
<radialGradient id="glow" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<filter id="sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#4d3b20" flood-opacity=".15"/></filter>
</defs>
<rect width="${S}" height="${S}" fill="url(#bg)"/><rect width="${S}" height="${S}" fill="url(#glow)"/>
<circle cx="735" cy="160" r="115" fill="${c.gold}" opacity=".13"/><circle cx="150" cy="745" r="145" fill="${c.green}" opacity=".08"/>
<g filter="url(#sh)">${inner}</g>
</svg>`;
}

const hills = `<path d="M0 610 Q180 470 360 570 T720 530 T900 590 V900 H0Z" fill="${c.sand}"/><path d="M0 720 Q230 600 460 690 T900 660 V900 H0Z" fill="${c.green}" opacity=".8"/>`;

const images = {
  minerals: svg(`<ellipse cx="450" cy="700" rx="295" ry="66" fill="${c.sand}" opacity=".7"/>
    <path d="M245 625 L335 390 L445 445 L400 660Z" fill="#6f7d78"/><path d="M335 390 L445 445 L385 505 L300 470Z" fill="#98a39c"/>
    <path d="M445 445 L555 350 L635 525 L525 660 L400 660Z" fill="${c.clay}"/><path d="M555 350 L635 525 L525 660Z" fill="${c.rust}"/>
    <path d="M635 525 L725 610 L655 700 L525 660Z" fill="${c.gold}"/><path d="M635 525 L655 700 L725 610Z" fill="#b47b23"/>
    <path d="M300 470 L400 660 L245 625Z" fill="#53625b"/>`),
  energy: svg(`<circle cx="680" cy="245" r="80" fill="${c.gold}" opacity=".8"/><path d="M0 650 Q220 570 450 620 T900 590 V900 H0Z" fill="${c.sand}"/>
    <path d="M315 670 L390 280 L465 670Z" fill="none" stroke="${c.deep}" stroke-width="22" stroke-linejoin="round"/>
    <path d="M350 500 H430 M335 590 H447 M380 280 V680" stroke="${c.deep}" stroke-width="18"/><path d="M390 280 L560 390" stroke="${c.deep}" stroke-width="18"/>
    <path d="M560 390 Q620 420 640 480" stroke="${c.ink}" stroke-width="12" fill="none"/><rect x="610" y="480" width="120" height="56" rx="18" fill="${c.green}"/>
    <path d="M700 532 V640 M655 640 H745" stroke="${c.deep}" stroke-width="18" stroke-linecap="round"/>`),
  tourism: svg(`<circle cx="650" cy="250" r="95" fill="${c.gold}" opacity=".9"/>${hills}
    <path d="M520 690 Q515 570 555 470" stroke="${c.ink}" stroke-width="26" fill="none" stroke-linecap="round"/>
    <path d="M555 470 Q480 430 430 470 M555 470 Q640 420 700 455 M555 470 Q520 390 470 380 M555 470 Q620 390 675 390" stroke="${c.ink}" stroke-width="18" fill="none" stroke-linecap="round"/>`),
  pottery: svg(`<ellipse cx="455" cy="715" rx="250" ry="58" fill="${c.sand}" opacity=".75"/>
    <path d="M330 420 Q275 500 300 590 Q325 690 455 700 Q585 690 610 590 Q635 500 580 420Z" fill="${c.clay}"/>
    <path d="M330 420 Q455 380 580 420 L565 470 Q455 435 345 470Z" fill="${c.rust}"/><ellipse cx="455" cy="420" rx="126" ry="32" fill="#8f4d30"/>
    <ellipse cx="455" cy="420" rx="98" ry="20" fill="#5a2d1c"/><path d="M345 560 Q455 520 565 560" stroke="${c.gold}" stroke-width="12" fill="none"/>
    <path d="M365 620 L400 580 L435 620 L470 580 L505 620 L540 580" stroke="${c.cream}" stroke-width="10" fill="none" stroke-linejoin="round"/>`),
  furniture: svg(`<ellipse cx="450" cy="730" rx="300" ry="55" fill="${c.sand}" opacity=".7"/>
    <rect x="235" y="390" width="250" height="190" rx="26" fill="${c.clay}"/><rect x="255" y="410" width="210" height="150" rx="18" fill="${c.cream}" opacity=".4"/>
    <rect x="215" y="560" width="290" height="60" rx="20" fill="${c.rust}"/><rect x="250" y="610" width="28" height="105" rx="12" fill="${c.deep}"/>
    <rect x="445" y="610" width="28" height="105" rx="12" fill="${c.deep}"/><rect x="570" y="520" width="200" height="28" rx="12" fill="${c.deep}"/>
    <rect x="600" y="548" width="24" height="155" rx="10" fill="${c.deep}"/><rect x="716" y="548" width="24" height="155" rx="10" fill="${c.deep}"/>
    <path d="M600 470 Q670 390 740 470" stroke="${c.gold}" stroke-width="26" fill="none" stroke-linecap="round"/>`),
  fruit: svg(`<ellipse cx="450" cy="700" rx="290" ry="62" fill="${c.sand}" opacity=".75"/><path d="M190 560 Q450 765 710 560 Q660 710 450 750 Q240 710 190 560Z" fill="${c.clay}"/>
    <path d="M225 560 Q450 700 675 560" stroke="${c.rust}" stroke-width="12" fill="none"/><ellipse cx="365" cy="535" rx="68" ry="52" fill="#7b3f2a"/>
    <ellipse cx="365" cy="535" rx="32" ry="24" fill="#a86a4f"/><path d="M520 470 Q585 450 615 510 Q590 570 520 560 Q485 515 520 470Z" fill="${c.green}"/>
    <ellipse cx="465" cy="565" rx="55" ry="42" fill="${c.gold}"/><ellipse cx="465" cy="565" rx="25" ry="18" fill="#b47b23"/>
    <circle cx="590" cy="560" r="42" fill="${c.rust}"/><circle cx="295" cy="570" r="36" fill="${c.gold}" opacity=".9"/>`),
  grain: svg(`<ellipse cx="450" cy="720" rx="280" ry="60" fill="${c.sand}" opacity=".75"/><path d="M275 470 Q255 590 305 690 L595 690 Q645 590 625 470Z" fill="${c.cream}"/>
    <path d="M275 470 Q450 520 625 470 L610 535 Q450 585 290 535Z" fill="${c.gold}" opacity=".8"/><path d="M305 690 Q450 720 595 690" stroke="${c.clay}" stroke-width="14" fill="none"/>
    <g fill="${c.gold}"><ellipse cx="300" cy="590" rx="16" ry="9" transform="rotate(22 300 590)"/><ellipse cx="340" cy="620" rx="16" ry="9" transform="rotate(-15 340 620)"/>
    <ellipse cx="390" cy="610" rx="16" ry="9" transform="rotate(32 390 610)"/><ellipse cx="440" cy="630" rx="16" ry="9" transform="rotate(-22 440 630)"/>
    <ellipse cx="500" cy="610" rx="16" ry="9" transform="rotate(18 500 610)"/><ellipse cx="555" cy="625" rx="16" ry="9" transform="rotate(-28 555 625)"/>
    <ellipse cx="600" cy="600" rx="16" ry="9" transform="rotate(12 600 600)"/></g>`),
  wool: svg(`<ellipse cx="450" cy="710" rx="270" ry="58" fill="${c.sand}" opacity=".72"/><circle cx="430" cy="500" r="190" fill="${c.cream}"/>
    <path d="M255 520 Q340 400 450 430 Q560 380 610 490 Q650 590 540 650 Q430 710 330 640 Q220 600 255 520Z" fill="${c.cream}" stroke="${c.sand}" stroke-width="8"/>
    <g stroke="${c.gold}" stroke-width="9" fill="none" opacity=".75"><path d="M300 500 Q420 410 560 500"/><path d="M280 570 Q420 480 600 570"/><path d="M330 640 Q450 550 590 610"/><path d="M380 430 Q480 520 390 630"/></g>
    <path d="M600 600 Q690 560 735 640" stroke="${c.rust}" stroke-width="14" fill="none" stroke-linecap="round"/>`),
  leaf: svg(`<path d="M450 710 Q430 520 480 300 Q590 300 660 390 Q700 470 630 560 Q560 650 450 710Z" fill="${c.green}"/>
    <path d="M450 710 Q500 540 600 390" stroke="${c.deep}" stroke-width="12" fill="none"/>
    <path d="M520 590 Q580 560 620 590 M540 520 Q600 490 640 520 M560 450 Q610 430 650 450" stroke="${c.cream}" stroke-width="8" fill="none" opacity=".4"/>
    <path d="M330 690 Q300 570 330 480 Q410 520 430 610 Q400 680 330 690Z" fill="${c.gold}" opacity=".85"/>`),
  flower: svg(`<circle cx="450" cy="460" r="52" fill="${c.gold}"/><g fill="${c.cream}">
    <ellipse cx="450" cy="330" rx="44" ry="100"/><ellipse cx="450" cy="590" rx="44" ry="100"/><ellipse cx="320" cy="460" rx="100" ry="44"/><ellipse cx="580" cy="460" rx="100" ry="44"/>
    <ellipse cx="350" cy="360" rx="86" ry="40" transform="rotate(-45 350 360)"/><ellipse cx="550" cy="360" rx="86" ry="40" transform="rotate(45 550 360)"/>
    <ellipse cx="350" cy="560" rx="86" ry="40" transform="rotate(45 350 560)"/><ellipse cx="550" cy="560" rx="86" ry="40" transform="rotate(-45 550 560)"/></g>
    <circle cx="450" cy="460" r="34" fill="${c.rust}"/><path d="M450 700 Q460 600 450 560" stroke="${c.green}" stroke-width="14" fill="none" stroke-linecap="round"/>`),
  bottle: svg(`<ellipse cx="450" cy="725" rx="270" ry="55" fill="${c.sand}" opacity=".7"/>
    <path d="M395 300 H505 V390 Q570 430 580 540 V690 Q580 720 550 720 H350 Q320 720 320 690 V540 Q330 430 395 390Z" fill="${c.deep}"/>
    <rect x="395" y="260" width="110" height="50" rx="12" fill="${c.gold}"/><rect x="360" y="500" width="180" height="130" rx="10" fill="${c.cream}" opacity=".85"/>
    <path d="M395 550 H505 M395 585 H485" stroke="${c.clay}" stroke-width="10" stroke-linecap="round"/>
    <path d="M650 520 Q720 520 730 590 Q740 670 675 690 Q610 660 620 590 Q630 520 650 520Z" fill="${c.cream}" opacity=".7"/>`),
  water: svg(`<circle cx="620" cy="270" r="100" fill="${c.gold}" opacity=".2"/><path d="M395 300 Q450 240 505 300 V390 Q570 440 570 550 V690 Q570 720 540 720 H360 Q330 720 330 690 V550 Q330 440 395 390Z" fill="#cfe7e2" stroke="${c.deep}" stroke-width="8"/>
    <rect x="395" y="300" width="110" height="55" rx="12" fill="${c.green}"/><rect x="365" y="520" width="170" height="120" rx="12" fill="${c.cream}" opacity=".9"/>
    <path d="M415 580 Q450 540 485 580 Q485 615 450 630 Q415 615 415 580Z" fill="#4d9a94"/>`),
  auto: svg(`<circle cx="450" cy="470" r="190" fill="${c.deep}" opacity=".9"/><circle cx="450" cy="470" r="110" fill="${c.cream}"/><circle cx="450" cy="470" r="40" fill="${c.green}"/>
    <g fill="${c.deep}"><rect x="440" y="270" width="20" height="50" rx="6"/><rect x="440" y="620" width="20" height="50" rx="6"/><rect x="250" y="460" width="50" height="20" rx="6"/><rect x="600" y="460" width="50" height="20" rx="6"/></g>
    <path d="M160 720 Q260 660 390 700 T680 690" stroke="${c.rust}" stroke-width="16" fill="none" stroke-linecap="round"/>`),
  factory: svg(`<path d="M0 720 H900 V900 H0Z" fill="${c.sand}" opacity=".7"/><path d="M180 720 V430 L330 520 V430 L480 520 V430 L630 520 V720Z" fill="${c.deep}"/>
    <path d="M180 430 L330 520 L480 430 L630 520 L780 430 V720 H180Z" fill="${c.green}" opacity=".9"/>
    <rect x="245" y="570" width="80" height="70" rx="8" fill="${c.gold}" opacity=".8"/><rect x="390" y="570" width="80" height="70" rx="8" fill="${c.gold}" opacity=".8"/>
    <rect x="535" y="570" width="80" height="70" rx="8" fill="${c.gold}" opacity=".8"/><rect x="660" y="300" width="60" height="230" fill="${c.rust}"/>`),
  boat: svg(`<path d="M0 680 Q220 620 450 670 T900 650 V900 H0Z" fill="#8fb8b0" opacity=".75"/><path d="M210 650 Q450 780 690 650 L620 720 Q450 800 280 720Z" fill="${c.clay}"/>
    <path d="M450 650 V270" stroke="${c.deep}" stroke-width="16"/><path d="M450 300 L450 610 L650 610Z" fill="${c.cream}"/><path d="M440 330 L440 600 L275 600Z" fill="${c.gold}" opacity=".85"/>`)
};

for (const [name, markup] of Object.entries(images)) {
  writeFileSync(`public/generated/countries/illustration-${name}.svg`, markup.trim() + "\n", "utf8");
  console.log(`illustration-${name}.svg`);
}
