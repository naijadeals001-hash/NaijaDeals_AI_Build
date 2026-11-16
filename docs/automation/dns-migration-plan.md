# naijadeals.com DNS migration plan (approval required)

Status: **PREPARED; nameservers NOT changed.** Hostinger remains authoritative.
Do not set the Cloudflare nameservers at the registrar until the owner approves
this plan.

## Current authoritative state

- Registrar/DNS: Hostinger; NS `athena.dns-parking.com`, `apollo.dns-parking.com`.
- Zone export: `C:\NaijaDeals-Staging\backups\hostinger-naijadeals-zone-2026-11-16.txt`
  (exported 2026-11-16 11:12 UTC).
- Cloudflare zone: `naijadeals.com`, Free, **pending**; assigned NS
  `armando.ns.cloudflare.com`, `nucum.ns.cloudflare.com`.
- Cloudflare Access organization enabled (`naijadeals.cloudflareaccess.com`).
- Named tunnel `naijadeals-staging-remote` created **inactive**; ingress only
  `staging-remote.naijadeals.com -> http://127.0.0.1:3200` plus a 404 catch-all.
- `staging-remote.naijadeals.com` in the pending zone is a proxied CNAME to the
  tunnel. No Access application exists yet because Cloudflare refuses it while
  the zone is pending (`domain does not belong to zone`).
- The Hostinger `staging-remote` A record still points at `187.127.252.23`; no
  public traffic has moved.

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

## Migration steps (after approval)

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
- **Approval required before step 2.** Approve changing the nameservers, or
  reject and keep Hostinger DNS.
