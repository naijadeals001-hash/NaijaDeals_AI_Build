#!/usr/bin/env node
/**
 * Applies the approved tester allowlist to the staging Access application.
 *
 * Preconditions: the Cloudflare zone must be ACTIVE (nameserver migration
 * approved and propagated). While the zone is pending Cloudflare refuses the
 * application with `domain does not belong to zone`.
 *
 * The only policy created is a single Allow containing exactly the addresses
 * in the protected allowlist. No domain wildcard, Everyone, bypass or service
 * token rule is created.
 */
import fs from "node:fs";

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
if (!Array.isArray(emails) || emails.length !== 3 || emails.some((email) => !email.endsWith("@naijadeals.com"))) {
  console.error("allowlist must contain exactly three approved addresses");
  process.exit(2);
}
const list = await (await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/access/apps`, { headers })).json();
let app = (list.result ?? []).find((row) => row.domain === "staging-remote.naijadeals.com");
if (!app) {
  const created = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/access/apps`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "NaijaDeals Staging Remote",
      domain: "staging-remote.naijadeals.com",
      type: "self_hosted",
      session_duration: "8h",
      app_launcher_visible: false,
      auto_redirect_to_identity: true,
      http_only_cookie_attribute: true,
      same_site_cookie_attribute: "lax",
      skip_interstitial: false
    })
  });
  const body = await created.json();
  if (!body.success) {
    console.error(`app_create_failed: ${created.status} ${(body.errors ?? []).map((e) => `${e.code}:${e.message}`).join("|")}`);
    process.exit(1);
  }
  app = body.result;
  const policy = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/access/apps/${app.id}/policies`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "Approved staging testers",
      decision: "allow",
      include: [{ email: { email: emails } }]
    })
  });
  const policyBody = await policy.json();
  if (!policyBody.success) {
    await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/access/apps/${app.id}`, { method: "DELETE", headers });
    console.error(`policy_create_failed: ${policy.status} ${(policyBody.errors ?? []).map((e) => `${e.code}:${e.message}`).join("|")}`);
    process.exit(1);
  }
}
const policies = await (await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/access/apps/${app.id}/policies`, { headers })).json();
const allow = (policies.result ?? []).filter((row) => row.decision === "allow");
const configured = allow.flatMap((row) => row.include ?? []).flatMap((rule) => rule.email?.email ?? []);
if (allow.length !== 1 || configured.length !== 3 || configured.sort().join(",") !== [...emails].sort().join(",")) {
  console.error("existing_access_policy_mismatch");
  process.exit(1);
}
const text = fs.readFileSync(ENV, "utf8");
const updated = /^CLOUDFLARE_ACCESS_APP_ID=/m.test(text)
  ? text.replace(/^CLOUDFLARE_ACCESS_APP_ID=.*$/m, `CLOUDFLARE_ACCESS_APP_ID=${app.id}`)
  : text.trimEnd() + `\nCLOUDFLARE_ACCESS_APP_ID=${app.id}\n`;
fs.writeFileSync(ENV, updated, "utf8");
console.log(JSON.stringify({ ok: true, app_id_present: true, allow_policies: allow.length, allowed_emails: configured.length }));
