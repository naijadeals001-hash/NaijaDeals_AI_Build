# NaijaDeals Operating System Build Plan

Source map: `docs/stitch-system-map.md`

This plan builds NaijaDeals as a commerce operating system. Pages are only views into systems. Each system below must ship with database state, API mutations, events, audit records, and admin control before visual polish is considered complete.

## Build Sequence

1. Identity / roles / KYC
2. Marketplace catalog
3. Cart and checkout
4. Wallet ledger
5. Escrow lifecycle
6. Orders lifecycle
7. Vendor operations
8. Logistics / courier dispatch
9. QR proof and tracking
10. Disputes / refunds
11. Admin operations
12. Aura AI support layer

## 1. Identity / Roles / KYC

- Build priority: P0 foundation
- Purpose: Establish all actors, roles, verification states, permissions, and audit identity for every later workflow.
- Database models: `User`, `Role`, `Permission`, `UserRole`, `Vendor`, `Restaurant`, `Courier`, `DriverProfile`, `KycProfile`, `KycDocument`, `VerificationCheck`, `TrustScore`, `Session`, `AuditLog`
- API routes: `POST /api/auth/session`, `DELETE /api/auth/session`, `GET /api/me`, `POST /api/kyc/submit`, `GET /api/kyc/:id`, `PATCH /api/admin/kyc/:id/status`, `GET /api/admin/roles`, `POST /api/admin/roles/assign`
- Frontend views: sign in demo/auth shell, account profile, merchant onboarding identity step, driver/courier onboarding, KYC document upload, verification status view
- Admin views: KYC queue, role assignment, actor detail, verification evidence, trust score history, blocked/suspended users
- Events generated: `identity.submitted`, `identity.document_uploaded`, `identity.review_started`, `identity.verified`, `identity.rejected`, `role.assigned`, `trust_score.updated`, `admin.action_logged`
- Wallet/escrow impact: no wallet movement until verified actor can receive funds; unverified vendors cannot receive payout; high-risk KYC can force escrow reserve or manual release
- Stitch designs that represent it: `identity_verification_kyc`, `merchant_onboarding_step_1_identity`, `merchant_onboarding_step_2_business_profile`, `merchant_onboarding_step_4_payouts_completion`, `driver_compliance_registry_dashboard`, `global_business_verification_system`, `regional_supplier_vetting_kyc_hub`, `video_kyc_high_risk_merchant_verification`, `video_kyc_high_risk_regional_onboarding`, `pan_african_personnel_vetting_security_hub_optimized_layout_3`

## 2. Marketplace Catalog

- Build priority: P0 foundation
- Purpose: Create a real catalog engine for products, categories, listings, pricing, inventory, seller trust, and searchable marketplace records.
- Database models: `Category`, `Product`, `ProductVariant`, `Listing`, `ListingImage`, `InventoryStock`, `PriceRule`, `Vendor`, `Review`, `TrustBadge`, `SearchIndexRecord`, `CatalogAudit`
- API routes: `GET /api/catalog/categories`, `GET /api/products`, `POST /api/vendor/products`, `GET /api/products/:id`, `PATCH /api/vendor/products/:id`, `POST /api/vendor/products/:id/images`, `PATCH /api/vendor/inventory/:id`, `POST /api/reviews`
- Frontend views: marketplace catalog, category results, search results, product detail, related products, review list, vendor storefront
- Admin views: product moderation, category manager, vendor catalog audit, inventory exceptions, review moderation, trust badge assignment
- Events generated: `listing.created`, `listing.updated`, `listing.published`, `listing.suspended`, `inventory.reserved`, `inventory.released`, `price.changed`, `review.created`, `trust_badge.assigned`
- Wallet/escrow impact: catalog defines escrow eligibility, vendor payout recipient, taxes/fees, refund policy, and inventory reserve at checkout
- Stitch designs that represent it: `naijashop_marketplace`, `naijashop_product_detail`, `naijashop_merchant_hub_mobile`, `universal_search_ai_discovery_hub_1`, `universal_search_ai_discovery_hub_2`, `universal_search_toyota_camry_results`, `wholesale_bulk_order_marketplace`, `merchant_global_listing_ai_translation_hub`, `business_profile_service_inventory`, `vendor_analytics_dashboard`

## 3. Cart And Checkout

