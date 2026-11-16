# Staging tester mailbox isolation — assessment and owner handoff

Status: **read-only assessment, 2026-11-16** (host clock `2026-11-16 17:53 EST`,
`2026-11-16 22:53 UTC`). No mail routing, mailbox, DNS,
Cloudflare, tunnel or account setting was changed. No mailbox was created, no
password was reset, no email was sent, and no secret, cookie or signed link is
recorded here.

This document answers one question: can the three approved staging testers be
shown to hold **their own** mailbox, so that the Cloudflare Access email rule
authenticates a person rather than a shared inbox? It records what is verified,
what is only asserted by project documentation, what is **BLOCKED**, and the
exact actions the owner must take.

Companion documents: [`tester-guide.md`](./tester-guide.md),
[`tester-journey-matrix.md`](./tester-journey-matrix.md),
[`../automation/dns-migration-plan.md`](../automation/dns-migration-plan.md),
[`../../scripts/cloudflare/README.md`](../../scripts/cloudflare/README.md).

---

## 0. Bottom line

1. **Mail for the domain is hosted at Hostinger**, not Cloudflare Email Routing
   (§3). Only the three named addresses matter for Access.
2. **The three addresses are not confirmed as separate mailboxes.** Project
   documentation asserts they are aliases delivering to the coordinator's shared
   office mailbox. Provider-side state (alias vs. mailbox vs. catch-all) could
   **not** be read with any authorized local tool and is **BLOCKED** (§5, §10).
3. **Because of that, Cloudflare Access currently cannot distinguish the three
   testers.** A one-time PIN sent to `tester01@`, `tester02@` or `tester03@` lands
   in one inbox, so "signed in as tester02" proves only that someone could read
   that shared inbox — not that tester02 did (§6).
4. **Give each address its own inbox; keep the Access policy byte-identical.**
   The exact-email allow policy (one Allow policy, exactly three email rules,
   One-time PIN only, no domain-wide rule) is correct and should **not** be
   widened or replaced with a wildcard (§7). Individual mailboxes make the
   existing policy meaningful without any Cloudflare change.
5. **The NaijaDeals app login must stay per-account.** It already is: three
   distinct `User` rows with separate scrypt-hashed passwords, and the app
   trusts no Cloudflare identity header. Do not introduce a shared app login
   and do not switch app auth to Access (§6, §7).

---

## 1. Scope, method, and what was deliberately not used

| Item | Value |
| --- | --- |
| Repository | `C:\Users\User\Documents\naijadeals.com` |
| Branch / HEAD at assessment | `naijashop-marketplace` / `628ff76` |
| Served staging build under test | `ygTpeinzqY0L2X5fgwNUL` on `http://127.0.0.1:3200` |
| Staging database | `naijadeals_staging` (TEST classification) on `127.0.0.1:55432` |
| Protected local staging root | `C:\NaijaDeals-Staging` (NTFS) |
| Cloudflare config | `C:\NaijaDeals-Automation\config\cloudflare.env` |

**Used (all read-only):**

- Project documentation and the Git-tracked scripts named in each section.
- The protected local configuration **by structure only** — file names, JSON
  keys, array lengths, variable names, file sizes, ACLs. No value was printed.
- Public DNS through resolver `1.1.1.1` (`nslookup -type=MX|TXT|CNAME|A`).
- Cloudflare API **read** calls: zone record list, Access application list,
  Access policy list, identity-provider list. The configured token is not
  permitted to read email routing or Access logs (both returned HTTP 403).
- One read-only `SELECT` against the staging database, returning tester email
  local-parts and role names only.
- Public product documentation for Cloudflare One-time PIN and Hostinger email
  administration (behaviour reference only; see §5 and §11).

**Not used, on purpose:**

- Hostinger hPanel, Hostinger API or webmail: no credential is configured on
  this host (`.env` and the automation config contain no Hostinger entry), and
  logging into the mailbox is outside this assessment.
- SMTP `RCPT`/`VRFY` probing or any message send: that is an outbound mail
  action and is prohibited for this task. It also would not reliably
  distinguish a Hostinger alias from a mailbox, because the provider accepts
  then bounces.
- The testers' real inboxes. Nothing was sent to them.

---

## 2. Verified environment identity

