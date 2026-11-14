/** Additional original vector illustrations for specific Discover Africa themes. */
import { writeFileSync } from "node:fs";

const S = 900;
const c = { cream: "#f4ecdc", sand: "#e5d3b2", green: "#0b5c33", deep: "#07351f", gold: "#d9a441", clay: "#b56a43", rust: "#a24b2a", white: "#fffdf8", ink: "#233a2c" };
const frame = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" role="img">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.cream}"/><stop offset="1" stop-color="#e8efe2"/></linearGradient>
<radialGradient id="glow" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<filter id="sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#4d3b20" flood-opacity=".15"/></filter></defs>
<rect width="${S}" height="${S}" fill="url(#bg)"/><rect width="${S}" height="${S}" fill="url(#glow)"/>
<circle cx="735" cy="160" r="115" fill="${c.gold}" opacity=".13"/><circle cx="150" cy="745" r="145" fill="${c.green}" opacity=".08"/>
<g filter="url(#sh)">${inner}</g></svg>`;

const images = {
  hydropower: frame(`<path d="M0 650 Q160 560 340 610 T900 590 V900 H0Z" fill="${c.sand}"/>
    <path d="M250 360 Q450 320 650 360 L700 690 H200Z" fill="${c.deep}"/><path d="M300 690 Q450 640 600 690 L650 760 H250Z" fill="${c.green}"/>
    <path d="M330 420 H570 M330 500 H570" stroke="${c.cream}" stroke-width="12" opacity=".35"/>
    <path d="M200 660 Q120 700 110 780 M700 660 Q780 700 790 780" stroke="#8fb8b0" stroke-width="22" fill="none" stroke-linecap="round"/>
    <circle cx="450" cy="560" r="58" fill="${c.gold}"/><path d="M450 502 V618 M392 560 H508 M410 520 L490 600 M490 520 L410 600" stroke="${c.deep}" stroke-width="14"/>`),
  gas: frame(`<path d="M0 700 H900 V900 H0Z" fill="${c.sand}"/><path d="M120 650 H520 V720 H120Z" fill="${c.green}"/>
    <path d="M200 650 V520 H460 V650 M300 520 V430 H420" stroke="${c.deep}" stroke-width="26" fill="none"/>
    <path d="M420 430 Q480 370 540 430 Q540 500 480 520 Q430 490 420 430Z" fill="${c.rust}"/>
    <path d="M480 520 Q520 560 560 520" stroke="${c.gold}" stroke-width="16" fill="none"/>
    <circle cx="680" cy="470" r="100" fill="${c.gold}" opacity=".2"/>`),
  carpet: frame(`<path d="M150 300 Q450 240 750 300 L700 700 Q450 760 200 700Z" fill="${c.rust}"/>
    <path d="M200 340 Q450 290 700 340 L660 660 Q450 710 240 660Z" fill="${c.clay}"/>
    <g stroke="${c.gold}" stroke-width="12" fill="none"><path d="M240 400 L660 400 M240 600 L660 600"/><path d="M300 360 L260 640 M450 350 L450 660 M600 360 L640 640"/></g>
    <g fill="${c.cream}"><path d="M300 500 L360 440 L420 500 L360 560Z"/><path d="M480 500 L540 440 L600 500 L540 560Z"/></g>`),
  weaving: frame(`<rect x="160" y="260" width="580" height="460" rx="24" fill="${c.sand}"/>
    <path d="M190 300 H710 M190 680 H710 M210 280 V700 M690 280 V700" stroke="${c.deep}" stroke-width="18"/>
    <g stroke="${c.rust}" stroke-width="8"><path d="M240 360 H660 M240 420 H660 M240 480 H660 M240 540 H660 M240 600 H660"/></g>
    <g stroke="${c.green}" stroke-width="8"><path d="M280 330 V650 M350 330 V650 M420 330 V650 M490 330 V650 M560 330 V650 M630 330 V650"/></g>
    <path d="M450 260 V760" stroke="${c.gold}" stroke-width="12" opacity=".65"/>`),
  craft: frame(`<ellipse cx="450" cy="730" rx="250" ry="55" fill="${c.sand}" opacity=".7"/>
    <rect x="300" y="640" width="300" height="80" rx="16" fill="${c.clay}"/>
    <path d="M370 640 Q360 520 420 430 Q450 380 480 430 Q540 520 530 640Z" fill="#6f7d78"/>
    <path d="M420 430 Q450 480 480 430" stroke="${c.cream}" stroke-width="12" fill="none"/>
    <path d="M410 500 Q450 540 490 500" stroke="${c.cream}" stroke-width="8" fill="none" opacity=".5"/>
    <circle cx="450" cy="380" r="42" fill="${c.gold}" opacity=".8"/>`),
  candle: frame(`<ellipse cx="450" cy="730" rx="270" ry="58" fill="${c.sand}" opacity=".7"/>
    <rect x="260" y="430" width="100" height="270" rx="12" fill="${c.cream}"/><rect x="400" y="360" width="100" height="340" rx="12" fill="${c.cream}"/>
    <rect x="540" y="480" width="100" height="220" rx="12" fill="${c.cream}"/>
    <path d="M310 430 Q285 390 310 350 Q335 390 310 430Z" fill="${c.gold}"/><path d="M450 360 Q425 315 450 270 Q475 315 450 360Z" fill="${c.rust}"/>
    <path d="M590 480 Q565 435 590 390 Q615 435 590 480Z" fill="${c.gold}"/>
    <path d="M260 700 H640" stroke="${c.green}" stroke-width="14" stroke-linecap="round"/>`),
  mushroom: frame(`<ellipse cx="450" cy="720" rx="280" ry="62" fill="${c.sand}" opacity=".7"/>
    <path d="M330 620 Q300 520 360 450 Q430 390 500 450 Q560 520 530 620Z" fill="${c.rust}"/>
    <path d="M360 620 Q350 690 380 720 H480 Q510 690 500 620Z" fill="${c.cream}"/>
    <path d="M400 450 Q430 410 460 450" stroke="${c.gold}" stroke-width="12" fill="none"/>
    <path d="M560 650 Q540 580 580 530 Q630 490 680 530 Q720 580 700 650Z" fill="${c.clay}"/>
    <path d="M590 650 Q585 700 605 720 H665 Q685 700 680 650Z" fill="${c.cream}"/>`),
  leather: frame(`<ellipse cx="450" cy="720" rx="290" ry="60" fill="${c.sand}" opacity=".7"/>
    <path d="M190 430 Q300 320 450 360 Q600 320 710 430 Q680 570 610 650 Q450 710 290 650 Q220 570 190 430Z" fill="${c.clay}"/>
    <path d="M250 440 Q350 370 450 400 Q550 370 650 440 Q620 550 560 610 Q450 660 340 610 Q280 550 250 440Z" fill="${c.rust}" opacity=".55"/>
    <path d="M300 500 Q450 560 600 500" stroke="${c.cream}" stroke-width="12" fill="none" stroke-dasharray="18 14"/>
    <circle cx="450" cy="520" r="38" fill="${c.gold}" opacity=".75"/>`),
  rubber: frame(`<path d="M0 700 Q220 640 450 680 T900 660 V900 H0Z" fill="${c.sand}" opacity=".8"/>
    <path d="M430 700 Q420 500 450 300" stroke="${c.clay}" stroke-width="46" stroke-linecap="round"/>
    <path d="M450 300 Q520 270 580 300 M450 300 Q380 260 330 300" stroke="${c.green}" stroke-width="28" fill="none"/>
    <path d="M470 520 Q540 540 590 520" stroke="${c.cream}" stroke-width="12" fill="none"/>
    <path d="M590 520 V610" stroke="${c.cream}" stroke-width="10"/>
    <path d="M560 610 H620 L610 680 H570Z" fill="${c.cream}"/><ellipse cx="590" cy="640" rx="16" ry="8" fill="${c.gold}"/>
    <path d="M300 720 Q400 680 500 720" stroke="${c.green}" stroke-width="10" fill="none" opacity=".5"/>`)
};

for (const [name, markup] of Object.entries(images)) {
  writeFileSync(`public/generated/countries/illustration-${name}.svg`, markup.trim() + "\n", "utf8");
  console.log(`illustration-${name}.svg`);
}