- Build priority: P0 transaction entry
- Purpose: Convert catalog selections into a validated order intent, calculate fees, reserve inventory, authorize payment, create escrow hold, and create fulfillment mission.
- Database models: `Cart`, `CartItem`, `CheckoutSession`, `CheckoutAddress`, `PaymentIntent`, `FeeBreakdown`, `InventoryReservation`, `Order`, `OrderItem`, `AuditLog`
- API routes: `GET /api/cart`, `POST /api/cart/items`, `PATCH /api/cart/items/:id`, `DELETE /api/cart/items/:id`, `POST /api/checkout/session`, `PATCH /api/checkout/session/:id`, `POST /api/checkout/place-order`
- Frontend views: cart, checkout form, delivery method selector, payment method selector, order summary, checkout error states, confirmation redirect
- Admin views: abandoned checkout monitor, failed payment queue, inventory reservation queue, checkout fraud flags
- Events generated: `cart.item_added`, `cart.item_removed`, `cart.quantity_changed`, `checkout.started`, `payment.intent_created`, `inventory.reserved`, `order.created`, `escrow.hold_requested`
- Wallet/escrow impact: wallet authorization or payment intent is created; escrow hold is requested before order is confirmed; checkout fees become ledger metadata
- Stitch designs that represent it: `unified_checkout_mobile`, `naijapay_payment_method`, `naijadeals_subscription_payment_method`, `naijawallet_with_subscriptions`, `naijadeals_plus_unified_rewards_subscription_hub`, `booking_detail_guest_communication`

## 4. Wallet Ledger

- Build priority: P0 money source of truth
- Purpose: Maintain balances, holds, transactions, refunds, payouts, settlement records, and immutable ledger entries for every money movement.
- Database models: `Wallet`, `WalletAccount`, `LedgerEntry`, `WalletTransaction`, `PaymentMethod`, `PaymentIntent`, `SettlementBatch`, `Payout`, `Refund`, `ReserveAccount`, `AuditLog`
- API routes: `GET /api/wallet`, `GET /api/wallet/ledger`, `POST /api/wallet/top-up-intent`, `GET /api/wallet/transactions`, `POST /api/admin/payouts/:id/approve`, `GET /api/admin/settlements`
- Frontend views: wallet dashboard, ledger history, transaction detail, payment methods, refunds, payouts, escrow holds
- Admin views: settlement console, payout queue, reserves dashboard, failed payment monitor, ledger reconciliation, tax/tariff reports
- Events generated: `wallet.created`, `payment.authorized`, `ledger.entry_posted`, `wallet.debited`, `wallet.credited`, `payout.queued`, `payout.approved`, `refund.posted`, `settlement.reconciled`
- Wallet/escrow impact: this is the source of truth; every escrow hold, refund, payout, fee, reserve, and release must post balanced ledger entries
- Stitch designs that represent it: `ecosystem_smart_wallet_financial_hub`, `naijawallet_dashboard`, `naijawallet_dashboard_mobile`, `ecosystem_settlement_payments_console`, `ecosystem_settlement_driver_payout_command_center`, `global_financials_settlement_dashboard`, `global_wallet_capital_reserves_dashboard_1`, `naijapay_hq_financial_command_center_2`, `naijawallet_multi_currency_settlement_dashboard`, `payouts_financial_reports_dashboard`

## 5. Escrow Lifecycle

- Build priority: P0 trust/money bridge
- Purpose: Hold buyer funds, track release conditions, connect delivery proof and dispute evidence, release or refund funds, and leave a complete audit trail.
- Database models: `EscrowHold`, `EscrowMilestone`, `EscrowRule`, `EscrowEvent`, `EscrowEvidence`, `Order`, `Delivery`, `Dispute`, `LedgerEntry`, `AuditLog`
- API routes: `POST /api/escrow/holds`, `GET /api/escrow/holds/:id`, `POST /api/escrow/holds/:id/milestones`, `POST /api/admin/escrow/:id/release`, `POST /api/admin/escrow/:id/refund`, `POST /api/admin/escrow/:id/reserve`
- Frontend views: escrow badge on checkout/product/order, escrow status panel, proof required panel, refund/release status
- Admin views: escrow queue, release approval, refund approval, evidence review, reserve monitor, high-value hold review
- Events generated: `escrow.hold_created`, `escrow.milestone_met`, `escrow.evidence_attached`, `escrow.release_requested`, `escrow.released`, `escrow.refund_requested`, `escrow.refunded`, `escrow.reserve_created`
- Wallet/escrow impact: buyer balance or payment capture moves into held ledger state; release credits vendor/courier; refund returns buyer funds; reserve blocks release
- Stitch designs that represent it: `cross_border_escrow_high_value_import_negotiation`, `dispute_escrow_trust_command_center`, `premium_escrow_insurance_enrollment`, `merchant_escrow_settlement_dashboard`, `ecosystem_wide_dispute_escalation_command_center`, `global_wallet_capital_reserves_dashboard_2`, `pan_african_banking_cross_border_liquidity`

