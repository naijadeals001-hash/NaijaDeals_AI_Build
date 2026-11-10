/**
 * DeepSeek vision comparison of an Aura render against the approved mockup.
 *
 * Sends the reference and the implementation as images and asks for measurable,
 * ordered differences. Used as a second opinion on the Pixelmatch figures — a
 * percentage tells you how much differs, not what to change.
 *
 * Usage: node scripts/aura-deepseek-review.cjs desktop|mobile
 */
const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("./deepseek-mcp.cjs");

const view = process.argv[2] ?? "desktop";
const WORK = path.join(process.cwd(), "qa-artifacts", "aura", "work");
const REF = path.join(WORK, `ds-ref-req.jpg`);
const MINE = path.join(WORK, `ds-mine-req.jpg`);

(async () => {
  const client = await createClient(420000).start();
  try {
    const asImage = (file) => `data:image/jpeg;base64,${fs.readFileSync(file).toString("base64")}`;
    const prompt = `You are reviewing a UI implementation against its approved design mockup, for a Nigerian super-app called Aura AI.

Image 1 is the APPROVED MOCKUP.
Image 2 is MY IMPLEMENTATION.

Compare them as a design reviewer. Report ONLY concrete, actionable differences, ordered by visual impact. For each: name the element, say what the mockup does, say what mine does, and give the fix in CSS terms (size, padding, colour, font-weight, position). Be specific with numbers where you can estimate them.

Focus on: heading size and weight, vertical rhythm and gaps, card dimensions and corner radius, badge/pill styling, orb size and placement, sidebar proportions, right-rail spacing, colours, and anything that looks visibly wrong or unfinished.

If something in my version is clearly broken (overlapping, clipped, misaligned), call it out first. Do not compliment or summarise; just list the differences.`;

    // create_response is the only path that forwards images in this MCP build:
    // a 64x64 red square came back "unsupported" via chat_completion and "Red"
    // via create_response.
    const res = await client.callTool("create_response", {
      model: "deepseek-v4-pro",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: asImage(REF) },
            { type: "input_image", image_url: asImage(MINE) }
          ]
        }
      ]
    });

    const text = (res.content ?? []).map((c) => c.text ?? "").join("\n");
    console.log(text);
    fs.writeFileSync(path.join(WORK, `deepseek-review-${view}.md`), text);
  } finally {
    client.close();
  }
})().catch((error) => {
  console.error("review failed:", error.message);
  process.exit(1);
});