- `git rev-parse --abbrev-ref HEAD` → `naijashop-marketplace`;
  `git rev-parse HEAD` → `628ff76…`. Working tree carries unrelated
  pre-existing changes (for example `scripts/optimize-photography.mjs`) that
  this assessment did not touch.
- Staging app answers on `127.0.0.1:3200` (`HTTP 200`); the database it uses is
  `naijadeals_staging` as role `nd_staging` (confirmed by
  `select current_database(), current_user`).
- `C:\NaijaDeals-Staging\app\.next\BUILD_ID` reads `ygTpeinzqY0L2X5fgwNUL`,
  matching the tester guide's acceptance identity.
- `https://staging-remote.naijadeals.com/` returns `302` to the Cloudflare
  Access login when unauthenticated.
- One Cloudflare Access application exists in the account and it is this one
  (`staging-remote.naijadeals.com`); there is no second Access app.

---

## 3. Observed mail facts (public DNS and live zone)

Query results from `1.1.1.1` and the zone record list:

| Record | Observed |
| --- | --- |
| `MX @` | `5 mx1.hostinger.com`, `10 mx2.hostinger.com` |
| `TXT @` | `v=spf1 include:_spf.mail.hostinger.com ~all` |
| `TXT _dmarc` | `v=DMARC1; p=none` |
| `CNAME hostingermail-a._domainkey` | `hostingermail-a.dkim.mail.hostinger.com` (resolves) |
| `CNAME hostingermail-b._domainkey` | resolves |
| `CNAME hostingermail-c._domainkey` | resolves |
| `CNAME autoconfig` / `autodiscover` | `*.mail.hostinger.com` |
| Zone totals | 17 records: 6 A, 7 CNAME, 2 MX, 2 TXT; `staging-remote` is the only proxied record |
| Per-tester DNS | none — `tester01/02/03.naijadeals.com` are NXDOMAIN |

**Conclusions that follow from DNS alone:**

- Inbound mail for the domain is delivered to **Hostinger**. There is no
  Cloudflare Email Routing MX pair, so Cloudflare is not the inbound mail path.
- Mailbox, alias, forwarder and catch-all assignment is **provider-side state**
  held at Hostinger. No DNS record distinguishes an alias from a mailbox, so
  public DNS cannot answer §5.
- The three testers have **no** DNS-level identity of their own (no subdomain,
  no dedicated record). Their identity is only the email local-part in the
  Access policy.

---

## 4. Testers as application and Access identities (structure only)

**Staging database (read-only query).** Exactly three `User` rows match the
tester addresses:

| Account | Roles in the app |
| --- | --- |
| `tester01@…` | `customer`, `staging_test_manager` |
| `tester02@…` | `customer` |
| `tester03@…` | `customer` |

Three rows, three role sets, each created through the real registration
endpoint (`scripts/staging/provision-testers.mjs`). No fourth tester row exists.

**Protected activation file** `C:\NaijaDeals-Staging\secrets\tester-activation.json`
(2,384 bytes; ACL: single local account `DESKTOP-AQQLCB2\User`, inherited to the
file — no `Everyone`/`Users` entry). Structure only:

- Top-level keys: `generatedAt`, `accounts`.
- `accounts`: **5** entries. Keys: `displayName`, `email`,
  `existingAccount`, `note`, `password`, `purpose`, `roles`; the two persona
  entries add `ownerTester`.
- Entries 1–3 are the tester accounts in the `naijadeals.com` domain; a password
  value is present for each (≥12 characters); roles as in the table above.
- Entries 4–5 are the seller and driver personas in the
  `staging.naijadeals.test` domain. That domain is non-deliverable by design and
  must never receive mail (`tester-guide.md` §3.5).

**Protected secrets file** `staging-secrets.json` (1,560 bytes): 8 keys
(`pgSuperPassword`, `appDbPassword`, `n8nEncryptionKey`, `n8nBasicPassword`,
`backupEncryptionKey`, `pgBackupPassword`, `approvedTesters`, `stagingPersonas`).
`approvedTesters` has **3** entries (`email`, `displayName`, `stagingRole`,
`purpose`); `stagingPersonas` has **2** entries (`email`, `displayName`,
`ownerTester`, `role`). No mailbox password exists in either file — the app
passwords were generated locally and are stored only as scrypt hashes in the
database plus this handoff file.

