#!/usr/bin/env node
/**
 * Local backup and restore verification.
 *
 *   node scripts/backup/run.mjs backup    # dump + encrypt + retention
 *   node scripts/backup/run.mjs verify    # restore into a throwaway DB and compare
 *   node scripts/backup/run.mjs check     # exit 1 when the last backup is stale
 *
 * Encrypted with AES-256-GCM using BACKUP_ENCRYPTION_KEY (32 bytes, base64).
 * File layout: MAGIC(4) | iv(12) | authTag(16) | ciphertext.
 *
 * Off-site copying is deliberately unimplemented: BACKUP_REMOTE is reported as
 * unconfigured rather than guessing a destination. Development data stays on
 * this machine.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { config } from "dotenv";

config();

const ROOT = process.cwd();
const DIR = join(ROOT, "backups");
const MANIFEST = join(DIR, "manifest.json");
const MAGIC = Buffer.from("NDB1");
const KEEP = Number(process.env.BACKUP_KEEP ?? 7);
const STALE_HOURS = Number(process.env.BACKUP_STALE_HOURS ?? 36);
const GROWING = ["User", "Product", "Order", "Wallet", "LedgerEntry"];

function pgBin(name) {
  if (process.env.PG_BIN) return join(process.env.PG_BIN, name);
  const candidates = ["C:/Program Files/PostgreSQL/18/bin", "C:/Program Files/PostgreSQL/17/bin"];
  for (const dir of candidates) {
    if (existsSync(join(dir, `${name}.exe`))) return join(dir, `${name}.exe`);
  }
  return name;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, ...options });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => (stdout += chunk));
    child.stderr?.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve({ stdout, stderr })
        : reject(new Error(`${command} exited ${code}: ${stderr.slice(0, 400) || stdout.slice(0, 400)}`))
    );
  });
}

function key() {
  const raw = process.env.BACKUP_ENCRYPTION_KEY;
  if (!raw) throw new Error("BACKUP_ENCRYPTION_KEY is not set; refusing to write an unencrypted backup.");
  const buffer = Buffer.from(raw, "base64");
  if (buffer.length !== 32) throw new Error("BACKUP_ENCRYPTION_KEY must decode to 32 bytes.");
  return buffer;
}

async function encryptFile(source, target) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const plain = await readFile(source);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  // MAGIC | iv | ciphertext | tag — one write, no stream ordering to get wrong.
  const sealed = Buffer.concat([MAGIC, iv, body, tag]);
  await writeFile(target, sealed);
  return createHash("sha256").update(sealed).digest("hex");
}

async function decryptFile(source, target) {
  const handle = await readFile(source);
  const iv = handle.subarray(4, 16);
  const tag = handle.subarray(handle.length - 16);
  const body = handle.subarray(16, handle.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(body), decipher.final()]);
  await writeFile(target, plain);
}

async function prune(prefix, keep) {
  const files = (await readdir(DIR)).filter((name) => name.startsWith(prefix) && name.endsWith(".enc")).sort();
  const excess = files.slice(0, Math.max(files.length - keep, 0));
  for (const file of excess) await unlink(join(DIR, file));
  return excess;
}

async function tableCounts() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const counts = {};
  for (const table of GROWING) {
    const rows = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${table}"`);
    counts[table] = rows[0]?.n ?? 0;
  }
  await prisma.$disconnect();
  return counts;
}

async function backup() {
  await mkdir(DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");

  const rawDump = join(DIR, `postgres-${stamp}.dump`);
  await run(pgBin("pg_dump"), ["--format=custom", "--no-owner", "--no-privileges", `--file=${rawDump}`, url]);
  const dumpTarget = join(DIR, `postgres-${stamp}.dump.enc`);
  const dumpSha = await encryptFile(rawDump, dumpTarget);
  const dumpBytes = (await stat(dumpTarget)).size;
  await unlink(rawDump);

  const objects = await backupObjects(stamp);
  const counts = await tableCounts();

  const manifest = readManifest();
  manifest.postgres = { at: new Date().toISOString(), file: dumpTarget.split(/[\\/]/).pop(), sha256: dumpSha, bytes: dumpBytes, counts };
  if (objects) manifest.objects = objects;
  manifest.remote = process.env.BACKUP_REMOTE ? "configured" : "not_configured";
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2));

  const pruned = [...(await prune("postgres-", KEEP)), ...(await prune("objects-", KEEP))];

  console.log(JSON.stringify({ ok: true, postgres: manifest.postgres.file, bytes: dumpBytes, objects: objects?.count ?? 0, pruned: pruned.length, remote: manifest.remote }, null, 2));
}

async function backupObjects(stamp) {
  const endpoint = process.env.S3_ENDPOINT;
  if (!endpoint) return null;
  const { S3Client, ListObjectsV2Command, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
    }
  });
  const bucket = process.env.S3_BUCKET;

  // One JSONL record per object: key, size and base64 bytes. No tar binary, so
  // the archive behaves the same on Windows, macOS and Linux.
  const lines = [];
  let token;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
    for (const item of page.Contents ?? []) {
      if (!item.Key) continue;
      const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: item.Key }));
      const bytes = Buffer.from(await object.Body.transformToByteArray());
      lines.push(JSON.stringify({ key: item.Key, bytes: bytes.length, body: bytes.toString("base64") }));
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  const plain = join(DIR, `objects-${stamp}.jsonl`);
  await writeFile(plain, lines.length ? `${lines.join("\n")}\n` : "");
  const target = join(DIR, `objects-${stamp}.jsonl.enc`);
  const sha = await encryptFile(plain, target);
  const size = (await stat(target)).size;
  await unlink(plain);
  return { at: new Date().toISOString(), file: target.split(/[\\/]/).pop(), sha256: sha, bytes: size, count: lines.length };
}

function readManifest() {
  if (!existsSync(MANIFEST)) return {};
  try {
    return JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch {
    return {};
  }
}

async function verify() {
  const manifest = readManifest();
  if (!manifest.postgres) throw new Error("No PostgreSQL backup in the manifest. Run `backup` first.");

  const source = join(DIR, manifest.postgres.file);
  const temp = join(DIR, "restore-check.dump");
  await decryptFile(source, temp);

  const url = new URL(process.env.DATABASE_URL);
  const database = `naijadeals_restore_${Date.now()}`;
  const adminUrl = new URL(url.toString());
  adminUrl.pathname = "/postgres";

  await run(pgBin("psql"), [adminUrl.toString(), "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE "${database}"`]);
  try {
    await run(pgBin("pg_restore"), [
      "--no-owner",
      "--no-privileges",
      `--dbname=${new URL(database, url).toString()}`,
      temp
    ]);

    const checkUrl = new URL(database, url).toString();
    for (const table of GROWING) {
      const expected = manifest.postgres.counts?.[table];
      const { stdout } = await run(pgBin("psql"), [checkUrl, "-t", "-A", "-c", `SELECT count(*) FROM "${table}"`]);
      const actual = Number(stdout.trim());
      if (typeof expected === "number" && expected !== actual) {
        throw new Error(`${table}: backup had ${expected} rows, restored ${actual}`);
      }
    }

    let objectCount = "not backed up";
    if (manifest.objects) {
      const jsonl = join(DIR, "restore-check.jsonl");
      await decryptFile(join(DIR, manifest.objects.file), jsonl);
      const records = (await readFile(jsonl, "utf8"))
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      if (records.length !== manifest.objects.count) {
        throw new Error(`objects: backup had ${manifest.objects.count}, archive lists ${records.length}`);
      }
      for (const record of records) {
        const bytes = Buffer.from(record.body, "base64");
        if (bytes.length !== record.bytes) throw new Error(`object ${record.key} is truncated`);
      }
      await unlink(jsonl);
      objectCount = `${records.length} objects, byte lengths verified`;
    }

    console.log(JSON.stringify({ ok: true, restoredInto: database, tables: GROWING.length, objects: objectCount }, null, 2));
  } finally {
    await unlink(temp).catch(() => undefined);
    await run(pgBin("psql"), [adminUrl.toString(), "-c", `DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`]).catch(() => undefined);
  }
}

async function check() {
  const manifest = readManifest();
  if (!manifest.postgres?.at) {
    console.error(JSON.stringify({ ok: false, reason: "no_backup", staleHours: null }));
    process.exit(1);
  }
  const ageHours = (Date.now() - new Date(manifest.postgres.at).getTime()) / 3_600_000;
  const ok = ageHours <= STALE_HOURS;
  console.log(JSON.stringify({ ok, ageHours: Math.round(ageHours * 10) / 10, staleAfterHours: STALE_HOURS, remote: manifest.remote ?? "not_configured" }));
  process.exit(ok ? 0 : 1);
}

const command = process.argv[2];
const actions = { backup, verify, check };
if (!actions[command]) {
  console.error("usage: node scripts/backup/run.mjs <backup|verify|check>");
  process.exit(2);
}

actions[command]().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exit(1);
});
