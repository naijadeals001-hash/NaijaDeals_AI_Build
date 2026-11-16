# Staging tester guide

NaijaDeals staging acceptance — tester instructions.

This guide is for the approved testers of the current staging build. It
tells you what you can reach, which account to use, what is known to be
unavailable, how to report a finding through the existing support system, and
what you must not do.

The detailed route-by-route status is in
[`docs/staging/tester-journey-matrix.md`](./tester-journey-matrix.md). Read both
documents before you start.

## 1. The build you are testing

| Item | Value |
| --- | --- |
| Application URL (local) | <http://localhost:3200> |
| Application URL (protected external) | <https://staging-remote.naijadeals.com> |
| Staging build | `ygTpeinzqY0L2X5fgwNUL` |
| Source | `naijashop-marketplace`, tester-role commit |
| Database | `naijadeals_staging` (TEST classification) |
| Testers | 3 primary accounts plus 2 persona accounts |
| Shop fixtures | 3 `STAGING DEMO` departments and 3 `STAGING DEMO` products |
| Test funds | Tester02: ₦100,000 staging test credit; tester03: unfunded by design |
| Environment | Local Windows staging stack; not production |

Quote the build ID `ygTpeinzqY0L2X5fgwNUL` in every finding. The served build ID
is the acceptance identity. Do not assume the current working tree is
byte-identical to the served
bundle. If the build ID you see or are told differs from this, stop and ask the
coordinator before testing.

## 2. Access

Working URLs:

- **External:** <https://staging-remote.naijadeals.com>
- **Local:** <http://localhost:3200> (the machine running staging)

The external hostname is protected by Cloudflare Access. Only the three approved
tester addresses are allowed; there is no domain-wide rule and no bypass.

1. Open the external URL and enter your own approved tester address.
2. Cloudflare sends a one-time login email to that address (the tester aliases
   deliver to the shared office mailbox used by the test coordinator). Use the
   email's sign-in link or enter the one-time code.
3. After the Access gate, sign in to NaijaDeals with your own activation
   credentials from the protected handoff. Access does not replace the app's
   login or role checks.
4. Testing Manager lands on `/admin`; open `/admin/support` directly. Other
   Control Center modules are not authorized and return 403.

The three aliases currently deliver to the coordinator's shared office mailbox.
Possession of that mailbox satisfies the Access email step for any alias; the
NaijaDeals app login remains per-account. Individual mailbox provisioning is
still an owner action; the exact handoff is in
[`docs/staging/mailbox-isolation.md`](./mailbox-isolation.md). Never share the
mailbox credentials, an Access code or a sign-in link, and never use another
tester's address.

If your address is not accepted, stop and contact the coordinator; do not try
another identity or a domain-wide address. The local URL remains available for
offline/local checks.

## 3. Credentials and the activation handoff

Credentials are held by the owner in the ACL-protected activation file:

`C:/NaijaDeals-Staging/secrets/tester-activation.json`

Rules:

1. The owner hands each tester their own credential out of band. Do not read,
   copy, screenshot or forward the activation file.
2. Never put a password in a support ticket, chat message, screenshot, document
   or Git commit.
3. Never share your account with another tester. Each tester uses only their own
   account and, where assigned, their own persona account.
4. Do not change your email or password in `/account`. A password change signs
   you out and invalidates the owner's activation handoff. If you lose your
   credential, ask the owner to reset it.
5. The two `.test` persona addresses are non-deliverable staging identities, not
   mailboxes. Do not send email to them.

If you believe a credential has been exposed, stop using it and tell the
coordinator privately. Do not repeat the credential in your report.

## 4. Accounts and personas

Use exactly these accounts. The roles are the authorised scope; do not try to
extend them.

| Account | Roles | Account holder | Use it for | Landing after sign-in |
| --- | --- | --- | --- | --- |
| `tester01` | customer + staging_test_manager (Testing Manager) | Testing Manager | Support inbox triage, assignment, replies, internal notes, customer-side checks | `/admin` — go directly to `/admin/support` |
| `tester02` | customer | tester02 | Customer journeys: account, Shop shell/search, support tickets, country directory, navigation | `/account` |
| `tester03` | customer | tester03 | Customer journeys; owner of the driver persona | `/account` |
| `seller persona account` | customer + vendor (seller persona) | tester02 only | `/seller` overview and read-only empty lists | `/seller` |
| `driver persona account` | customer + driver (driver persona) | tester03 only | `/driver` presence and workspace | `/account` — then open `/driver` manually |

Notes:

