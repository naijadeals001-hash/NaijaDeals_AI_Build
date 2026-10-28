# Stitch Conversion Worklist

This is a conversion worklist, not an audit. The selected Stitch HTML screens are treated as implementation blueprints for React/Tailwind components. Screenshots must not appear inside the product UI.

## NaijaShop

| Stitch folder/file | Layout sections in screen | Components to extract | App route | Status | Screenshot |
| --- | --- | --- | --- | --- | --- |
| `naijashop_marketplace/code.html` | Sticky top app bar, desktop nav, search, wallet/language/account actions, market-mode hero, verified badge, category rails, product grid, trust language | Shop header, market hero, market mode toggle, category chips, product grid, verified seller badge, price card | `/naijashop`, `/search`, `/product-listing` | in progress | `naijashop_marketplace/screen.png` |
| `naijashop_marketplace_mobile/code.html` | Mobile top bar, compact search, horizontal chips, product cards, bottom navigation | Mobile shop header, mobile search, app bottom nav, compact product card | `/naijashop` mobile | in progress | `naijashop_marketplace_mobile/screen.png` |
| `naijashop_marketplace_master_command_hub/code.html` | Marketplace command hub, inventory/market cards, AI/trust widgets | Shop operational summary, vendor trust strip, market clusters | `/naijashop` | not started | `naijashop_marketplace_master_command_hub/screen.png` |
| `universal_search_toyota_camry_results/code.html` | Search results, filters, relevance cards, location/vendor context | Product search results layout, filter drawer, market/vendor filter | `/search` | in progress | `universal_search_toyota_camry_results/screen.png` |
| `unified_checkout_mobile/code.html` | Step checkout, delivery/payment form, escrow disclosure, wallet choice | Checkout form, payment selector, escrow disclosure, order summary | `/checkout`, `/cart` | in progress | `unified_checkout_mobile/screen.png` |

## NaijaEats

| Stitch folder/file | Layout sections in screen | Components to extract | App route | Status | Screenshot |
| --- | --- | --- | --- | --- | --- |
| `naijaeats_home_hub/code.html` | Sticky food top bar, location selector, search, cuisine filters, restaurant/menu cards | Eats header, location chip, food search, cuisine chips, restaurant card | `/naijaeats` | in progress | `naijaeats_home_hub/screen.png` |
| `naijaeats_home_hub_mobile/code.html` | Mobile food app shell, wallet/cart, search, category tabs, bottom nav | Mobile eats header, cart action, category tabs, mobile menu card | `/naijaeats` mobile | in progress | `naijaeats_home_hub_mobile/screen.png` |
| `mama_cass_restaurant_detail/code.html` | Restaurant detail hero, prep time, menu sections, add item controls, reviews | Restaurant detail card, menu section, kitchen readiness, add meal button | `/naijaeats` | in progress | `mama_cass_restaurant_detail/screen.png` |
| `naijaeats_delivery_priority_dispatch_logic/code.html` | Dispatch logic, rider assignment, food priority, SLA states | Food tracking state, prep/rider status, priority delivery badge | `/tracking/[id]`, `/admin` | not started | `naijaeats_delivery_priority_dispatch_logic/screen.png` |
| `naijaeats_restaurant_operations_center/code.html` | Restaurant admin queue, orders, prep SLA, performance | Restaurant admin queue, order prep table | `/admin` | not started | `naijaeats_restaurant_operations_center/screen.png` |

## NaijaSend

| Stitch folder/file | Layout sections in screen | Components to extract | App route | Status | Screenshot |
| --- | --- | --- | --- | --- | --- |
| `naijasend_logistics_dashboard/code.html` | Logistics dashboard, active missions, delivery lanes, proof states | Logistics booking shell, mission cards, corridor cards | `/naijasend` | in progress | `naijasend_logistics_dashboard/screen.png` |
| `logistics_dispatch_fulfillment_hub/code.html` | Dispatch board, courier capacity, fulfillment queue | Courier assignment panel, dispatch queue | `/naijasend`, `/admin` | in progress | `logistics_dispatch_fulfillment_hub/screen.png` |
| `smart_dispatch_driver_assignment_engine/code.html` | AI assignment engine, route/capacity/risk scoring | Courier match demo, route risk card | `/naijasend`, `/admin` | not started | `smart_dispatch_driver_assignment_engine/screen.png` |
| `naijadeals_proof_of_delivery_scan_ledger/code.html` | QR/barcode scan ledger, proof events, delivery verification | QR proof card, barcode verification, proof timeline | `/naijasend`, `/tracking/[id]` | in progress | `naijadeals_proof_of_delivery_scan_ledger/screen.png` |
| `public_logistics_transparency_tracker/code.html` | Public tracking status, route timeline, handoff transparency | Delivery tracking timeline, public proof status | `/tracking/[id]`, `/shipping` | in progress | `public_logistics_transparency_tracker/screen.png` |

## NaijaPay

| Stitch folder/file | Layout sections in screen | Components to extract | App route | Status | Screenshot |
| --- | --- | --- | --- | --- | --- |
| `naijapay_consumer_wallet_home/code.html` | Mobile wallet top bar, balance card, quick actions, transactions | Wallet balance card, quick actions, transaction list | `/wallet` | in progress | `naijapay_consumer_wallet_home/screen.png` |
| `naijawallet_dashboard/code.html` | Desktop wallet dashboard, ledger, settlement cards | Wallet desktop grid, ledger rows, escrow panels | `/wallet`, `/payments` | in progress | `naijawallet_dashboard/screen.png` |
| `merchant_escrow_settlement_dashboard/code.html` | Escrow settlement, payout state, merchant financial controls | Escrow hold detail, settlement state, payout card | `/wallet`, `/admin` | not started | `merchant_escrow_settlement_dashboard/screen.png` |
| `payouts_financial_reports_dashboard/code.html` | Payout reporting, refunds, financial summaries | Payout/refund summary cards, report rows | `/wallet`, `/admin` | not started | `payouts_financial_reports_dashboard/screen.png` |
| `payment_security_biometric_transfer_approval/code.html` | Secure payment approval, transfer verification | Payment method demo, security approval panel | `/checkout`, `/wallet` | not started | `payment_security_biometric_transfer_approval/screen.png` |

## Admin

| Stitch folder/file | Layout sections in screen | Components to extract | App route | Status | Screenshot |
| --- | --- | --- | --- | --- | --- |
| `ecosystem_admin_dashboard/code.html` | Admin overview, metrics, queues, vertical health | Admin shell, KPI cards, queue grid | `/admin` | in progress | `ecosystem_admin_dashboard/screen.png` |
| `admin_terminal_ecosystem_oversight_verification/code.html` | Admin terminal nav, oversight tables, verification modules | Admin command header, approval tables, verification cards | `/admin` | in progress | `admin_terminal_ecosystem_oversight_verification/screen.png` |
| `naijaescrow_admin_command_center/code.html` | Escrow/dispute controls, financial risk | Escrow table, dispute queue, refund controls | `/admin` | not started | `naijaescrow_admin_command_center/screen.png` |
| `naijasend_admin_dashboard/code.html` | Logistics admin, deliveries, courier/risk queue | Delivery admin table, courier queue, risk alerts | `/admin` | in progress | `naijasend_admin_dashboard/screen.png` |
| `fraud_security_command_center/code.html` | Fraud/risk alerts, security triage, policy controls | Risk alert cards, fraud queue, admin action buttons | `/admin` | in progress | `fraud_security_command_center/screen.png` |
