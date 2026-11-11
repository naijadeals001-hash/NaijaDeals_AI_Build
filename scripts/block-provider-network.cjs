// Preload guard: rejects outbound fetch to AI providers and records attempts.
const fs = require("node:fs");
const logPath = process.env.BLOCK_LOG || "";
const blocked = /(^|\.)(deepseek\.com|api\.deepseek\.com|openai\.com|anthropic\.com)$/i;
const original = globalThis.fetch;
globalThis.fetch = async function (input, init) {
  let host = "";
  try { host = new URL(typeof input === "string" ? input : input.url).hostname; } catch { host = ""; }
  if (blocked.test(host)) {
    if (logPath) fs.appendFileSync(logPath, `blocked ${host}\n`);
    throw new Error(`outbound provider traffic blocked: ${host}`);
  }
  return original(input, init);
};
