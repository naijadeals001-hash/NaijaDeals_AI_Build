#!/usr/bin/env node
/**
 * Verifies configured MCP servers by speaking the protocol to them.
 *
 *   node scripts/mcp-verify.mjs playwright rea kie-ai
 *
 * A server that merely starts is not verified: this performs the initialize
 * handshake, lists its tools, and — for the browser server — performs one real
 * navigation against the running app. Servers are read from the ZCode user
 * configuration so the check exercises the exact command ZCode would launch.
 *
 * Nothing secret is printed: argument values and environment values are not
 * echoed, only the tool names a server advertises.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_PATH = join(homedir(), ".zcode", "cli", "config.json");
const APP_URL = process.env.VERIFY_APP_URL ?? "http://127.0.0.1:3015";
const PROTOCOL_VERSION = "2025-06-18";

class StdioClient {
  constructor(name, config) {
    this.name = name;
    this.pending = new Map();
    this.buffer = "";
    this.nextId = 1;
    this.stderr = "";

    // Node refuses to spawn a .cmd directly without a shell, and `shell: true`
    // concatenates arguments without quoting, which breaks any path containing
    // a space. Running through cmd.exe ourselves keeps quoting explicit.
    const isBatch = /\.(cmd|bat)$/i.test(config.command);
    const [command, args] = isBatch
      ? ["cmd.exe", ["/d", "/c", config.command, ...(config.args ?? [])]]
      : [config.command, config.args ?? []];

    this.child = spawn(command, args, {
      env: { ...process.env, ...(config.env ?? {}) },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });

    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.onData(chunk));
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk) => {
      this.stderr = (this.stderr + chunk).slice(-4000);
    });
    this.child.on("exit", (code) => this.onExit(code));
  }

  onExit(code) {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(new Error(`server exited (code ${code})`));
    }
    this.pending.clear();
  }

  onData(chunk) {
    this.buffer += chunk;
    let index;
    while ((index = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      if (message.id === undefined || !this.pending.has(message.id)) continue;
      const { resolve, reject, timer } = this.pending.get(message.id);
      clearTimeout(timer);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.code}: ${message.error.message}`));
      else resolve(message.result);
    }
  }

  request(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 60_000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  notify(method, params) {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  close() {
    try {
      this.child.stdin.end();
    } catch {
      /* already closed */
    }
    setTimeout(() => {
      try {
        this.child.kill();
      } catch {
        /* already gone */
      }
    }, 400);
  }
}

function loadConfig(name) {
  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  const server = config?.mcp?.servers?.[name];
  if (!server) throw new Error(`"${name}" is not configured in ${CONFIG_PATH}`);
  return server;
}

function textOf(result) {
  if (!result?.content) return JSON.stringify(result ?? null).slice(0, 200);
  return result.content
    .map((item) => (item.type === "text" ? item.text : `[${item.type}]`))
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 220);
}

async function verify(name) {
  const config = loadConfig(name);
  const client = new StdioClient(name, config);
  try {
    const init = await client.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "naijadeals-infra-audit", version: "1.0.0" }
    });
    client.notify("notifications/initialized", {});

    const listed = await client.request("tools/list", {});
    const tools = listed?.tools ?? [];
    if (tools.length === 0) throw new Error("server advertised no tools");

    let extra = "";
    const navigate = tools.find((tool) => tool.name === "browser_navigate");
    if (navigate) {
      const result = await client.request("tools/call", {
        name: "browser_navigate",
        arguments: { url: APP_URL }
      });
      const failed = result?.isError === true;
      if (failed) throw new Error(`browser_navigate failed: ${textOf(result)}`);
      extra = ` | navigated ${APP_URL}: ${textOf(result)}`;
    }

    const serverInfo = init?.serverInfo ?? {};
    console.log(
      `PASS ${name.padEnd(12)} protocol=${init?.protocolVersion ?? "?"} ` +
        `server=${serverInfo.name ?? "?"}@${serverInfo.version ?? "?"} tools=${tools.length} ` +
        `[${tools.slice(0, 8).map((tool) => tool.name).join(", ")}${tools.length > 8 ? ", …" : ""}]${extra}`
    );
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const stderr = client.stderr.trim().split(/\r?\n/).slice(-2).join(" / ");
    console.log(`FAIL ${name.padEnd(12)} ${detail}${stderr ? ` | stderr: ${stderr.slice(0, 200)}` : ""}`);
    return false;
  } finally {
    client.close();
  }
}

const names = process.argv.slice(2);
if (names.length === 0) {
  console.error("usage: node scripts/mcp-verify.mjs <server-name> [<server-name> ...]");
  process.exit(2);
}

let ok = true;
for (const name of names) {
  const passed = await verify(name);
  ok = ok && passed;
}
process.exit(ok ? 0 : 1);