- `tester01` is a **Testing Manager**, not an administrator. The assigned staff
  surface is the existing support inbox at `/admin/support`. There is **no
  test-management screen** and no invented defect dashboard. Findings are
  ordinary support tickets.
- `tester01` may land on `/admin`, which can show load errors for modules the
  staging_test_manager role cannot read. Ignore those errors and use the Support inbox. Do
  not use other Control Center modules.
- The seller and driver personas are staging-only. Do not use them for
  real-world identity claims, and do not create additional accounts.
- A persona belongs only to its owning tester. Do not sign in as another
  tester's persona.

## 5. Before you start

- The staging PC must remain powered on and awake for the external URL to work.
  The app, n8n, PostgreSQL and the Cloudflare connector are local processes; a
  sleep, sign-out, reboot or stopped service interrupts external testing. Do not
  stop or restart them yourself. A local watchdog runs every minute and may
  deliberately stop the connector if the Access/tunnel contract cannot be
  verified; report the observed outage rather than trying to bypass it.
- Use a current Chromium-based browser (Chrome or Edge). For the external URL,
  complete the Cloudflare Access sign-in first; for the local URL, no Access
  gate is involved. If sign-in appears to succeed but the next page redirects
  to `/login`, record the browser and version in a finding.
- Use a separate browser profile or private window per account so sessions do
  not mix.
- Test at these viewports:
  - Mobile: `390 × 844` (spot-check `360 × 800`)
  - Tablet: `768 × 1024`
  - Desktop: `1440 × 900` (spot-check `1280 × 800`)
- For the driver persona, grant browser location permission when prompted. The
  driver presence feature uses the real browser location. Do not fake
  coordinates or use a location-spoofing extension.
- Use only synthetic test data in addresses, names, phone numbers and ticket
  text. Do not enter a real home address, real phone number, customer record,
  card number, bank detail or any other personal data.
- Keep a local folder for screenshots. Name each file clearly, for example
  `2026-11-13_tester02_shop-search_390x844.png`. Do not commit screenshots to
  the repository unless the coordinator asks.
- Redact personal data and anything that looks like a secret before sharing a
  screenshot. Never screenshot the activation file, a cookie, a token, a
  database view or the n8n UI.

## 6. What you can test now

This is the short version. The matrix has the exact route, persona,
preconditions, steps, expected result and evidence for every row.

### All testers

| Journey | Route | Expected result |
| --- | --- | --- |
| Sign in | `/login` | Session starts; role-based landing as in section 4 |
| Invalid sign-in | `/login` | "Email or password is incorrect."; no session |
| Sign out | Header account menu | Session ends; `/account` redirects to `/login` |
| Account profile | `/account` | Name/phone save with "Profile saved."; email and roles read-only |
| Account addresses | `/account` | Add/edit/set default; list updates; invalid fields rejected |
| Shop shell and DEMO catalogue | `/naijashop` | Marketplace header, location, search and cart render; 3 departments and 3 `STAGING DEMO` products are visible and labelled as demonstration data |
| Shop search and product detail | `/naijashop/search?q=STAGING%20DEMO`, `/product/[slug]` | Three demo products found; detail shows price, DEMO badge and demonstration notice |
| Variants and availability | `/product/staging-demo-variant-sneakers`, `/product/staging-demo-out-of-stock-blender` | One in-stock and one disabled out-of-stock variant; the simple out-of-stock item cannot be added |
| Saved items and cart | `/product/...`, `/account#saved`, `/cart` | Save/list/remove works; cart add, quantity change, save for later, move back and remove work |
| Checkout and wallet payment | `/checkout` | Tester02: valid address, wallet offered, wallet payment completes, order appears as paid with delivery and escrow. Tester03: insufficient-balance refusal; no false success |
| Order history, cancellation and refund | `/orders`, `/orders/[id]` | Owner sees the order and payment state; paid cancellation refunds the wallet/escrow; duplicate confirmation/cancellation cannot double-pay |
| Returns | `/returns` | Honest empty eligibility state; opening a return case is deferred until a legitimately delivered order exists |
| Empty cart | `/cart` | "Your cart is empty" after your own cleanup |
| Country directory | `/naijashop/countries` | Search/region controls render and return the honest empty state; "0 published country guides" is the real state |
| Desktop navigation | `/`, `/naijashop`, `/account` at desktop width | One header, working links, visible keyboard focus, no dead primary controls |
| Mobile navigation | Same pages at mobile width | Bottom navigation Home/Activity/Wallet/Account; menu works; no horizontal overflow |
| Support ticket creation | `/contact` or `/account/support` → New enquiry | Reference shown; ticket appears under Account → Support |
| Support tracking and reply | `/account/support` → ticket | Messages and status visible; reply appends; closed ticket blocks reply |
| Form validation | Login, contact, account, host form | Inline or server error; no false success message |
| Role boundaries | `/admin`, `/seller`, `/driver` | Each role reaches only its own surface; cross-role access is denied |

