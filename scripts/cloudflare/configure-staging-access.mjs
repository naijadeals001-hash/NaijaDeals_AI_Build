#!/usr/bin/env node
/**
 * Applies the approved tester allowlist to the staging Access application.
 *
 * Preconditions: the Cloudflare zone must be ACTIVE, otherwise Cloudflare
 * refuses the self-hosted application. The script ensures the One-time PIN
 * identity provider exists, binds it to the app, and guarantees exactly one
 * Allow policy with the three approved addresses. It never creates a domain
 * wildcard, Everyone, bypass or service-token rule.
 */
import fs from "node:fs";
import { createHash } from "node:crypto";

const ENV = "C:/NaijaDeals-Automation/config/cloudflare.env";
const ALLOWLIST = "C:/NaijaDeals-Staging/secrets/cloudflare-access-allowlist.json";
const env = {};
for (const line of fs.readFileSync(ENV, "utf8").split(/\r?\n/)) {
  if (!line || line.trim().startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i > 0) env[line.slice(0, i)] = line.slice(i + 1);
}
const token = env.CLOUDFLARE_STAGING_API_TOKEN;
const accountId = env.CLOUDFLARE_ACCOUNT_ID;
const zoneId = env.CLOUDFLARE_ZONE_ID;
if (!token || !accountId || !zoneId) {
  console.error("cloudflare config incomplete");
  process.exit(2);
}
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const zoneRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}`, { headers });
const zone = await zoneRes.json();
if (!zone.success || zone.result?.status !== "active") {
  console.error(`zone_not_active: ${zone.result?.status ?? "unknown"}`);
  process.exit(2);
}
const allowlist = JSON.parse(fs.readFileSync(ALLOWLIST, "utf8"));
const emails = allowlist?.policy?.include?.[0]?.email?.email;
if (!Array.isArray(emails) || emails.length !== 3 || emails.some((email) => typeof email !== "string" || !email.endsWith("@naijadeals.com"))) {
  console.error("allowlist must contain exactly three approved addresses");
  process.exit(2);
}
const approved = new Set(emails.map((email) => email.trim().toLowerCase()));
const approvedHash = fs.readFileSync(new URL("./approved-testers.sha256", import.meta.url), "utf8").trim();
const actualHash = createHash("sha256").update([...approved].sort().join("\n")).digest("hex");
if (approved.size !== 3 || actualHash !== approvedHash) {
  console.error("allowlist does not match the pinned approved-tester hash");
  process.exit(2);
}

function exactAllowPolicy(policies) {
  if (!Array.isArray(policies) || policies.length !== 1) return false;
  const policy = policies[0];
  if (!policy || policy.decision !== "allow" || !Array.isArray(policy.include)) return false;
  if (policy.include.length !== approved.size) return false;
  const seen = new Set();
  for (const rule of policy.include) {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) return false;
    const keys = Object.keys(rule);
    if (keys.length !== 1 || keys[0] !== "email") return false;
    const value = rule.email;
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    if (typeof value.email !== "string") return false;
    const email = value.email.trim().toLowerCase();
    if (!approved.has(email) || seen.has(email)) return false;
    seen.add(email);
  }
  return seen.size === approved.size;
}

// One-time PIN is the login method for the approved tester mailboxes.
const idpList = await (await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/access/identity_providers`, { headers })).json();
let idp = (idpList.result ?? []).find((row) => row.type === "onetimepin");
if (!idp) {
  const created = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/access/identity_providers`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "One-time PIN", type: "onetimepin", config: {} })
  });
  const body = await created.json();
  if (!body.success) {
    console.error(`idp_create_failed: ${created.status} ${(body.errors ?? []).map((e) => `${e.code}:${e.message}`).join("|")}`);
    process.exit(1);
  }
  idp = body.result;
}

const appBody = {
  name: "NaijaDeals Staging Remote",
  domain: "staging-remote.naijadeals.com",
  type: "self_hosted",
  session_duration: "8h",
  app_launcher_visible: false,
  auto_redirect_to_identity: true,
  allowed_idps: [idp.id],
  http_only_cookie_attribute: true,
  same_site_cookie_attribute: "lax",
  skip_interstitial: false
};
const list = await (await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/access/apps`, { headers })).json();
let app = (list.result ?? []).find((row) => row.domain === "staging-remote.naijadeals.com");
if (!app) {
  const created = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/access/apps`, {
    method: "POST",
    headers,
    body: JSON.stringify(appBody)
  });
  const body = await created.json();
  if (!body.success) {
    console.error(`app_create_failed: ${created.status} ${(body.errors ?? []).map((e) => `${e.code}:${e.message}`).join("|")}`);
    process.exit(1);
  }
  app = body.result;
} else {
  const updated = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/access/apps/${app.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(appBody)
  });
  const body = await updated.json();
  if (!body.success) {
    console.error(`app_update_failed: ${updated.status} ${(body.errors ?? []).map((e) => `${e.code}:${e.message}`).join("|")}`);
    process.exit(1);
  }
  app = body.result;
}

const policies = await (await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/access/apps/${app.id}/policies`, { headers })).json();
if (!(policies.result ?? []).some((row) => row.decision === "allow")) {
  const created = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/access/apps/${app.id}/policies`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "Approved staging testers",
      decision: "allow",
      include: emails.map((email) => ({ email: { email } }))
    })
  });
  const body = await created.json();
  if (!body.success) {
    console.error(`policy_create_failed: ${created.status} ${(body.errors ?? []).map((e) => `${e.code}:${e.message}`).join("|")}`);
    process.exit(1);
  }
}
const finalPolicies = await (await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/access/apps/${app.id}/policies`, { headers })).json();
if (!exactAllowPolicy(finalPolicies.result)) {
  console.error("existing_access_policy_mismatch");
  process.exit(1);
}
const text = fs.readFileSync(ENV, "utf8");
const updated = /^CLOUDFLARE_ACCESS_APP_ID=/m.test(text)
  ? text.replace(/^CLOUDFLARE_ACCESS_APP_ID=.*$/m, `CLOUDFLARE_ACCESS_APP_ID=${app.id}`)
  : text.trimEnd() + `\nCLOUDFLARE_ACCESS_APP_ID=${app.id}\n`;
fs.writeFileSync(ENV, updated, "utf8");
console.log(JSON.stringify({ ok: true, app_id_present: true, otp_idp: true, allow_policies: 1, allowed_emails: approved.size }));
