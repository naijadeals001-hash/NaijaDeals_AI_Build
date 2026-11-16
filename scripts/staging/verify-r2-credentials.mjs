#!/usr/bin/env node
/**
 * Safe R2 storage probe for the staging buckets.
 *
 * It loads the protected staging environment, writes one unique small object
 * to each required staging bucket, reads it through S3, checks the public URL
 * for the public bucket and its denial for the private bucket, then deletes
 * both probe objects. It never prints credentials, endpoints, bucket names or
 * object bodies.
 */
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const ENV_FILE = "C:/NaijaDeals-Staging/env/staging.env";

function loadStagingEnvironment() {
  const values = {};
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index > 0) values[line.slice(0, index)] = line.slice(index + 1).trim();
  }
  const required = ["S3_ENDPOINT", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_BUCKET", "S3_PRIVATE_BUCKET", "S3_PUBLIC_BASE_URL"];
  const missing = required.filter((key) => !values[key]);
  if (missing.length) throw new Error(`staging storage configuration is incomplete: ${missing.join(", ")}`);
  return values;
}

async function readBody(output) {
  if (!output?.Body) return null;
  return Buffer.from(await output.Body.transformToByteArray());
}

async function main() {
  const env = loadStagingEnvironment();
  const client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE !== "false",
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
  });
  const stamp = `${Date.now()}-${randomBytes(4).toString("hex")}`;
  const publicKey = `staging/rotation-probe/public-${stamp}.txt`;
  const privateKey = `staging/rotation-probe/private-${stamp}.txt`;
  const body = Buffer.from(`staging R2 rotation probe ${new Date().toISOString()}\n`);
  const result = {
    s3_put_public: false,
    s3_put_private: false,
    s3_get_public: false,
    s3_get_private: false,
    public_url_ok: false,
    private_public_url_blocked: false,
    cleanup_public: false,
    cleanup_private: false
  };
  const publicUrl = `${env.S3_PUBLIC_BASE_URL.replace(/\/$/, "")}/${publicKey}`;
  const privatePublicUrl = `${env.S3_PUBLIC_BASE_URL.replace(/\/$/, "")}/${privateKey}`;
  try {
    await client.send(new PutObjectCommand({ Bucket: env.S3_PUBLIC_BUCKET, Key: publicKey, Body: body, ContentType: "text/plain" }));
    result.s3_put_public = true;
    await client.send(new PutObjectCommand({ Bucket: env.S3_PRIVATE_BUCKET, Key: privateKey, Body: body, ContentType: "text/plain" }));
    result.s3_put_private = true;

    const publicObject = await client.send(new GetObjectCommand({ Bucket: env.S3_PUBLIC_BUCKET, Key: publicKey }));
    result.s3_get_public = (await readBody(publicObject))?.equals(body) === true;
    const privateObject = await client.send(new GetObjectCommand({ Bucket: env.S3_PRIVATE_BUCKET, Key: privateKey }));
    result.s3_get_private = (await readBody(privateObject))?.equals(body) === true;

    const publicResponse = await fetch(publicUrl, { signal: AbortSignal.timeout(15000) });
    result.public_url_ok = publicResponse.status === 200;
    const privateResponse = await fetch(privatePublicUrl, { signal: AbortSignal.timeout(15000) });
    // The public base URL is bound to the public bucket. A private-only key
    // must not be served from it.
    result.private_public_url_blocked = !(
      privateResponse.status === 200 && (await privateResponse.text()).includes("rotation probe")
    );
  } finally {
    for (const [bucket, key, field] of [
      [env.S3_PUBLIC_BUCKET, publicKey, "cleanup_public"],
      [env.S3_PRIVATE_BUCKET, privateKey, "cleanup_private"]
    ]) {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        result[field] = true;
      } catch {
        // cleanup failure is reported in the result, never silently claimed
      }
    }
  }
  console.log(JSON.stringify({ ok: Object.values(result).every(Boolean), ...result }, null, 2));
  if (!Object.values(result).every(Boolean)) process.exitCode = 1;
  await client.destroy();
}

main().catch((error) => {
  console.error(`R2_PROBE_FAILED: ${error instanceof Error ? error.message.slice(0, 300) : "unknown error"}`);
  process.exitCode = 1;
});