### `tester01` — Testing Manager

| Journey | Route | Expected result |
| --- | --- | --- |
| Support inbox | `/admin/support` | Tickets list, filter, search, paginate; tester reports are visible |
| Assignment and reply | `/admin/support/[id]` | Assign to self; set status/priority; public reply; internal note hidden from the customer |
| Permission boundaries | Support inbox plus denied endpoints | Payout and super-admin access denied; no other Control Center module used |

### `tester02` — customer and seller persona

| Journey | Route | Expected result |
| --- | --- | --- |
| Customer journeys | As "All testers" above | Same expected results |
| Successful Shop checkout | `/checkout` | Pay for a `STAGING DEMO` item from the pre-funded wallet; order becomes paid; then use the journey's cancellation/refund check |
| Seller overview | `/seller` | Vendor name/status and zero-valued stats; the `STAGING DEMO` catalogue seller is a different vendor and is not in this projection |
| Seller orders list | `/seller` Orders | "No orders yet."; no demo-vendor order is readable |
| Seller products list | `/seller` Products | Empty list; the demo products are not owned by this seller and updates are denied. Do not create a listing (see section 9) |

### `tester03` — customer and driver persona

| Journey | Route | Expected result |
| --- | --- | --- |
| Customer journeys | As "All testers" above | Same expected results |
| Insufficient-balance payment | `/checkout` | Wallet has no test credit; payment is refused with `insufficient_wallet`; cancel the unpaid order so its reservation is released |
| Driver workspace | `/driver` | Workspace loads; service zone is Abuja; presence controls visible |
| Driver presence | `/driver` | Allow location → Go online → Online, heartbeat starts; stop → Offline; deny location → clear error and no online state |

### Not testable in this round

Do not attempt to work around these:

- Return-case creation after delivery (no legitimately delivered order exists
  in the customer-only demo catalogue; the honest empty `/returns` state is the
  expected result).
- Seller order actions and seller product creation/publication.
- Driver ride acceptance, navigation, completion, cash/release, receipt and
  earnings.
- Stay host application, host dashboard, host verification and property listing.
- Country guide detail pages.
- Any external identity or Cloudflare login other than your own approved tester
  address (the approved external Access flow is described in §2).
- Any real payment, refund, payout or wallet top-up.

## 7. How to submit findings through support

There is no separate bug tracker and no test-management UI. Findings are
ordinary support tickets in the existing support system. This keeps the report,
the reply and the reference in one place.

### As a tester

1. Sign in with your own tester account.
2. Open `/contact`, or `/account/support` → **New enquiry**.
3. Choose the closest service (for example Shop, Stays, or General) and the
   topic:
   - **Technical** for a defect or broken behaviour.
   - **Account** for sign-in, session or role-access problems.
   - **Other** for documentation or a known-limitation question.
4. Use a subject in this form: `[STAGING] <area>: <short title>`.
5. Put the full report in the message using the format in section 8.
6. Submit and record the ticket reference (for example `ND-XXXXXX`).
7. Track it at `/account/support`. Reply in the same ticket with any new
   evidence. Do not open a second ticket for the same finding.

One finding per ticket. Do not combine unrelated issues. Do not include
passwords, tokens, cookies, connection strings, customer data or the contents of
the activation file.

### Screenshots

The support form has **no attachment field**. Put the screenshot filename(s) and
a one-line description of what each shows in the ticket body. Keep the files in
your local QA folder and give them to the coordinator out of band if requested.
A report without a screenshot is still valid; describe the state accurately.

### As the Testing Manager (`tester01`)

1. Sign in and go directly to `/admin/support`.
2. Open a tester's ticket. Assign it to yourself if you are handling it.
3. Reply with a customer-visible message, or add an internal note for
   coordinator-only context. Internal notes are never shown to the customer.
4. Use status and priority to reflect the real state. Do not close a ticket
   unless it is genuinely resolved.
5. The Control Center notification bell is a known placeholder. Use the support
   inbox and the shared in-app notification feed described in the matrix; do not
   claim an email or SMS was sent.

There is no outbound email or SMS delivery on this build. A tester will not
receive an email confirmation, and neither will the Testing Manager. All
communication is in-site.

### If the issue is a security or money problem

