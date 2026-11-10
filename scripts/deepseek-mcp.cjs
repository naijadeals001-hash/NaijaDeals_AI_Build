/**
 * Minimal DeepSeek MCP client for scripted use.
 *
 * The MCP server is registered in the ZCode config but its tools are not exposed
 * to this agent session, so this speaks the same stdio JSON-RPC protocol directly.
 * Keys come from the environment; nothing is logged.
 */
const { spawn } = require("node:child_process");

const CMD = process.env.APPDATA + "\\npm\\deepseek-mcp-server.cmd";

function createClient(timeoutMs = 180000) {
  const proc = spawn(CMD, [], { shell: true });
  let buffer = "";
  let nextId = 1;
  const pending = new Map();

  proc.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim().startsWith("{")) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject, timer } = pending.get(msg.id);
        clearTimeout(timer);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message ?? "mcp error"));
        else resolve(msg.result);
      }
    }
  });

  function send(method, params) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`timeout: ${method}`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }

  async function start() {
    await new Promise((r) => setTimeout(r, 1500));
    await send("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "naijadeals", version: "1" } });
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    return api;
  }

  const api = {
    start,
    callTool: (name, args) => send("tools/call", { name, arguments: args }),
    close: () => proc.kill()
  };
  return api;
}

module.exports = { createClient };