**Access allowlist** `C:\NaijaDeals-Staging\secrets\cloudflare-access-allowlist.json`
(531 bytes): keys `generatedAt`, `hostname`, `note`, `policy`; `policy` has
`name`, `decision` and `include`; `include` has one rule object whose `email`
rule contains exactly **3** addresses. Recomputed canonical SHA-256 (trim,
lowercase, ordinal sort, newline join) **matches** the pinned
`scripts/cloudflare/approved-testers.sha256`.

**Live Cloudflare Access state (read-only API):**

| Check | Result |
| --- | --- |
| Applications in account | 1 (only `staging-remote.naijadeals.com`) |
| App type / session | `self_hosted` / `8h`, `auto_redirect_to_identity: true` |
| Policies | 1 — decision `allow` |
| Include rules | 3, each with the single key `email`, exactly the three tester addresses |
| Exclude / require rules | 0 / 0 |
| Identity providers | 1 — `onetimepin` only, bound to the app |

**Staging env file** `C:\NaijaDeals-Staging\env\staging.env` (1,674 bytes):
**35** `KEY=` names, including `APP_BASE_URL`, `DATABASE_URL`,
`NEXT_PUBLIC_APP_URL`, `NODE_ENV`, `ENABLE_TEST_PAYMENTS`, `SUPPORT_TRUST_PROXY`,
`S3_*`, `B2_*`, `BACKUP_*`, provider keys and `VALKEY_URL`. No mail-host or
mailbox credential name appears, which is why provider state is **BLOCKED**.

**Unreferenced artefact to review (not read):**
`C:\NaijaDeals-Staging\secrets\.access-code.txt` is a 6-byte file in the
secrets directory that no tracked script references. It looks like a captured
code; treat it as sensitive, confirm nothing depends on it, and remove it at the
owner's discretion (see §8.H).

---

## 5. The current arrangement for the three addresses: verified, asserted, blocked

**Asserted by project documentation** (`docs/staging/tester-guide.md` §2):

> "Cloudflare sends a one-time login email to that address (the tester aliases
> deliver to the shared office mailbox used by the test coordinator)."
> "The three aliases currently deliver to the coordinator's shared office
> mailbox. Possession of that mailbox satisfies the Access email step for any
> alias; the NaijaDeals app login remains per-account."

The same alias pattern is documented for the public contact addresses
(`docs/architecture.md` around "All thirteen addresses are delivery aliases of
the main mailbox `office@naijadeals.com`" and `docs/decisions.md`,
"2026-11-15 — One typed contact directory, aliases are not identities"). No
commit in the repository records creating a mailbox for any tester; the
complementary handoff note says "No DNS, mailbox forwarding or provider account
was changed" (`docs/handoff.md`, transactional-email section).

**What is therefore established:** every documented statement says the three
addresses are **aliases of one shared mailbox**, not individual mailboxes. The
runbook's own wording acknowledges that possession of that one mailbox
satisfies Access for any of the three.

**What is NOT established — three arrangements remain indistinguishable
without hPanel access:**

| Candidate arrangement | Behaviour seen by the tester | Status |
| --- | --- | --- |
| (a) Alias attached to the `office@` mailbox | All three addresses share one inbox and storage | Documented; unverified at provider |
| (b) Forwarder from each address to `office@` | Same single inbox (with or without a saved copy) | Possible; unverified |
| (c) Catch-all on the `office@` mailbox | Any non-existent `@naijadeals.com` address lands in `office@` | Possible; unverified, and broader than (a)/(b) |

All three produce the same user-visible result and the same DNS. Only the
Hostinger email panel shows which one is in force. That is **BLOCKED** (§10).

---

## 6. The identity ambiguity, stated precisely

Two independent authentication steps exist, and only one of them is per person.

1. **Cloudflare Access — proves mailbox possession, not identity.**
   With the `onetimepin` provider, Cloudflare emails a single-use code to the
   address typed on the Access login page; the sign-in succeeds only if the
   person can read mail sent to that address (Cloudflare One-time PIN
   documentation). Access therefore answers: *can this browser's operator read
   `tester0N@`?* It answers nothing about **who** that is, and it does not
   consult any group or directory membership.
   With one shared inbox behind three aliases, the answer is "yes" for all
   three addresses for anyone with the shared mailbox — including the
   coordinator, who is also the person who hands out the app credentials.
   Access log entries (owner-visible in the dashboard, not readable with this
   token) would attribute a session to an address, not to a person.

