# Ecosystem automation matrix (local n8n)

Release channel: **local staging only**. n8n never owns wallet balances,
payment verification, refunds, payouts, inventory reservations, order
transitions or driver dispatch; those stay in NaijaDeals services. Every
notification below is an in-app record; no live email/SMS/customer message is
sent in this environment.

Current identity: source `661cfd7`,
staging build `83_q2cG-YEW1IrYOHq0Qz` on `127.0.0.1:3200`, database
`naijadeals_staging` (TEST classification, 86 migrations), n8n 2.47.7 on
`127.0.0.1:5680`.

| Workflow | Purpose / owner | Trigger and payload | Permissions / dependency | Expected action | Idempotency / retries | Verification | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Local file smoke test | Prove n8n runs and writes to authorized D: output; platform owner | Manual trigger | Local Code node with built-in `fs` only | Write `D:\NaijaDeals-Storage\output\n8n-test.txt` | Manual, single run | CLI success, file sha256 recorded | PASS (local) |
| Authenticated API control | Operate workflows through the supported REST API; platform owner | `X-N8N-API-KEY` against `/api/v1` | Owner API key in the ACL-protected automation config | List/create/update/publish workflows, read executions | API idempotency not applicable | Workflows created, updated, published and read through the API | PASS (local) |
| Backup status probe (n8n) | Prove workflow control writes an operator-visible file | Manual CLI run | API-created workflow, Code node with `fs` | Write the D: status file | Single run | Execution success and file content recorded | PASS (local) |
| Support notifications (`1lU7ERGPS0jAW7V4`) | Support team | Transactional `NotificationIntent` rows; two-minute schedule calls `POST /api/automation/notifications/drain` | Encrypted n8n header credential; no database credential | Staff alert on creation; assignee/queue alert on customer reply; customer alert on staff reply/status | Per-ticket/message/event keys; claim/lease/ack; DEAD visible | 12/12 creation, 20/20 reply, 23/23 HTTP; independent PASS | PASS (local) |
| Commerce lifecycle | Customers/partners | `order.status_changed`, `order.delivered`, `refund.completed`, `payout.completed` enqueued in the business transaction | Same consumer API | One customer/partner notification per committed event | `order.status:<statusEventId>`, `refund.completed:<refundId>`, `payout.paid:<payoutId>` | Static contract PASS; served-build handler delivery PASS; type-check PASS | PASS (implemented flows) |
| Onboarding reminders | Applicants/ops | `POST /api/automation/reminders/scan` on the two-minute operations schedule | Consumer credential | One reminder per applicant per UTC day after 3 days pending | `onboarding.reminder:<kind>:<id>:<date>` | 22/22 operations suite; 22/22 served-build routes | PASS (local) |
| Daily operations report | Unscoped admin/ops/super_admin | Same scan | Consumer credential | One factual count summary per staff per UTC day | `ops.daily_report:<date>:<userId>` | 22/22 operations suite | PASS (local) |
| Backup success/failure/staleness alerts | Operations staff | `POST /api/automation/backup-status` from backup jobs; scan checks 26-hour staleness | Consumer credential; JSON ≤8 KiB | Alert staff; status recorded as `SystemEvent` | `ops.backup.<status>:<runId>:<userId>`, `ops.backup_stale:<date>:<userId>`; advisory lock per run | 22/22 operations suite; real staging backup recorded success | PASS (local) |
| Document expiry alerts | Compliance | Not scheduled | No partner-document model with an expiry field exists | — | — | Blocked by missing feature, not by a missing contract: implementing it requires a document store and retention policy decision | DEFERRED |
| Per-vertical workflows (Eats, Drive, Stay, Gigs, Fresh, Stream) | Vertical owners | Only where implemented | Their business transitions are incomplete or demo-only | — | — | Not claimed; shipments already use durable intents | DEFERRED |
| n8n outage/recovery | Prove core operations are independent | Stop n8n during staging activity | Local process control | Application commits; pending intents drain on restart | Durable rows + dedupe keys | Ticket committed PENDING with 0 notifications while n8n stopped; scheduled drain after restart produced exactly one | PASS (local) |
| Protected external tester access | Remote protected staging | Cloudflare Tunnel + Access | Account-level DNS/Access | Prepared, not published | — | Cloudflare zone `naijadeals.com` pending; all 17 Hostinger records mirrored DNS-only; tunnel inactive with 3200-only ingress; Access org enabled but app refused while pending; Hostinger NS unchanged | BLOCKED (nameserver migration approval) |

## Delivery retry contract (fixed)

The previous engine classified every non-`QUEUED` notification as `skipped`,
and intent handlers treated any skip as success. An intent could therefore
become PROCESSED while its notification was waiting for backoff, held by
another worker, or terminally FAILED.