## 6. Orders Lifecycle

- Build priority: P0 operating transaction
- Purpose: Drive the state machine from order creation through vendor acceptance, fulfillment, delivery, confirmation, dispute window, and completion.
- Database models: `Order`, `OrderItem`, `OrderStatusEvent`, `OrderAssignment`, `VendorOrderQueue`, `CustomerNotification`, `Delivery`, `EscrowHold`, `AuditLog`
- API routes: `GET /api/orders`, `GET /api/orders/:id`, `POST /api/orders/:id/cancel`, `PATCH /api/vendor/orders/:id/status`, `PATCH /api/admin/orders/:id/status`, `GET /api/admin/orders`
- Frontend views: order history, order detail, order confirmation, status timeline, cancel/request help action
- Admin views: orders table, order detail, stuck order monitor, cancellation/refund queue, vendor SLA queue
- Events generated: `order.created`, `order.vendor_notified`, `order.accepted`, `order.preparing`, `order.ready_for_pickup`, `order.in_transit`, `order.delivered`, `order.completed`, `order.cancelled`
- Wallet/escrow impact: order creation creates escrow; cancellation may void hold; completion triggers escrow release eligibility; missed SLA may create refund/dispute reserve
- Stitch designs that represent it: `active_mission_navigator`, `unified_activity_my_missions_tracker`, `unified_activity_live_mission_control`, `customer_command_center_personalized_ecosystem_hub`, `booking_detail_guest_communication`, `ecosystem_admin_dashboard`

## 7. Vendor Operations

- Build priority: P1 after core transaction
- Purpose: Give verified sellers/restaurants/operators a real operating system for catalog, inventory, order handling, fulfillment, analytics, payouts, and support.
- Database models: `Vendor`, `VendorProfile`, `VendorKyc`, `VendorStaff`, `Product`, `InventoryStock`, `VendorOrderQueue`, `FulfillmentPolicy`, `PayoutAccount`, `VendorAnalyticsSnapshot`, `VendorNotification`
- API routes: `GET /api/vendor/dashboard`, `PATCH /api/vendor/profile`, `POST /api/vendor/products`, `PATCH /api/vendor/inventory/:id`, `GET /api/vendor/orders`, `PATCH /api/vendor/orders/:id/status`, `GET /api/vendor/payouts`
- Frontend views: seller OS dashboard, product manager, inventory manager, vendor order queue, payout settings, analytics, support center
- Admin views: vendor approvals, vendor risk score, product audit, payout review, vendor SLA monitor
- Events generated: `vendor.onboarded`, `vendor.verified`, `vendor.profile_updated`, `vendor.product_created`, `inventory.updated`, `vendor.order_accepted`, `vendor.payout_account_updated`, `vendor.sla_breached`
- Wallet/escrow impact: vendor payout account gates release; accepted orders remain in escrow until proof; vendor risk can delay payout or increase reserve
- Stitch designs that represent it: `business_os_multi_service_merchant_command_center`, `merchant_console_ai_powered_commerce_hub`, `merchant_onboarding_step_3_service_pillars`, `merchant_onboarding_verification_success_welcome`, `merchant_profile_verification_settings`, `merchant_payouts_mobile`, `merchant_risk_scoring_dashboard`, `merchant_support_center_dashboard`, `vendor_analytics_dashboard`, `business_profile_service_inventory`

## 8. Logistics / Courier Dispatch