2. **NaijaDeals app login — proves knowledge of one account's password.**
   `POST /api/auth/login` looks the account up by lowercased email and verifies
   an scrypt hash (`app/api/auth/login/route.ts`, `lib/auth/password.ts`); the
   `User.email` column is unique (`prisma/schema.prisma`). There is **no** email
   verification at registration, **no** password-reset flow, and **no** code in
   the app that trusts `Cf-Access-*` headers or an Access JWT (grep across
   `app/`, `lib/` and `middleware.ts` returns nothing). The app session is
   therefore fully independent of Access, and it is the only per-person
   control in the chain.

**Net effect today:** the chain is `shared inbox → any of three addresses →
one person's app password`. The Access layer contributes no per-tester
assurance, so:
- a tester cannot be shown to have received their own code;
- a code forwarded by the coordinator is indistinguishable from one the tester
  received;
- Access attribution is address-level, not person-level;
- the app remains the real boundary, and it is single-factor with no
  verification that the address belongs to the account holder.

**What isolation fixes:** it makes step 1 per-person, so the existing exact-email
rule becomes a genuine possession test and Access records become meaningful.
It does **not** replace step 2, and it does not make the app login
multi-factor (see §11).

---

## 7. Should Access remain exactly the three approved email rules?

**Yes. Do not change the policy; change the mailboxes behind it.**

Recommended policy shape (already live — verify, do not redesign):

- One self-hosted app for `staging-remote.naijadeals.com`.
- One `Allow` policy, exactly three `include` rules of type `email`, one per
  approved address, no duplicates.
- Zero `exclude`, zero `require`, no `Everyone`, no domain/`email_domain` rule,
  no `bypass`, no service token.
- One-time PIN as the only identity provider for this app.
- The pinned allowlist hash (`scripts/cloudflare/approved-testers.sha256`) must
  keep matching `cloudflare-access-allowlist.json`.

**Why individual mailboxes preserve the exact-email policy.** The allowlist
matches the literal addresses. Isolating delivery changes *who can read* those
addresses, not *which* addresses are approved, so:
- `cloudflare-access-allowlist.json` does not change;
- `approved-testers.sha256` does not change and still matches;
- `configure-staging-access.mjs` does not need to run;
- `start-tunnel.ps1` / `status-tunnel.ps1` assertions continue to pass;
- **no wildcard, no domain-wide rule and no second app become necessary** —
  a domain rule would be strictly worse, because it would admit any future
  address on the domain and destroy the pinned allowlist guarantee.

**If the owner ever renames the addresses** (not recommended): the allowlist,
the pinned hash, the guide/matrix and the `User.email` rows would all have to
change together, in a reviewed commit, before Access is re-applied. Renaming
also breaks the documented tester identities and the activation-file mapping;
keeping `tester01@`/`tester02@`/`tester03@` and giving each its own inbox is the
small, reversible change.

**No shared application login.** The app must keep three separate accounts with
three separate passwords (it already does). Do not:
- create a single shared tester account;
- accept an Access identity (header/JWT) as an app session;
- disable the app login because "Access already authenticated".

Access is an outer gate for the external hostname only. The local URL
`http://localhost:3200` has no Access gate at all, so the app login is the only
control there.

---

## 8. Exact owner handoff

Nothing below has been executed. Every step is an owner action in the Hostinger
and Cloudflare dashboards. No step requires (or permits) printing a password.

### A. Choose the arrangement

| Option | What it gives | Trade-offs |
| --- | --- | --- |
| **A1 — three real mailboxes at the exact addresses** (recommended) | True per-person possession; own credential, own storage; Access policy unchanged | Needs three mailbox slots on the current Hostinger email plan; may require a paid seat — **check the plan and do not purchase without authorization** |
| A2 — three forwarders to each tester's own personal inbox | Per-person possession without new mailboxes; Access policy unchanged | Depends on an external mailbox; forwarded codes sit in a personal inbox; destination may need confirmation; coordinator can still re-point the forwarder |
| A3 — leave aliases on `office@` | No change | Does **not** solve the ambiguity; Access remains non-attributable. Not recommended |

