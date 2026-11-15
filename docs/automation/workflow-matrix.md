# Ecosystem automation matrix (local n8n)

Release channel: **local staging only**. n8n never owns wallet balances,
payment verification, refunds, payouts, inventory reservations, order
transitions or driver dispatch; those stay in NaijaDeals services.

| Workflow | Purpose / owner | Trigger and payload | Permissions / dependency | Expected action | Idempotency / retries | Verification | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Local file smoke test | Prove n8n runs and writes to authorized D: output; platform owner | Manual trigger, no payload | Local Code node with built-in `fs` only | Write `D:\NaijaDeals-Storage\output\n8n-test.txt` | Manual, single run, no retries | CLI execution success, file content and sha256 `b40b0ce1…`, survives restart; workflow sha256 `7071ef3f…` | PASS (local) |
| Authenticated API control (create/update/list) | Operate workflows through the supported REST API; platform owner | `X-N8N-API-KEY` against `/api/v1` | N8N API key scoped to the owner, stored in `C:\NaijaDeals-Automation\config\.env` (name observed only) | List/create/update workflows, read executions | API-level idempotency not applicable | Workflow created, listed, updated and executed through the authenticated API; executions readable; 0 plaintext-token occurrences in workflow/execution JSON | PASS (local) |
| Backup status probe (n8n) | Prove authenticated workflow control writes an operator-visible status file; platform owner | Manual trigger via supported CLI, created through the API | API-created workflow, Code node with built-in fs only | Write `D:NaijaDeals-Storageoutputackup-status.txt` | Single manual run | Executed id `TNrcg15XpeUhsPWm`, file content `backup-status probe 2026-11-15T22:08:14.613Z`, execution id 2 visible via API; sha256 `392023b8…` | PASS (local) |
| Support new-ticket / reply notifications | Follow-up on support tickets; support team | Transactional `NotificationIntent` events, consumed only through the bearer-token automation API | Narrow consumer token; n8n holds no database credential | Staff alert on creation; assignee/queue alert on customer reply; customer alert on staff reply and status change | Per-ticket/per-message/per-event dedupe keys; replay and concurrent drains proven once-only | 12/12 creation slice, 20/20 reply suite, 23/23 HTTP delivery on build `TnD-FlYMrpjyjWZlsOOh0`; tickets survive n8n outage | PASS (local, implemented flows) |
| Order/shipment/refund/payout follow-ups | Operational reminders; ops/finance | Application outbox events | No restricted event feed; financial authority stays in services | Reminder/alert only | Would dedupe by event id | Not implemented | DEFERRED |
| Seller/merchant/driver onboarding reminders | Document and approval follow-up; ops | Onboarding records | No onboarding-event API for n8n | Reminder | Dedupe by applicant+stage | Not implemented | DEFERRED |
| Document expiry alerts | Warn before partner documents expire; compliance | Daily schedule + app data | Needs read-only authenticated app endpoint; no unrestricted DB credentials allowed | Alert operator | Dedupe by document id + expiry date | Not implemented | DEFERRED |
| Shop / Eats / Drive / Send / Gigs / Stay / Fresh / Stream / Pay vertical workflows | Per-vertical follow-up automation; vertical owners | Not defined for this release | No approved authenticated endpoints or event contracts; several verticals are demo/partial | — | — | Explicitly excluded from readiness claims | DEFERRED |
| n8n outage behavior | Prove core transactions do not depend on n8n | Controlled stop during staging activity | Local process control | Application keeps committing; n8n restarts cleanly | Ticket created while n8n down persisted exactly once (`ND-OUT-MWIDGBGI`, deleted after the test) | PASS |

## Durable support event slice (implemented)

Support writes now create `NotificationIntent` rows **inside the same
transaction** as the business change: ticket creation, assigned and unassigned
customer replies, public staff replies and status changes. Delivery uses the
existing outbox processor (claim → lease → deliver → complete) behind a
bearer-token API: `POST /api/automation/notifications/drain` and
`GET /api/automation/notifications/status` (dead-letter visibility). The n8n
consumer never receives a database credential; it holds only
`AUTOMATION_CONSUMER_TOKEN` through its environment.

Verified on staging build `TnD-FlYMrpjyjWZlsOOh0`: 20/20 service-level checks
and 23/23 HTTP-consumer checks covering all five event types — intent written
with its business row, no notification before the consumer, exactly one after,
replay `processed=0`, two concurrent drains delivering each reply once, expired
lease recovered and delivered once, and a DEAD letter visible on the status
endpoint. Independent reviews of the creation slice and the reply slice both
returned PASS.

Autonomy proof: with n8n stopped, ticket `ND-SUP-QJ4B5Z` committed with a
PENDING intent and zero notifications; starting n8n with the published schedule
drained it unattended (executions 5 and 6, mode `trigger`, both success) to
exactly one notification on the first attempt. The staging starter now loads
`C:\NaijaDeals-Automation\config\n8n.env` (database path and token) and binds
n8n to `127.0.0.1` via `N8N_LISTEN_ADDRESS`, so a restart keeps the same
workflows and does not expose the editor on other interfaces.

## Implemented event contracts

The support vertical is the reference implementation. Every row below is
written inside the same transaction as its business change, carries
`payloadVersion` 1 and is consumed only through
`POST /api/automation/notifications/drain` (claim → lease → deliver → finish,
bounded retries, DEAD state visible on `GET .../status`).

| Event | Written by | Recipient | Dedupe key |
| --- | --- | --- | --- |
| `support.ticket.created` | `createTicket` | eligible staff, `take: 20` | `support.ticket.created:<ticketId>:<userId>` |
| `support.ticket.customer_reply` | `postCustomerReply` (assigned) | assignee | `support.ticket.customer_reply:<messageId>` |
| `support.ticket.queued_reply` | `postCustomerReply` (unassigned) | eligible staff scoped by the ticket's stored country | `support.ticket.queued_reply:<messageId>:<userId>` |
| `support.ticket.staff_reply` | `staffReply` (public) | ticket owner | `support.ticket.staff_reply:<messageId>` |
| `support.ticket.status_changed` | `setTicketStatus` | ticket owner | `support.ticket.status_changed:<eventId>` |

Delivery creates its notification with `notification:<intent.dedupeKey>`, so a
crash between delivery and acknowledgement produces one notification, not two.
An internal staff note and a reply to a guest ticket enqueue nothing, matching
the previous behaviour. No direct support notification path remains.

Verified on build `TnD-FlYMrpjyjWZlsOOh0` (staging `127.0.0.1:3200`): 20/20
service-level checks and 23/23 HTTP-consumer checks, including replay
`processed=0`, two concurrent drains delivering each reply once, expired-lease
recovery and a DEAD letter visible to the operator. Independent reviews of both
slices returned PASS.

## Remaining event contracts (DEFERRED)

Order/shipment/refund/payout follow-ups, onboarding reminders, document-expiry
alerts and the per-vertical workflows still have no approved event contract.
Applying the verified pattern requires a business owner for each event, a
defined recipient, a stable dedupe identity, and an operator-visible dead-letter
path — the same four decisions the support slice settled. They stay DEFERRED
until that scope is authorised; the support rows above are not a deliverability
claim for them.