- Build priority: P1 after orders and escrow
- Purpose: Convert order fulfillment into pickup/dropoff missions, assign couriers, monitor capacity, update route state, and trigger delivery proof requirements.
- Database models: `Delivery`, `DeliveryStop`, `Courier`, `CourierShift`, `CourierLocation`, `DispatchOffer`, `DispatchAssignment`, `RoutePlan`, `DeliveryStatusEvent`, `Hub`, `CourierPayout`
- API routes: `POST /api/deliveries`, `GET /api/deliveries/:id`, `POST /api/dispatch/quote`, `POST /api/dispatch/assign`, `PATCH /api/courier/deliveries/:id/status`, `GET /api/admin/deliveries`, `GET /api/admin/dispatch`
- Frontend views: delivery booking, courier assignment status, delivery tracker, courier task view, pickup/dropoff forms
- Admin views: dispatch board, courier registry, delivery exception queue, live route monitor, hub capacity dashboard
- Events generated: `delivery.created`, `dispatch.quote_created`, `dispatch.offer_sent`, `delivery.assigned`, `delivery.pickup_started`, `delivery.picked_up`, `delivery.in_transit`, `delivery.failed`, `delivery.delivered`
- Wallet/escrow impact: courier assignment can add delivery fee; delivery confirmation unlocks escrow release eligibility and courier payout queue
- Stitch designs that represent it: `logistics_dispatch_fulfillment_hub`, `smart_dispatch_driver_assignment_engine`, `incoming_mission_offer`, `fleet_management_driver_registry_hub`, `live_driver_tracking_monitoring_hub`, `cross_border_logistics_tracker`, `public_logistics_transparency_tracker`, `ecosystem_logistics_reporting_dashboard`, `continental_logistics_pipeline_lagos_accra_corridor`, `ai_regional_routing_corridor_intelligence_1`

## 9. QR Proof And Tracking

- Build priority: P1 trust evidence
- Purpose: Capture proof at pickup, handoff, delivery, return, and dispute evidence points; make tracking events auditable.
- Database models: `TrackingEvent`, `ProofArtifact`, `QrToken`, `BarcodeScan`, `Delivery`, `Order`, `EscrowEvidence`, `DisputeEvidence`, `AuditLog`
- API routes: `GET /api/tracking/:missionId`, `POST /api/proof/qr-token`, `POST /api/proof/scan`, `POST /api/proof/upload`, `GET /api/admin/proof/:id`, `PATCH /api/admin/proof/:id/status`
- Frontend views: tracking timeline, QR pickup screen, QR delivery confirmation, proof upload, customer confirmation
- Admin views: proof audit, failed scan queue, evidence viewer, delivery confirmation override, fraud proof review
- Events generated: `qr.token_issued`, `qr.pickup_scanned`, `proof.uploaded`, `delivery.proof_submitted`, `delivery.confirmed`, `escrow.evidence_attached`, `admin.proof_reviewed`
- Wallet/escrow impact: valid delivery proof satisfies escrow release milestone; invalid proof opens reserve/dispute path
- Stitch designs that represent it: `mission_verification_audit_dashboard_hub_audit_terminal`, `video_unboxing_verification_ai_analysis`, `public_logistics_transparency_tracker`, `universal_real_time_ecosystem_tracker`, `active_mission_navigator`, `cross_border_logistics_tracker`, `security_hub_definitive_bio_mat_fix`

## 10. Disputes / Refunds

- Build priority: P1 after proof and escrow
- Purpose: Resolve failed delivery, wrong item, damaged item, late order, fraud, and refund cases using evidence and admin workflow.
- Database models: `Dispute`, `DisputeMessage`, `DisputeEvidence`, `RefundRequest`, `RefundDecision`, `EscrowHold`, `Order`, `Delivery`, `RiskScore`, `AuditLog`
- API routes: `POST /api/disputes`, `GET /api/disputes/:id`, `POST /api/disputes/:id/messages`, `POST /api/disputes/:id/evidence`, `PATCH /api/admin/disputes/:id/status`, `POST /api/admin/refunds/:id/approve`, `POST /api/admin/refunds/:id/reject`
- Frontend views: dispute intake, evidence upload, case timeline, refund request, support handoff
- Admin views: dispute command center, evidence review, refund approval, SLA/escalation queue, fraud-linked cases
- Events generated: `dispute.opened`, `dispute.evidence_added`, `dispute.vendor_response_added`, `refund.requested`, `dispute.escalated`, `refund.approved`, `refund.rejected`, `escrow.refunded`, `escrow.released`
- Wallet/escrow impact: dispute freezes escrow release; approved refund debits escrow hold and credits buyer; rejected refund releases vendor/courier payouts
- Stitch designs that represent it: `dispute_escrow_trust_command_center`, `dispute_resolution_deep_dive_dsp_441`, `ai_powered_dispute_resolution_unboxing_discrepancies`, `cross_border_dispute_resolution_international_handoff_command`, `ecosystem_wide_dispute_escalation_command_center`, `human_agent_handoff_active_session_sd_9921`