If A1 is not possible without spending money, A2 still satisfies the
exact-email policy; record the decision and the reason in the handoff.

### B. Capture the current state before changing anything

1. In hPanel → Emails for `naijadeals.com`, record which of alias / forwarder /
   catch-all currently covers `tester01`, `tester02`, `tester03`. Screenshot is
   fine **only** if it shows no password field; otherwise transcribe the settings.
2. Confirm whether a catch-all is enabled and which mailbox it targets.
3. Confirm the current mailbox count and the plan's mailbox allowance (this is
   the cost gate for A1).
4. Confirm the `office@` mailbox still holds its messages; export or IMAP-copy
   the mailbox if the tooling offers it, before any alias/forwarder edit.
5. Record the pre-change DNS answers for MX / SPF / DKIM / DMARC (§3) so the
   after-check is a comparison, not a memory.

### C. Create the isolation (A1 path)

1. In hPanel → Emails → Mailboxes, create `tester01`, `tester02`, `tester03` as
   **separate mailboxes** on `naijadeals.com` with three distinct strong
   passwords. Keep the local-parts exactly `tester01`/`tester02`/`tester03`.
2. If an address is currently an **alias** (shares the `office@` mailbox), the
   alias must be removed before the mailbox can take that address: remove only
   the tester aliases — never the other public contact aliases.
3. If an address is currently a **forwarder**, remove or re-point only that
   forwarder.
4. If a **catch-all** is delivering these addresses, creating real mailboxes
   takes precedence over catch-all; leave the catch-all itself unchanged unless
   the owner decides it is a separate risk (§11).
5. Do the change in a low-traffic window. Inbound mail to an address with no
   route can bounce, so create/verify one address at a time.
6. Immediately send one ordinary test message **from the owner's own account**
   to each new mailbox and confirm it arrives in that mailbox only.

For A2, replace step 1 with forwarders whose destination is that tester's own
private inbox, and confirm each destination's verification email.

### D. What must be preserved

- The `office@` mailbox, its full message history and attachments. Do not
  delete, migrate, rename or "clean up" it.
- The other public contact aliases (`hello@`, `support@`, etc.) and their
  delivery to `office@`; the directory in `lib/data/contact-directory.ts` and
  `docs/decisions.md` describes them as contact addresses, not identities.
- All three tester **application** accounts, their roles
  (`staging_test_manager` for `tester01`, `customer` for the others) and their
  existing passwords. No account reset is needed for mailbox isolation.
- The two `.test` persona accounts — they are non-deliverable and must not get
  mailboxes.
- The activation file and the app's scrypt password hashes.
- The Cloudflare Access app, policy, OTP provider and tunnel; the pinned
  allowlist hash.
- The `staging-remote` tunnel ingress (`127.0.0.1:3200` plus 404 catch-all) and
  the loopback-only status of n8n `5680` and PostgreSQL `55432`.

### E. Routing that must not change

- MX: `mx1.hostinger.com` (5), `mx2.hostinger.com` (10). Do not point MX at
  Cloudflare, a relay, or a new provider.
- SPF `include:_spf.mail.hostinger.com`, DMARC `p=none`, all three
  `hostingermail-*._domainkey` CNAMEs, `autodiscover`/`autoconfig`.
- Nameservers `armando.ns.cloudflare.com` / `nucum.ns.cloudflare.com`; the
  other 16 zone records; `staging-remote` as the only proxied record.
- The Access application contents, not just its shape: it must stay exactly
  three `email` include rules with no exclude/require and OTP only.

Mailbox creation is an **email-account** change, not a DNS change. If any step
appears to need a DNS edit, stop: the approach is wrong.

### F. Hand each tester only their own credential, out of band

- Source of truth is `C:\NaijaDeals-Staging\secrets\tester-activation.json`.
  Hand over **one entry per person**; never the file, a copy, a screenshot or a
  shared-document link.
- Use a channel that reaches only that tester: in person, a sealed note, or a
  password-manager one-time share addressed to that person. Do **not** email it
  to the shared `office@` inbox, do not post it in a group chat, and do not put
  it in a support ticket.
