# naijadeals.com DNS migration — completed

Status: **COMPLETED on 2026-11-16.** The owner authorised the migration after
the preflight below passed. The registrar nameservers now point at Cloudflare,
the zone is active, and public A/MX/SPF/DKIM/DMARC verification passed. The
pre-migration state and rollback are retained below.

## Pre-migration state (retained for rollback)

- Pre-migration registrar/DNS: Hostinger; NS `athena.dns-parking.com`,
  `apollo.dns-parking.com`.
- Zone export: `C:\NaijaDeals-Staging\backups\hostinger-naijadeals-zone-2026-11-16.txt`
  (exported 2026-11-16 11:12 UTC).
- Before the cutover, the Cloudflare zone `naijadeals.com` was Free and
  **pending**; assigned NS `armando.ns.cloudflare.com`,
  `nucum.ns.cloudflare.com`.
- Cloudflare Access organization was enabled
  (`naijadeals.cloudflareaccess.com`).
- The named tunnel `naijadeals-staging-remote` was created **inactive**; ingress
  was only `staging-remote.naijadeals.com -> http://127.0.0.1:3200` plus a 404
  catch-all.
- Before the cutover, `staging-remote.naijadeals.com` in the pending zone was a
  proxied CNAME to the tunnel. No Access application existed yet because
  Cloudflare refused it while the zone was pending (`domain does not belong to
  zone`).
- Before the cutover, the Hostinger `staging-remote` A record pointed at
  `187.127.252.23`; no public traffic had moved.

## Authoritative DNS inventory (Hostinger export)

| Name | Type | Value | TTL |
| --- | --- | --- | --- |
| @ | A | 187.127.252.23 | 300 |
| @ | MX | 5 mx1.hostinger.com | 14400 |
| @ | MX | 10 mx2.hostinger.com | 14400 |
| @ | TXT | `v=spf1 include:_spf.mail.hostinger.com ~all` | 3600 |
| _dmarc | TXT | `v=DMARC1; p=none` | 3600 |
| admin | A | 76.13.98.62 | 300 |
| api | A | 187.127.252.23 | 300 |
| seller | A | 76.13.98.62 | 300 |
| staging | A | 187.127.252.23 | 300 |
| staging-remote | A | 187.127.252.23 | 3600 |
| ws | A | 187.127.252.23 | 300 |
| www | CNAME | naijadeals.com | 300 |
| autoconfig | CNAME | autoconfig.mail.hostinger.com | 300 |
| autodiscover | CNAME | autodiscover.mail.hostinger.com | 300 |
| hostingermail-a._domainkey | CNAME | hostingermail-a.dkim.mail.hostinger.com | 300 |
| hostingermail-b._domainkey | CNAME | hostingermail-b.dkim.mail.hostinger.com | 300 |
| hostingermail-c._domainkey | CNAME | hostingermail-c.dkim.mail.hostinger.com | 300 |

SOA/NS are provider-managed and are not migrated as ordinary records.

## Cloudflare copy

All existing records are created and DNS-only (no Cloudflare proxy), preserving
current origin/email behavior. `seller` (missed by the automatic scan) was added.
The only proxied record is `staging-remote` -> tunnel. Verified directly against
`armando.ns.cloudflare.com`: apex A, MX, SPF, DMARC, DKIM CNAMEs, seller A and
www CNAME answer with the values above.

## Preflight result (2026-11-16, approved)

- Authoritative export: 17 user records (7 A, 6 CNAME, 2 MX, 2 TXT), excluding SOA/NS.
- Cloudflare copy: 17 records. Diff: only `staging-remote` is intentionally
  changed from A `187.127.252.23` to the proxied tunnel CNAME; all other 16
  records match exactly after normalising TXT quoting/trailing dots.
- DNS-only: every record except `staging-remote` has `proxied=false`.
- DNSSEC: public DS and DNSKEY are absent; Cloudflare DNSSEC is `disabled`.
  No registrar DS removal or replacement is required.
- Nameservers read directly from the current Cloudflare zone:
  `armando.ns.cloudflare.com`, `nucum.ns.cloudflare.com`.
- Hostinger zone export is retained at
  `C:\NaijaDeals-Staging\backups\hostinger-naijadeals-zone-2026-11-16.txt`;
  rollback is restoring `athena/apollo.dns-parking.com`.
- Result: **PASS — nameserver change authorized by owner on 2026-11-16.**

## Migration steps (completed)

1. Confirm the Cloudflare pending zone still answers all records from
   `armando.ns.cloudflare.com` and `nucum.ns.cloudflare.com`.
2. At the registrar (Hostinger Domain Overview -> DNS/Nameservers -> Change
   Nameservers), replace `athena/apollo.dns-parking.com` with
   `armando.ns.cloudflare.com` and `nucum.ns.cloudflare.com`.
3. Wait for propagation. Verify A, CNAME, MX, SPF, DMARC and all three DKIM
   CNAMEs against public resolvers; verify the apex website and seller/admin/api
   origins still resolve to their original IPs.
4. Only after the zone is active, create the Access self-hosted application for
   `staging-remote.naijadeals.com` with a single Allow policy containing exactly
   tester01@, tester02@ and tester03@ (no domain wildcard, no Everyone rule,
   no bypass). **Create and verify this policy before starting the tunnel.**
5. Start `cloudflared` with the protected tunnel token; verify an unapproved
   request is challenged/denied and an approved tester receives the email code
   and can sign in. Keep n8n 5680 and PostgreSQL 55432 private.
6. Verify the staging app login/role checks and the tester journeys.

## Rollback

1. At Hostinger, restore the nameservers to `athena.dns-parking.com` and
   `apollo.dns-parking.com`. The Hostinger zone remains intact; no records were
   deleted from it.
2. Stop the tunnel. Optionally delete the Access application and Cloudflare
   zone after propagation is confirmed.
3. Re-verify apex, email and subdomain records against the exported inventory.
4. No VPS or production application change is part of this plan; the apex and
   subdomain origins remain the existing IPs.

## Risks / approval

- Cloudflare becomes authoritative for the production zone; propagation can
  take up to 24–48 hours under the existing NS TTL.
- All existing records are DNS-only, so Cloudflare proxying does not alter the
  website or email path. Email delivery depends on the preserved MX/SPF/DKIM
  records.
- The only intentional behavior change is `staging-remote` moving from the VPS
  A record to the protected tunnel after Access is configured.
- Approval was granted and the migration was executed. Rollback remains
  available by restoring the Hostinger nameservers; no Hostinger records were
  deleted.

## Execution result (2026-11-16)

- Registrar nameservers changed to `armando.ns.cloudflare.com` and
  `nucum.ns.cloudflare.com`; Cloudflare reports the zone **active**.
- Public resolver checks: apex A `187.127.252.23`, `www` CNAME, MX
  `mx1/mx2.hostinger.com`, SPF, DMARC and all three Hostinger DKIM CNAMEs
  resolve correctly. `staging-remote` resolves to the tunnel.
- Cloudflare Access application exists for `staging-remote.naijadeals.com`
  with one Allow policy containing exactly the three approved tester emails;
  One-time PIN is configured. The named tunnel is healthy with four connections.
- Unauthenticated access is redirected to Cloudflare Access. An approved tester
  completed the email sign-in, signed into the NaijaDeals app, opened the
  support inbox and was denied payout access (403).
- n8n `5680` and PostgreSQL `55432` remain loopback-only; ingress exposes only
  `127.0.0.1:3200`.
- Rollback remains: restore `athena/apollo.dns-parking.com` at the registrar
  and stop the tunnel. The Hostinger zone export is retained.