## 11. Admin Operations

- Build priority: P0/P1 control plane
- Purpose: Provide operational control over every queue, actor, order, delivery, escrow hold, risk alert, dispute, payout, and audit event.
- Database models: `AdminAction`, `AuditLog`, `ApprovalQueueItem`, `RiskAlert`, `SystemHealthMetric`, `FeatureFlag`, `OperationalNote`, `AdminRole`, plus read access to every core system model
- API routes: `GET /api/admin/dashboard`, `GET /api/admin/audit-logs`, `POST /api/admin/actions`, `GET /api/admin/approvals`, `PATCH /api/admin/approvals/:id`, `GET /api/admin/risk-alerts`, `PATCH /api/admin/feature-flags/:id`, `GET /api/admin/analytics`
- Frontend views: none as customer-facing primary; system status can surface only selected public transparency
- Admin views: control center, users, vendors, orders, deliveries, escrow, disputes, fraud/risk alerts, payouts, analytics, feature flags, audit logs, settings
- Events generated: `admin.action_logged`, `approval.created`, `approval.approved`, `approval.rejected`, `risk.alert_acknowledged`, `feature_flag.changed`, `system.health_changed`
- Wallet/escrow impact: admin actions can approve release/refund/payout/reserve; every such action must create ledger entries and audit logs
- Stitch designs that represent it: `admin_terminal_ecosystem_oversight_verification`, `ecosystem_admin_dashboard`, `fraud_security_command_center`, `compliance_audit_logs`, `compliance_policy_manager`, `ecosystem_feature_kill_switch_lifecycle_control`, `ecosystem_api_health_developer_dashboard`, `universal_ecosystem_health_real_time_uptime_dashboard`, `mission_verification_audit_dashboard_hub_audit_terminal`, `senior_admin_escalation_workflow`

## 12. Aura AI Support Layer

- Build priority: P2 after deterministic systems exist
- Purpose: Add AI assistance on top of real system data for recommendations, support triage, fraud/risk explanations, vendor guidance, courier assignment suggestions, and admin summarization.
- Database models: `AiConversation`, `AiMessage`, `AiToolCall`, `AiRecommendation`, `AiRiskAssessment`, `AiDispatchSuggestion`, `AiSupportTicket`, `AiFeedback`, `AiPolicy`, `AiAuditLog`
- API routes: `POST /api/aura/chat`, `GET /api/aura/conversations`, `POST /api/aura/recommendations`, `POST /api/aura/risk-score`, `POST /api/aura/dispatch-suggestion`, `POST /api/admin/ai/feedback`, `GET /api/admin/ai/audit`
- Frontend views: Aura chat, customer support assistant, product recommendation rail, order help assistant, vendor assistant, courier assistant
- Admin views: AI monitoring, model feedback, risk score review, support handoff, recommendation performance, policy/governance logs
- Events generated: `ai.conversation_started`, `ai.message_created`, `ai.tool_called`, `ai.recommendation_created`, `ai.risk_scored`, `ai.dispatch_suggested`, `ai.handoff_requested`, `ai.feedback_recorded`
- Wallet/escrow impact: AI cannot directly move money; it may recommend risk reserve, refund path, dispatch assignment, or support escalation, but wallet/escrow mutations require deterministic API/admin action
- Stitch designs that represent it: `aura_ai_concierge_hub`, `aura_ai_consumer_chat_interface`, `mobile_aura_chat_interface`, `naija_ai_personal_ecosystem_concierge`, `naijadeals_brain_ai_recommendation_engine`, `naijadeals_brain_naijasend_courier_assignment_logic`, `naijadeals_brain_merchant_risk_scoring_integrity_hub`, `naijadeals_ai_powered_customer_support_hub`, `naijadeals_ai_powered_merchant_support_hub`, `ai_training_data_governance_dashboard`

## Implementation Rule

No view is complete unless its backing system can create or read real records, emit events, update audit logs, and show the same state consistently across customer, vendor, wallet, logistics, and admin surfaces.
