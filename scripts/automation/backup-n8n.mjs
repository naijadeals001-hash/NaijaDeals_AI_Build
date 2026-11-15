#!/usr/bin/env node
/**
 * Consistent local n8n backup: SQLite snapshot (VACUUM INTO, WAL-safe), encrypt
 * with AES-256-GCM using the separate recovery key, write to D:, then verify by
 * restoring into an isolated folder and reading the workflow table.
 *
 * Never prints the encryption key or workflow contents.
 */
import fs from "node:fs";
import crypto from "node:crypto";

const root = "C:/NaijaDeals-Automation";
const db = root + "/n8n-data/database.sqlite";
const snapshot = root + "/n8n-data/backup-snapshot.sqlite";
const sqlite3 = (await import("file:///C:/NaijaDeals-Automation/n8n/node_modules/sqlite3/lib/sqlite3.js")).default;
const snapshotUrl = snapshot.split("\\").join("/");

await new Promise((resolve, reject) => {
  const conn = new sqlite3.Database(db, (err) => (err ? reject(err) : undefined));
  conn.exec("VACUUM INTO '" + snapshotUrl + "'", (e) => {
    conn.close();
    e ? reject(e) : resolve();
  });
});

const key = Buffer.from(fs.readFileSync(root + "/config/recovery.key", "utf8").trim(), "base64");
const payload = JSON.stringify({
  at: new Date().toISOString(),
  config: fs.readFileSync(root + "/config/n8n.env", "utf8"),
  dbBase64: fs.readFileSync(snapshot).toString("base64")
});
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
const body = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
const sealed = Buffer.concat([Buffer.from("N8N1"), iv, body, cipher.getAuthTag()]);
const dir = "D:/NaijaDeals-Storage/backups/n8n";
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const archive = dir + "/n8n-" + stamp + ".enc";
fs.writeFileSync(archive, sealed);
fs.rmSync(snapshot, { force: true });

const restoredDir = root + "/restore-test";
fs.rmSync(restoredDir, { recursive: true, force: true });
fs.mkdirSync(restoredDir, { recursive: true });
const handle = fs.readFileSync(archive);
const decipher = crypto.createDecipheriv("aes-256-gcm", key, handle.subarray(4, 16));
decipher.setAuthTag(handle.subarray(handle.length - 16));
const plain = Buffer.concat([decipher.update(handle.subarray(16, handle.length - 16)), decipher.final()]).toString("utf8");
const parsed = JSON.parse(plain);
fs.writeFileSync(restoredDir + "/database.sqlite", Buffer.from(parsed.dbBase64, "base64"));
const rows = await new Promise((resolve, reject) => {
  const conn = new sqlite3.Database(restoredDir + "/database.sqlite", sqlite3.OPEN_READONLY, (err) => (err ? reject(err) : undefined));
  conn.all("select name, active from workflow_entity", (e, r) => {
    conn.close();
    e ? reject(e) : resolve(r);
  });
});
console.log(JSON.stringify({ ok: true, archive, bytes: sealed.length, restoredWorkflows: rows.length, activeWorkflows: rows.filter((r) => r.active).length }));