- Never send an app password by email, and never send it to a tester address
  that is still aliased to the shared mailbox.
- Mailbox passwords (A1) are a **second** credential and must be handed over by
  the same per-person rule. Do not reuse the app password as the mailbox
  password.
- The app has **no** password-reset flow and no outbound email, so a lost app
  password can only be reset by the owner. Do not tell testers to "reset it
  yourself".
- If a credential is believed exposed: stop, rotate that one account only, and
  report the exposure without repeating the value.

### G. Tell the testers what changes

- Their Access code now arrives **only** in their own inbox.
- Never forward an Access code or sign-in link; never share a mailbox password.
- If a code for a different tester's address arrives, do not use it — report it
  privately.
- The app login is still separate from Access; sign in with their own account.
- Do not change email or password in `/account` (`tester-guide.md` §3.4).

### H. Do not

- Do not add a domain-wide, `Everyone`, bypass or service-token Access rule.
- Do not create mailboxes for the `.test` persona addresses.
- Do not delete or repurpose `office@`, and do not convert public contact
  aliases.
- Do not create a shared application login or wire Access identity into the app.
- Do not buy mailbox seats or an email plan without explicit authorization.
- Do not read, copy or screenshot `.access-code.txt`; decide whether it is a
  stale code and remove it if nothing depends on it.

---

## 9. Verification checklist

Run after the owner's change; record the command, the observed result and the
date. Nothing here needs a secret.

**Mail routing unchanged**

- [ ] `nslookup -type=MX naijadeals.com 1.1.1.1` → still `mx1`/`mx2.hostinger.com`.
- [ ] SPF, `_dmarc` and all three DKIM CNAMEs return the same values as §3.
- [ ] Cloudflare zone still lists 17 records, `staging-remote` the only proxied one.
- [ ] A message to `hello@`/`support@` still arrives in `office@`.
- [ ] A sample of pre-change `office@` messages is still present (same count/date range).
- [ ] A message to `tester01@` arrives **only** in tester01's mailbox and no
      longer in `office@` (this is the intended change — confirm it explicitly).

**Access unchanged and still exact**

- [ ] Exactly 1 Access app; 1 `Allow` policy; 3 `include` `email` rules; 0
      `exclude`; 0 `require`; `onetimepin` the only IdP bound.
- [ ] Recomputed canonical hash equals `approved-testers.sha256`.
- [ ] Unauthenticated request to `https://staging-remote.naijadeals.com` still
      redirects to Access.
- [ ] An address that is **not** on the allowlist is refused. Note that
      Cloudflare shows "code sent" even to a blocked address, so confirm that
      **no mail arrives** rather than trusting the message.

**Per-person possession (the point of the change)**

- [ ] `tester01` requests a code and receives it in tester01's inbox only;
      `tester02` and `tester03` inboxes receive nothing for that attempt.
- [ ] Each tester completes Access sign-in from their own browser profile.
- [ ] Owner-visible Access logs (Zero Trust → Logs → Access) show the three
      distinct addresses signing in, one per person, and no unexpected address.
- [ ] No tester can complete Access for another tester's address.

**App login still per-account**

- [ ] `tester01` lands on `/admin`, opens `/admin/support` (200) and is denied
      `/api/admin/payouts` (403).
- [ ] `tester02`/`tester03` land on `/account`; `/admin/support` is denied.
- [ ] Signing in with `tester01@` plus tester02's password fails (401) — three
      separate accounts remain.
- [ ] The local URL `http://localhost:3200` still requires the app login and
      grants nothing extra.

**Hygiene**

- [ ] No password, code or signed link appears in this document, a ticket, a
      screenshot, a log or Git.
- [ ] The activation file remains ACL-restricted to the single local account.
- [ ] Testers confirm in writing that they received only their own credential.

**Rollback** — re-attach the previous alias/forwarder to `office@` (the
configuration captured in §8.B). No DNS, Access or app change is required to
roll back; the Access policy is untouched by isolation.

---

## 10. BLOCKED

1. **Provider-side mail arrangement.** Whether the three addresses are aliases
   of `office@`, forwarders to `office@`, or covered by a catch-all is not
   determinable from DNS, the repository or any configured local tool. No
   Hostinger credential exists on this host (`.env` and
   `C:\NaijaDeals-Automation\config\*` have no Hostinger entry). **Owner: hPanel
   → Emails.**
