# Ecosystem automation matrix (local n8n)

Release channel: **local staging only**. n8n never owns wallet balances,
payment verification, refunds, payouts, inventory reservations, order
transitions or driver dispatch; those stay in NaijaDeals services.

| Workflow | Purpose / owner | Trigger and payload | Permissions / dependency | Expected action | Idempotency / retries | Verification | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Local file smoke test | Prove n8n runs and writes to authorized D: output; platform owner | Manual trigger, no payload | Local Code node with built-in `fs` only | Write `D:\NaijaDeals-Storage\output\n8n-test.txt` | Manual, single run, no retries | CLI execution success, file content and sha256 `b40b0ce1…`, survives restart; workflow sha256 `7071ef3f…` | PASS (local) |
| Authenticated API control (create/update/list) | Operate workflows through the supported REST API; platform owner | `X-N8N-API-KEY` against `/api/v1` | N8N API key scoped to the owner | List/create/update workflows, read executions | API-level idempotency not applicable | Blocked: `C:\NaijaDeals-Automation\config\.env` does not exist and no `N8N_API_KEY` is set; the database holds one hashed key row, so a key was created but its plaintext was not stored here | BLOCKED |
| Backup status probe (n8n) | Prove authenticated workflow control writes an operator-visible status file; platform owner | Manual trigger via supported CLI, created through the API | API-created workflow, Code node with built-in fs only | Write `D:NaijaDeals-Storageoutputackup-status.txt` | Single manual run | Executed id `TNrcg15XpeUhsPWm`, file content `backup-status probe 2026-11-15T22:08:14.613Z`, execution id 2 visible via API; sha256 `392023b8…` | PASS (local) |
| Support new-ticket / reply notifications | Follow-up on support tickets; support team | Application event (notification outbox) | No authenticated support-events endpoint for n8n; no outbound email provider | Notify staff/customer | Would need dedupe on ticket+message id | Core support works without n8n; tickets survive n8n outage (outage probe created and persisted while n8n stopped) | DEFERRED |
| Order/shipment/refund/payout follow-ups | Operational reminders; ops/finance | Application outbox events | No restricted event feed; financial authority stays in services | Reminder/alert only | Would dedupe by event id | Not implemented | DEFERRED |
| Seller/merchant/driver onboarding reminders | Document and approval follow-up; ops | Onboarding records | No onboarding-event API for n8n | Reminder | Dedupe by applicant+stage | Not implemented | DEFERRED |
| Document expiry alerts | Warn before partner documents expire; compliance | Daily schedule + app data | Needs read-only authenticated app endpoint; no unrestricted DB credentials allowed | Alert operator | Dedupe by document id + expiry date | Not implemented | DEFERRED |
| Shop / Eats / Drive / Send / Gigs / Stay / Fresh / Stream / Pay vertical workflows | Per-vertical follow-up automation; vertical owners | Not defined for this release | No approved authenticated endpoints or event contracts; several verticals are demo/partial | — | — | Explicitly excluded from readiness claims | DEFERRED |
| n8n outage behavior | Prove core transactions do not depend on n8n | Controlled stop during staging activity | Local process control | Application keeps committing; n8n restarts cleanly | Ticket created while n8n down persisted exactly once (`ND-OUT-MWIDGBGI`, deleted after the test) | PASS |

## Event contracts (not yet implemented)

No durable automation event/outbox contract was added in this pass. Support, order,
refund, onboarding and document reminders therefore remain DEFERRED; the
workflows above do not consume application events, and no automation API was
exposed. Any next slice must persist versioned events transactionally, add a
narrowly scoped consumer credential, and implement claim/ack/retry/dead-letter
semantics before those rows can leave DEFERRED.

## Environment

- n8n 2.47.7, Node 24.22.3, `http://127.0.0.1:5680`, SQLite at
  `C:\NaijaDeals-Automation\n8n-data\database.sqlite`.
- Authenticated API requires the owner to save `N8N_BASE_URL` and
  `N8N_API_KEY` in `C:\NaijaDeals-Automation\config\.env` (create the key in
  the n8n UI: Settings → API → Create API key). The owner account already
  exists; do not reset it.
- Release workflows must use restricted application APIs, never the
  application database. None of the deferred rows above are part of the
  current readiness claim.
