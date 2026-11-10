/**
 * Text-only DeepSeek review of Aura's layout code.
 *
 * The vision path in this MCP build is capped at roughly 12 KB per inline image
 * (a 260 px-wide screenshot gets through, 300 px does not), which is too coarse
 * for typography review. Text, however, has a 1M-token context, so this sends the
 * actual component source plus the measured reference geometry and asks for exact
 * CSS corrections.
 *
 * Usage: node scripts/aura-deepseek-code-review.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("./deepseek-mcp.cjs");

function read(file, from, to) {
  const lines = fs.readFileSync(path.join(process.cwd(), file), "utf8").split("\n");
  return lines.slice(from - 1, to).map((line, i) => `${from + i}: ${line}`).join("\n");
}

const SPEC = `Measured geometry from the approved desktop mockup (1586x992 reference pixels):

- Sidebar: 0-261px wide. Nav rows 40px apart. History rows carry a clock icon.
- Centre column: 261-1188px (927px). Content starts at x=314 (badge), composer border x=306..1146.
- Right rail: 1211-1564px (353px).
- Badge "BUILT AROUND YOUR WORLD": y=94-115, gold 1px border, ~11px uppercase text.
- Headline "Less searching. / More living.": two lines, first line y=160-205, second y=213-271. Total 111px of cap height. Left edge x=314.
- Subtitle: y=336-376 baseline area, ~17px text.
- Composer: y=336-403 (67px tall), bright mint 1px border, mint send button ~40px.
- Chips row: y=424-462 (38px tall), 4 pills with 1px white/20 border.
- User bubble: y~480-520, avatar 32px beside it.
- "Let's make a day of it." heading y=545; three cards y=601-800 (199px tall), each 285px wide with 15px gaps.
- Cards: photo on top ~140px, then title band with title left and a bordered pill below and a round arrow right.
- Action row below cards: "Refine my plan" outlined pill, "Review options" mint pill, then muted text.
- Footer strip: y=975-992, centred muted text.`;

const COMPONENT = read("components/aura/aura-desktop.tsx", 175, 275);

const PROMPT = `You are reviewing React + Tailwind layout code for pixel fidelity against a measured design spec.

Here is the MEASURED GEOMETRY of the approved mockup:

${SPEC}

Here is my current component source:

\`\`\`tsx
${COMPONENT}
\`\`\`

Identify, in priority order, the specific places where this code will NOT produce the measured geometry. For each: quote the line number, say what value the spec requires, and give the exact Tailwind class or inline style to use instead. Be concrete and quantitative. Ignore anything unrelated to layout fidelity. Output a numbered list of fixes only.`;

(async () => {
  const client = await createClient(420000).start();
  try {
    const res = await client.callTool("create_response", {
      model: "deepseek-flash",
      input: [{ role: "user", content: [{ type: "input_text", text: PROMPT }] }]
    });
    const text = (res.content ?? []).map((c) => c.text ?? "").join("\n");
    console.log(text);
    fs.writeFileSync(path.join(process.cwd(), "qa-artifacts", "aura", "work", "deepseek-code-review.md"), text);
  } finally {
    client.close();
  }
})().catch((error) => {
  console.error("review failed:", error.message);
  process.exit(1);
});