Stop immediately and do not try to reproduce it further if it could expose
another person's data, a secret, or real funds. Do not copy the exposed value
into the ticket. Tell the coordinator privately, include the ticket reference
and the affected page, and follow their instruction. Never attempt a real
payment, refund or payout to prove a bug.

## 8. Report format

Copy this into the ticket body and fill every line:

```text
Build: ygTpeinzqY0L2X5fgwNUL
Date/time:
Account: tester02 (customer)
Page/URL: http://localhost:3200/...
Device/browser/viewport: Windows 11 / Chrome <version> / 1440x900
Steps:
1.
2.
3.
Expected:
Actual:
Screenshot: <filename> — <what it shows> (no attachment upload; file kept locally)
Repeatable: yes/no (how many times)
Severity: blocking / major / minor / cosmetic
```

Guidance:

- **Page/URL** is the exact URL, including query string.
- **Steps** must be reproducible by someone else. Include the account and any
  precondition (for example "empty cart", "location permission denied").
- **Expected** is what the journey matrix or this guide says should happen.
- **Actual** is what you observed, including visible error text. Do not
  paraphrase an error into a different message.
- **Screenshot** is a filename and a short description; it is not an upload.
- **Device/browser** includes OS, browser version and viewport size.
- **Severity** is optional but useful. "Blocking" means you cannot continue the
  assigned journey; "cosmetic" means appearance only.

## 9. Known limitations — do not report as new defects

These are known and intentional for this round. Report them only if the
behaviour changes or blocks a journey in a new way.

1. **External access is restricted to the approved testers.** Use
   <https://staging-remote.naijadeals.com> only with your own approved address
   through the Cloudflare Access gate in §2. There is no domain-wide rule and
   no bypass; do not ask for one.
2. **The Shop catalogue is demonstration data only.** There are 3 `STAGING DEMO`
   departments and 3 `STAGING DEMO` products. They are not real supply, real
   prices or real sellers. Do not create products, categories or orders outside
   the documented demo journey.
3. **Only wallet checkout is offered.** The running production-mode build offers
   the NaijaPay `wallet` method. The local `test` payment adapter is deliberately
   not offered. Tester02 has a staging test balance created through the local
   test top-up service; tester03 is intentionally unfunded for the
   insufficient-balance case. Do not top up, use a card/bank provider, or claim
   a provider sandbox result.
4. **No published country guides.** The Discover Africa directory reports 0
   published countries. That is the real state; country guide detail is blocked.
5. **Seller publication is closed.** New seller listings can only be drafts, and
   publication requires the Control Center permission that no tester holds.
   There are no seller categories to select. Do not create draft products.
6. **Driver rides do not exist.** Presence and workspace are testable; there are
   no passenger requests. The staging service zone is Abuja, not Lagos. The
   go-online notice may still say "Lagos"; that copy is hardcoded and does not
   change the Abuja service zone. The driver account lands on `/account` after
   sign-in; open `/driver` manually. Presence requires browser location and
   expires after 120 seconds without a heartbeat; a stale warning appears after
   60 seconds.
7. **Stay host is deferred.** There is no host persona and no tester-held host
   approval. The host landing page is read-only for this round; do not submit the
   application.
8. **Support has no attachments and no outbound email/SMS.** Tickets and replies
   are in-app only. The form returns a reference; it does not claim an email was
   sent.
9. **The Control Center notification bell is a placeholder.** It opens static
   text saying no notification service is connected. In-app follow-up records
   can be observed in the shared `/naijagigs/notifications` feed, but that is a
   diagnostic surface, not a support workflow.
10. **The Testing Manager's `/admin` landing may show load errors** for modules
    the staging_test_manager role cannot read. Use `/admin/support`; do not treat those
    permission errors as a support-inbox failure.
11. **Visual checks are manual on this build.** Historical `qa:visual` evidence
    exists, but it is not a current run against this staging build.
12. **This is a web/PWA staging build.** Do not expect a native app store
    listing, push notifications, or closed-app tracking.
13. **Mailbox identity is not yet individual.** The three approved aliases
    currently deliver to the coordinator's shared office mailbox. Cloudflare
    Access therefore proves shared-mailbox access, not a separate tester
    identity. Individual mailbox provisioning is an owner action recorded in
    `docs/staging/mailbox-isolation.md`; do not use another tester's address.
14. **The direct "order paid" in-app notice may remain queued.** The transactional
    outbox intents used for vendor/status/refund follow-ups are drained by n8n
    and were processed in the acceptance run. The optional Valkey notification
    worker is not configured in this staging process, so a direct customer
    "order paid" notification row can remain `QUEUED`; order history still shows
    the paid state. Do not treat this as a missing order or payment.