`deliverNotification` now returns a classified reason: `delivered`,
`suppressed`, `not_due` (with the notification's own `scheduledFor`),
`in_flight`, `terminal` or `missing`. The intent processor maps these to:

- delivered/suppressed → PROCESSED (suppression is intentional and audited);
- not_due/in_flight → PENDING with the notification's retry time or 30 seconds,
  still bounded by `maxAttempts`;
- terminal/missing → DEAD immediately with `lastError`.

The support, order-vendor, commerce and operations handlers all use the same
`deliverIntentNotification` helper. Shipment intents keep their existing
enqueue path. Exact-once delivery is not claimed; idempotent effects are proved
by notification dedupe keys and lease fencing.

Evidence: `scripts/tests/notification-retry-acceptance.ts` passes 23/23,
including retry-then-succeed, permanent failure → DEAD, already-SENT no
resend, SUPPRESSED audit, in-flight retry, crash-before-ack replay,
concurrent consumers and a poison event.

## Implemented event contracts

| Event | Written by | Recipient | Dedupe key |
| --- | --- | --- | --- |
| `support.ticket.created` | `createTicket` | eligible staff | `support.ticket.created:<ticketId>:<userId>` |
| `support.ticket.customer_reply` | assigned customer reply | assignee | `support.ticket.customer_reply:<messageId>` |
| `support.ticket.queued_reply` | unassigned customer reply | eligible staff, stored country | `support.ticket.queued_reply:<messageId>:<userId>` |
| `support.ticket.staff_reply` | public staff reply | ticket owner | `support.ticket.staff_reply:<messageId>` |
| `support.ticket.status_changed` | status change | ticket owner | `support.ticket.status_changed:<eventId>` |
| `order.status_changed` | `updateOrderStatus` (customer-visible states) | order customer | `order.status:<OrderStatusEventId>` |
| `order.delivered` | `updateOrderStatus(completed)` | order customer | `order.status:<OrderStatusEventId>` |
| `refund.completed` | `settleRefund` | order customer | `refund.completed:<refundId>` |
| `payout.completed` | `markPayoutPaid` | vendor owner | `payout.paid:<payoutId>` |
| `onboarding.reminder` | operations scan | applicant | `onboarding.reminder:<kind>:<id>:<date>` |
| `ops.daily_report` | operations scan | unscoped staff | `ops.daily_report:<date>:<userId>` |
| `ops.backup_succeeded` / `ops.backup_failed` | backup-status endpoint | unscoped staff | `ops.backup.<status>:<runId>:<userId>` |
| `ops.backup_stale` | operations scan | unscoped staff | `ops.backup_stale:<date>:<userId>` |

Every row carries `payloadVersion` 1 and is delivered through the single
outbox path. Internal order bookkeeping states (`created`, `payment_pending`,
`escrow_held`, `vendor_notified`) and `refunded` do not produce a second
customer message; refunds are covered by `refund.completed`.

## n8n operational configuration

- Both active workflows use an encrypted n8n `httpHeaderAuth` credential
  ("NaijaDeals automation consumer"), not `$env` in node parameters.
- `N8N_BLOCK_ENV_ACCESS_IN_NODE=true` is set and verified: both schedules still
  succeed (executions 33/34 and 32/35) after the restart.
- Workflows: `1lU7ERGPS0jAW7V4` (drain, active version `bfd796b6…`) and
  `Hcf6yI7AWn2ihNAy` (operations scan, active version `22eb55ce…`). Both schedules
  run every two minutes; the scans dedupe by UTC day and run id.
- n8n loads the real SQLite database and consumer credential from
  `C:\NaijaDeals-Automation\config\n8n.env`, binds `127.0.0.1` through
  `N8N_LISTEN_ADDRESS`, and restarts without creating an empty default database.

## Verification commands (tracked)

```
NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit
npx tsx scripts/tests/commerce-notifications-static.ts
TEST_DATABASE_URL='<TEST-classified URL>' npx tsx scripts/tests/notification-retry-acceptance.ts
TEST_DATABASE_URL='<TEST URL>' AUTOMATION_CONSUMER_TOKEN='<token>' npx tsx scripts/tests/operations-automation-acceptance.ts
TEST_DATABASE_URL='<TEST URL>' AUTOMATION_CONSUMER_TOKEN='<token>' AUTOMATION_BASE_URL='http://127.0.0.1:3200' npx tsx scripts/tests/automation-routes-acceptance.mts
TEST_DATABASE_URL='<TEST URL>' AUTOMATION_CONSUMER_TOKEN='<token>' npx tsx scripts/tests/support-http-acceptance.ts
```

The in-process suites (retry, operations, support reply) run against the
disposable database built by `scripts/tests/prepare-automation-test-db.mjs`,
which clones the schema and the 86-row `_prisma_migrations` history and seeds
the TEST marker and canonical roles, so a real backup event or the running n8n
consumer cannot make them flaky. The
HTTP suites (routes, support automation, support HTTP) must target the staging
database because they exercise the served build on `127.0.0.1:3200`.

All pass on the frozen build: type-check 0 errors, static PASS, retry 23/23,
operations 22/22, served-build routes 22/22, support 12/12 + 20/20 + 23/23.
Tests are fail-closed on `TEST_DATABASE_URL` plus a TEST database marker and
clean up run-owned rows.

## Remaining work

- External tester access is blocked by account and DNS state, not
  implementation: `staging-remote.naijadeals.com` already exists as an A record
  to the VPS, `naijadeals.com` uses Hostinger nameservers so it is not an active
  Cloudflare zone, Access reports `not_enabled`, and no tester email list is
  present locally. Preserving the existing A record and using a tunnel/Access
  route are mutually exclusive until the owner chooses a hostname strategy.
  Prepared, unactivated files are in `scripts/cloudflare/`. No tunnel, DNS
  change or Access application was created.
- **Document-expiry alerts are blocked by missing data, not by a missing
  event contract.** The schema has no partner-document entity: `DriverProfile`
  stores only `licenseNumber`; transport providers store `licenceRef`; Stay
  listings store `documentRef`. None has an expiry date, document type, owner
  verification state or retention policy. A reminder built on those fields
  would have to invent an expiry, which is not safe. Required owner decision:
  approve a `PartnerDocument` model (owner, vertical, kind, reference,
  issuedAt, expiresAt, verification state, retention) and the reminder windows
  (for example 30/7/1 days) plus recipients (document owner and unscoped ops).
  Once that exists the verified pattern applies directly:
  `document.expiry_reminder` with dedupe
  `document.expiry:<documentId>:<expiresAt>:<windowDays>:<userId>`.
- Per-vertical workflows remain deferred until those verticals have real,
  non-demo business transitions.