2. **Cloudflare Email Routing state.** `GET /zones/{zone}/email/routing` and the
   rules endpoints return HTTP 403 with the staging token. DNS already shows
   Hostinger MX, so routing is not authoritative for inbound mail, but a dormant
   Cloudflare Email Routing configuration cannot be ruled out from here.
   **Owner: Cloudflare dashboard → Email → Email Routing (confirm disabled).**
3. **Access audit logs.** `GET /accounts/{id}/access/logs/access_requests`
   returns HTTP 403. Per-address sign-in history is owner-visible only.
4. **Mailbox content and message inventory.** Not read, and reading it was not
   authorized. Preservation checks in §9 are owner actions.
5. **Plan capacity and cost.** Whether three mailboxes require extra seats or a
   paid email plan is unknown; no purchase is authorized.
6. **Any possession test.** Triggering an Access one-time PIN sends email, which
   this task prohibits. The per-person checks in §9 must be executed by the
   owner/testers.
7. **The 6-byte `.access-code.txt`.** Contents not read; purpose unconfirmed;
   no tracked script references it.

---

## 11. Residual risks and notes

- **App login is single-factor and unverified.** Holding a tester's app password
  is sufficient regardless of mailbox. Mailbox isolation strengthens the Access
  gate; it does not make the app account safe against password sharing. A
  second factor or an owner-issued device policy is a separate decision.
- **No outbound email at all.** The only transport is `EmailCaptureTransport`
  (`lib/notifications/transports.ts`), so there is no invite, verification or
  password-reset mail. All credential delivery stays manual, which is why §8.F
  is procedural rather than technical.
- **A catch-all would be wider than three aliases.** If `office@` has catch-all
  enabled, every unallocated address on the domain lands in one inbox — a
  broader exposure than the three tester aliases. Worth confirming during §8.B.
- **Access session is 8 hours** and the code is single-use; a private window
  needs a fresh code. Third-party mail security can consume a link before the
  user does; allowlisting `notify.cloudflare.com` may help (Cloudflare
  documentation).
- **The local URL bypasses Access entirely.** Any test performed on
  `http://127.0.0.1:3200` tests the app login only.
- **The persona addresses are not mailboxes** and must stay that way; they exist
  to keep persona journeys out of the Cloudflare identity set.

---

## 12. Evidence index

| Evidence | Where |
| --- | --- |
| Aliases deliver to shared office mailbox (assertion) | `docs/staging/tester-guide.md` §2 (lines 42–55) |
| Alias policy for public contact addresses | `docs/architecture.md` (~line 165); `docs/decisions.md` ("aliases are not identities") |
| Tester accounts, roles, activation handoff | `docs/handoff.md` lines 46–55; `scripts/staging/provision-testers.mjs` |
| Access app/policy/OTP assertions in code | `scripts/cloudflare/configure-staging-access.mjs` lines 36–70, 72–100, 129–150 |
| Access state and pinned hash | `scripts/cloudflare/README.md` lines 8–12, 48–51, 85–93 |
| DNS inventory and verification | `docs/automation/dns-migration-plan.md` lines 29–49, 120–129 |
| App login is email+password, scrypt, no Access trust | `app/api/auth/login/route.ts`; `lib/auth/password.ts`; `prisma/schema.prisma` (`User`) |
| No outbound email provider | `lib/notifications/transports.ts` (`EmailCaptureTransport`) |
| Cloudflare One-time PIN behaviour | Cloudflare One-time PIN documentation (codes emailed to the address entered; a receiving mailbox is required; proves only ability to read that address) |
| Hostinger alias/forwarder/catch-all semantics | Hostinger email documentation (alias = secondary address of an existing mailbox sharing storage; forwarder = redirect to another address; catch-all = unallocated addresses to one mailbox) — confirm the exact hPanel labels during §8.B |

Commands used, all read-only: `git rev-parse`/`git status`; `nslookup` against
`1.1.1.1`; two Node scripts that read protected files and print keys/lengths
only; Cloudflare API `GET` on zone records, Access apps, policies and IdPs; one
`SELECT` on `naijadeals_staging` returning tester emails and role names.