## 10. Safe test payments

**Payment verification level: local test top-up → wallet checkout. No live
provider is used.**

What is set up:

- The app offers the NaijaPay `wallet` method only.
- Tester02's staging wallet is pre-funded with **₦100,000 of test credit**
  through the existing local test top-up service. That top-up posted a balanced
  ledger journal; the app's production-mode environment was not changed and the
  `test` payment adapter remains unavailable.
- Tester03's wallet is intentionally unfunded so the insufficient-balance
  refusal is a real case.
- The three products are labelled `STAGING DEMO`; the prices are illustrative.

Approved steps for tester02:

1. Open a `STAGING DEMO` in-stock product and choose an available variant.
2. Add it to the cart and open `/checkout`.
3. Enter clearly synthetic delivery details.
4. Choose **NaijaPay wallet** and confirm the payment.
5. Expect a paid order, one delivery and one escrow hold. The order must appear
   in `/orders` with `Payment: Paid`.
6. Use the order's **Cancel order** action to verify the supported
   cancellation/refund path; the wallet and escrow must return to their prior
   state. A second cancellation must be refused.

Approved steps for tester03:

1. Follow the same basket/checkout steps.
2. Choose the wallet and confirm.
3. Expect an insufficient-balance refusal (`insufficient_wallet`), no paid
   order and no false success.
4. Cancel the unpaid order through the UI so its stock reservation is released.

Do not:

- enter card, bank, USSD or mobile-money details;
- top up a wallet yourself;
- call a payment provider;
- enable or request the `test` adapter;
- use a real payment to "see what happens";
- delete or edit an order, payment, refund or ledger row.

`GET /api/payments/methods?country=NG` is expected to return only `wallet`. If a
provider redirect or card form appears unexpectedly, stop and report it; do not
submit payment data.

## 11. Prohibited actions

These are out of scope and may invalidate the test round:

- **No real money.** The only permitted money movement is tester02's pre-funded
  staging wallet on a `STAGING DEMO` order, including the supported cancellation
  refund. No card/bank/provider charge, payout, transfer, self-service top-up,
  or use of another account's wallet.
- **No production.** Do not use `naijadeals.com` or any production service.
  `staging-remote.naijadeals.com` is the approved staging URL and may be used
  only through your own approved Access identity.
- **No infrastructure changes.** No DNS, Cloudflare, Access, tunnel, Hostinger,
  Nginx, service start/stop or configuration changes.
- **No admin or platform access.** Except for `tester01` using `/admin/support`,
  do not use Control Center modules, super-admin, admin APIs, the n8n UI/API, or
  the database (`psql`, SQL, migrations, backups).
- **No secrets.** Do not open, copy, screenshot or transmit the activation file,
  environment files, cookies, tokens, API keys or connection strings.
- **No other people's data.** Do not access another tester's account, ticket,
  orders or persona. Do not attempt cross-account or IDOR probing beyond the
  documented denial checks.
- **No destructive or shared-data writes.** Do not change email/password, delete
  records, create products/categories/orders/rides/hosts, publish listings,
  approve hosts, or alter another user's data.
- **No load, penetration or automated security testing.** No scanners, fuzzers,
  brute force, scraping or bulk account creation.
- **No external communications.** Do not contact real sellers, drivers,
  restaurants, partners or customers on behalf of NaijaDeals. Do not publish
  findings publicly.
- **No personal or sensitive uploads.** Do not put real customer records,
  identity documents, addresses, phone numbers or payment data into tickets or
  screenshots.
- **Do not fix the code or documentation yourself.** Report the finding; the
  coordinator owns changes.

## 12. Stop and escalate

Stop testing and contact the coordinator privately if you see:

- access to another account's data, or a role boundary that is unexpectedly open;
- a secret, token, password or connection string exposed in the UI, a log or a
  response;
- a real charge, payout or refund initiated;
- data loss or a destructive action;
- the staging app or database unavailable;
- a build ID that does not match `ygTpeinzqY0L2X5fgwNUL`.

Include the ticket reference, page, time and build. Do not include the secret or
the personal data in the report.

## 13. Reference

- Route-by-route status, preconditions, expected results and evidence:
  [`docs/staging/tester-journey-matrix.md`](./tester-journey-matrix.md)
- Support ticket entry point: `/contact` and `/account/support`
- Testing Manager inbox: `/admin/support`
- Build under test: `ygTpeinzqY0L2X5fgwNUL` at <http://localhost:3200>
