# Stitch Utilization Audit

Source folder: `D:\stitch_naijadeals_super_ecosystem`

## Scan Summary

- Total design folders scanned: 414
- HTML screens with code.html: 381
- Folders with screen.png: 407
- Design-only folders: 7
- Explicitly used in current Phase 6 route mapping: 32
- Still unused or deferred: 382

## Brutal Finding

The prior app did not use the full Stitch library. It reused a few source images and broad visual ideas, but most routes were generic reconstructed shells. Phase 6 maps major routes to actual Stitch source screens and embeds those source screens into the UI, while preserving the existing local functional flows. This is still not a full pixel-perfect extraction of all 381 HTML screens.

## Route To Stitch Mapping

| App route | Stitch source screens |
| --- | --- |
| / | customer_command_center_personalized_ecosystem_hub; naijashop_marketplace; naijaeats_home_hub; naijasend_logistics_dashboard; naijapay_consumer_wallet_home |
| /ecosystem-hub | customer_command_center_personalized_ecosystem_hub; aura_ai_concierge_hub |
| /search | universal_search_ai_discovery_hub_1; universal_search_toyota_camry_results |
| /categories | universal_search_ai_discovery_hub_1; naijashop_marketplace; naijaeats_home_hub |
| /product-listing | naijashop_marketplace; universal_search_toyota_camry_results |
| /product/[id] | naijashop_marketplace; mama_cass_restaurant_detail for food detail pattern |
| /cart | unified_checkout_mobile; naijapay_consumer_wallet_home |
| /checkout | unified_checkout_mobile; naijapay_consumer_wallet_home |
| /orders | active_mission_navigator; public_logistics_transparency_tracker |
| /wallet and /payments | naijapay_consumer_wallet_home; naijawallet_dashboard; naijawallet_dashboard_mobile |
| /naijashop | naijashop_marketplace; naijashop_marketplace_mobile |
| /naijaeats | naijaeats_home_hub; naijaeats_home_hub_mobile; mama_cass_restaurant_detail |
| /naijasend and /shipping | naijasend_logistics_dashboard; logistics_dispatch_fulfillment_hub; public_logistics_transparency_tracker |
| /tracking/[id] | active_mission_navigator; public_logistics_transparency_tracker; cross_border_logistics_tracker |
| /admin | ecosystem_admin_dashboard; admin_terminal_ecosystem_oversight_verification; fraud_security_command_center; smart_dispatch_driver_assignment_engine |
| /returns | dispute_escrow_trust_command_center |
| /aura-ai and /help | aura_ai_concierge_hub; aura_ai_consumer_chat_interface; mobile_aura_chat_interface |
| /business/[vertical] | merchant_console_ai_powered_commerce_hub; business_os_multi_service_merchant_command_center |
| /onboarding/[type] | merchant_onboarding_step_1_identity; step_2_business_profile; step_3_service_pillars; step_4_payouts_completion; verification_success_welcome |

## Strongest Screens That Must Become Real App Pages

- `naijashop_marketplace`: primary NaijaShop browse/product-listing structure with market mode, vendor trust, and search.
- `naijaeats_home_hub` and `mama_cass_restaurant_detail`: food ordering, restaurant detail, location/search, and kitchen/rider readiness.
- `naijasend_logistics_dashboard`, `logistics_dispatch_fulfillment_hub`, `public_logistics_transparency_tracker`: dispatch, courier tracking, pickup/delivery proof.
- `naijapay_consumer_wallet_home`, `naijawallet_dashboard`, `unified_checkout_mobile`: wallet balance, checkout, transactions, escrow.
- `ecosystem_admin_dashboard`, `admin_terminal_ecosystem_oversight_verification`, `fraud_security_command_center`: admin command center and risk operations.
- `merchant_onboarding_step_*`: onboarding sequence for KYC, business profile, service pillars, payout, and success states.
- `aura_ai_concierge_hub`, `aura_ai_consumer_chat_interface`: AI support and commerce concierge.

## Repeated UI Patterns Identified

- Headers: sticky top app bars with NaijaDeals/vertical logo, search, wallet, language, account, notification actions.
- Bottom navs: mobile-first five-item navs with Home/Search/Orders/Wallet/Account or vertical equivalents.
- Cards: rounded 8-12px product, restaurant, wallet, mission, admin metric, and risk cards.
- Marketplace grids: search bar, category chips, horizontal rails, market-mode hero, trust badges, listing grid.
- Admin widgets: side navigation, command terminal header, metric strips, queue tables, alert cards, AI/risk panels.
- AI panels: shimmer/assistant cards, prompt chips, recommendation rows, support handoff cards.
- Wallet panels: balance card, transaction rows, escrow status, payout/reserve cards.
- Onboarding forms: step cards, KYC document rows, payout completion, verification success.

## Component Extraction Plan

1. `StitchSourceBanner`: route-level source declaration with screenshot frame.
2. `StitchSourceRail`: exact source cards per route.
3. `StitchPatternStrip`: extracted pattern notes from mapped screens.
4. Next extraction pass: convert each mapped HTML layout into React sections instead of only screenshot-backed references.
5. Preserve functional local flows while replacing generic shells with Stitch-derived product structures.

## Ignored Designs

The following 349 HTML screens were not explicitly used before/within Phase 6 and must either be merged, deferred, or discarded after review:

- ai_dispatch_security_command_center
- ai_document_authentication_cross_border_compliance
- ai_driven_predictive_maintenance_fleet_resilience
- ai_fraud_sentry_cross_border_payment_audit
- ai_fraud_sentry_real_time_transaction_audit
- ai_logistics_resolution_templates_management
- ai_membership_engine_personalized_upgrade_triggers
- ai_powered_dispute_resolution_unboxing_discrepancies
- ai_regional_localization_language_control
- ai_regional_routing_corridor_intelligence_1
- ai_regional_routing_corridor_intelligence_2
- ai_threat_assessment_tuner
- ai_training_data_governance_dashboard
- ai_travel_concierge_mobile_assistant
- api_documentation_portal
- aura_ai_local_market_intelligence_mobile
- aura_ai_training_feedback_governance
- aviation_authority_operator_fleet_command
- aviation_authority_operator_verification_console
- booking_detail_guest_communication
- burna_vibes_artist_profile
- business_profile_service_inventory
- compliance_audit_logs
- compliance_policy_manager
- conformit_r_glementaire_r_gionale_portail_francophone
- continental_logistics_pipeline_lagos_accra_corridor
- corporate_subscription_enterprise_controls
- corridor_personnel_onboarding_vetting_hub
- creator_channel_experience
- creator_royalties_tax_reporting_francophone
- cross_border_dispute_resolution_international_handoff_command
- cross_border_escrow_high_value_import_negotiation
- customer_messaging_center
- data_sovereignty_technical_specifications
- developer_portal_app_submission_step_1
- disaster_recovery_simulation_audit_stress_test
- discussion_thread_lagos_rainy_season_logistics
- dispute_resolution_deep_dive_dsp_441
- driver_compliance_registry_dashboard
- ecosystem_ai_ethics_automated_settlement_audit_1
- ecosystem_ai_ethics_automated_settlement_audit_2
- ecosystem_ai_ethics_bias_monitor
- ecosystem_analytics_growth_dashboard
- ecosystem_api_health_developer_dashboard
- ecosystem_coverage_matrix_dashboard
- ecosystem_engine_core_infrastructure_hub
- ecosystem_feature_kill_switch_lifecycle_control
- ecosystem_growth_global_ad_network_dashboard
- ecosystem_infrastructure_scaling_roadmap
- ecosystem_logistics_reporting_dashboard
- ecosystem_marketing_campaign_manager
- ecosystem_notification_engagement_control
- ecosystem_personnel_training_certification_hub
- ecosystem_settlement_driver_payout_command_center
- ecosystem_settlement_payments_console
- ecosystem_smart_wallet_financial_hub
- ecosystem_tax_tariff_settlement_console
- ecosystem_wide_dispute_escalation_command_center
- ecosystem_wide_personnel_retention_intelligence
- ecosystem_wide_sustainability_green_energy_report
- elite_rewards_redemption_catalog
- emergency_law_enforcement_handoff_workflow
- executive_fleet_resilience_predictive_maintenance_command
- executive_security_dispatch_tactical_command
- executive_security_protocols_high_risk_route_management
- executive_video_kyc_biometric_enrollment
- fleet_management_driver_registry_hub
- francophone_logistics_corridor_intelligence
- gabon_personnel_training_certification_hub
- gabon_regional_facility_maintenance_asset_health_hub
- gabon_regional_hub_security_deployment
- global_ad_network_manager_dashboard
- global_business_verification_system
- global_expansion_roadmap_strategic_command_center
- global_financials_settlement_dashboard
- global_wallet_capital_reserves_dashboard_1
- global_wallet_capital_reserves_dashboard_2
- high_value_asset_tracking_security_corridor
- human_agent_handoff_active_session_sd_9921
- identity_verification_kyc
- incoming_mission_offer
- live_driver_tracking_monitoring_hub
- mastering_the_art_of_bargaining_course_detail
- merchant_academy_catalog
- merchant_certification_logistics_achievements
- merchant_certification_trust_center
- merchant_community_forum
- merchant_escrow_settlement_dashboard
- merchant_global_listing_ai_translation_hub
- merchant_knowledge_base_hub
- merchant_logistics_marketing_suite
- merchant_payouts_mobile
- merchant_profile_verification_settings
- merchant_risk_scoring_dashboard
- merchant_support_center_dashboard
- mission_verification_audit_dashboard_hub_audit_terminal
- mobile_language_selection_hub
- music_podcast_marketplace
- naija_ai_personal_ecosystem_concierge
- naijaagro_ai_harvest_forecasting_yield_intelligence
- naijaagro_consumer_produce_marketplace
- naijaagro_heavy_equipment_fleet_rental_management
- naijaagro_institutional_credit_risk_assessment_hub
- naijaagro_institutional_infrastructure_command
- naijaagro_regional_hub_emergency_deployment_command
- naijaagro_regional_hub_inventory_fertilizer_inventory_management
- naijaagroequipment_heavy_fleet_rental_command
- naijaagrofarm_institutional_yield_grain_reserve_hub
- naijaagrofish_ai_price_intelligence_demand_forecasting
- naijaagrofish_consumer_fresh_fish_marketplace
- naijaagrofish_expanded_fresh_fish_marketplace
- naijaagrofish_fish_processing_export_command
- naijaagrofish_industrial_trading_cold_chain_command
- naijaagrofish_institutional_hub_cold_chain_command
- naijaagrofish_market_demand_import_intelligence
- naijaagroinputs_strategic_reserve_distribution_hub
- naijaagrolivestock_institutional_command_health_hub
- naijacontractor_institutional_trade_registry_command_hub_command_hub_command
- naijadeals_ai_powered_customer_support_hub
- naijadeals_ai_powered_merchant_support_hub
- naijadeals_ai_tariff_control_corridor_economics_1
- naijadeals_ai_tariff_control_corridor_economics_2
- naijadeals_brain_ai_intelligence_insights
- naijadeals_brain_ai_powered_forecasting_hub
- naijadeals_brain_ai_predictions_dashboard
- naijadeals_brain_ai_recommendation_engine
- naijadeals_brain_ai_tariff_control_corridor_optimization
- naijadeals_brain_ai_tariff_parameter_configuration
- naijadeals_brain_algorithm_ai_engine_console
- naijadeals_brain_algorithm_engine_command
- naijadeals_brain_dynamic_pricing_economic_parity
- naijadeals_brain_ecosystem_analytics_ai_insights
- naijadeals_brain_matching_logic_configuration
- naijadeals_brain_merchant_risk_scoring_integrity_hub
- naijadeals_brain_naijasend_courier_assignment_logic
- naijadeals_brain_product_scoring_algorithm
- naijadeals_brain_ranking_engine_configuration
- naijadeals_brain_reputation_fraud_sentry
- naijadeals_brain_reputation_hidden_trust_engine
- naijadeals_brain_search_core_configuration
- naijadeals_brain_search_ranking_revenue_optimization
- naijadeals_brain_universal_search_indexing_hub
- naijadeals_brain_universal_supply_chain_visualization
- naijadeals_brain_universal_user_loyalty_gamification_engine
- naijadeals_ecosystem_reputation_hidden_trust_engine
- naijadeals_home_hub
- naijadeals_home_hub_mobile
- naijadeals_institutional_audit_security_ledger
- naijadeals_investor_stakeholder_transparency_dashboard
- naijadeals_master_ecosystem_user_journey_1
- naijadeals_master_ecosystem_user_journey_2
- naijadeals_master_ecosystem_user_journey_3
- naijadeals_plus_unified_rewards_subscription_hub
- naijadeals_proactive_ai_home_hub
- naijadeals_proof_of_delivery_scan_ledger
- naijadeals_root_administration_terminal
- naijadeals_subscription_confirmation
- naijadeals_subscription_payment_method
- naijadeals_subscription_select_plan
- naijadrive_admin_dashboard
- naijadrive_book_a_ride
- naijadrive_cultural_analytics_protocol_audit
- naijadrive_dispatch_engine_regional_fleet_dashboard
- naijadrive_driver_command_center
- naijadrive_driver_tracking
- naijadrive_dynamic_surge_pricing_economics
- naijadrive_economic_command_center
- naijadrive_executive_booking_experience
- naijadrive_fare_breakdown_schedule
- naijadrive_mobility_hub
- naijadrive_super_luxury_chauffeur_protocol_manager
- naijadrive_vehicle_selection
- naijaeats_delivery_priority_dispatch_logic
- naijaeats_performance_deep_dive
- naijaeats_restaurant_operations_center
- naijaelite_executive_command_center
- naijaescrow_admin_command_center
- naijagigs_freelancer_profile
- naijagigs_marketplace
- naijagigs_multi_language_agreement_hub
- naijagigs_professional_service_escrow_command
- naijagigs_talent_matching_algorithm_control
- naijago_driver_command_center
- naijago_driver_earnings_subscription
- naijago_driver_home
- naijago_driver_mission_control_mobile
- naijahealth_clinical_insurance_authority_hub
- naijajobs_institutional_recruitment_vetting_hub
- naijapay_cross_border_remittance_corridor_pipeline
- naijapay_crypto_liquidity_remittance_hub
- naijapay_global_wallet_capital_reserves_dashboard
- naijapay_hq_financial_command_center_1
- naijapay_hq_financial_command_center_2
- naijapay_multi_country_bill_payment_settlement_hub
- naijaprime_business_corporate_loyalty_management
- naijaprime_corporate_expense_enterprise_financial_hub
- naijaprime_ecosystem_operations_commission_control
- naijaprime_membership_profiles
- naijaprime_membership_rewards_hub
- naijaproperty_real_estate_registry_sales_authority
- naijasend_admin_dashboard
- naijasend_cross_border_pipeline_handoffs
- naijashop_advanced_ai_crm_automation_triggers
- naijashop_ai_driven_customer_lifetime_value_clv_intelligence
- naijashop_ai_powered_crm_customer_intelligence
- naijashop_ai_powered_supply_chain_inventory
- naijashop_bulk_order_ai_negotiation_hub
- naijashop_competitive_intelligence_growth_analytics
- naijashop_global_settlement_cross_border_payouts
- naijashop_inventory_management
- naijashop_marketplace_master_command_hub
- naijashop_merchant_ai_intelligence_command_center
- naijashop_merchant_dashboard
- naijashop_merchant_hub_mobile
- naijashop_performance_deep_dive
- naijastay_add_property_basic_info
- naijastay_add_property_infrastructure
- naijastay_add_property_location_neighborhood
- naijastay_add_property_photos
- naijastay_add_property_pricing_payouts
- naijastay_add_property_review
- naijastay_enhanced_property_audit_rigorous_kyc
- naijastay_host_analytics_dashboard
- naijastay_hotel_occupancy_guest_command_center
- naijastay_international_payouts_tax_french
- naijastay_merchant_dashboard
- naijastay_property_detail_mobile
- naijastay_property_ranking_logic_tuner
- naijastay_property_verification_admin_console
- naijastay_search
- naijastay_search_mobile
- naijastream_advanced_moderation_safety_hub
- naijastream_audience_deep_dive
- naijastream_content_licensing_rights_management
- naijastream_content_licensing_rights_management_portal
- naijastream_creator_monetization_royalties
- naijastream_creator_portal
- naijastream_creator_studio
- naijastream_entertainment_hub
- naijastream_francophone_media_rights_dynamic_pricing
- naijastream_home_hub
- naijastream_live_moderation_safety_console
- naijastream_watch_next_recommendation_engine
- naijatravel_ai_concierge_trip_builder
- naijatravel_concierge_executive_mobile_home
- naijatravel_corporate_billing_invoicing_suite
- naijatravel_corporate_travel_management_console
- naijatravel_elite_circle_loyalty_rewards_dashboard
- naijatravel_empty_leg_opportunities
- naijatravel_helicopter_charter_offshore_logistics
- naijatravel_helicopter_dispatch_offshore_logistics_hub
- naijatravel_multi_modal_search_hub_1
- naijatravel_multi_modal_search_hub_2
- naijatravel_private_jet_helicopter_marketplace
- naijatravel_private_jet_marketplace
- naijatravel_unified_executive_trip_builder
- naijautilities_consumer_home_hub
- naijautilities_institutional_infrastructure_command
- naijautilities_pay_electricity_bill
- naijautilities_payment_success_receipt
- naijawallet_multi_country_tax_settlement_engine
- naijawallet_multi_currency_settlement_dashboard
- naijawallet_with_subscriptions
- naijawholesale_institutional_procurement_supplier_hub
- pan_african_banking_cross_border_liquidity
- pan_african_fiscal_tax_authority_console
- pan_african_identity_authority_console
- pan_african_logistics_network_real_time_fleet_health
- pan_african_logistics_predictive_asset_tracking
- pan_african_logistics_settlement_multi_currency_hub
- pan_african_multi_currency_settlement_console
- pan_african_multi_currency_tariff_settlement_console_1
- pan_african_multi_currency_tariff_settlement_console_2
- pan_african_personnel_vetting_security_hub_1
- pan_african_personnel_vetting_security_hub_final_layout_fix
- pan_african_personnel_vetting_security_hub_layout_fix
- pan_african_personnel_vetting_security_hub_optimized_layout_1
- pan_african_personnel_vetting_security_hub_optimized_layout_2
- pan_african_personnel_vetting_security_hub_optimized_layout_3
- pan_african_regulatory_archive_compliance_vault
- payment_security_biometric_transfer_approval
- payout_configuration_final_review
- payouts_financial_reports_dashboard
- personnel_onboarding_vetting_workflow
- personnel_training_certification_hub
- predictive_logistics_analytics_congestion_control
- premium_escrow_insurance_enrollment
- prime_business_gestion_des_d_penses_french
- prime_family_shared_wallet_member_controls
- public_transparency_trust_dashboard
- public_transparency_trust_portal
- regional_activation_multi_country_command_center_1
- regional_activation_multi_country_command_center_2
- regional_activation_multi_country_command_center_3
- regional_ad_network_revenue_share_settlement
- regional_ad_network_targeting_hyper_local_market_insights
- regional_hub_disaster_recovery_resilience_console_1
- regional_hub_disaster_recovery_resilience_console_2
- regional_hub_disaster_recovery_resilience_console_3
- regional_hub_disaster_recovery_resilience_console_recovery_resilience_dashboard
- regional_hub_disaster_recovery_resilience_dashboard
- regional_hub_emergency_protocols_gabon_sector
- regional_hub_emergency_tactical_deployment
- regional_hub_facility_maintenance_asset_health_dashboard
- regional_hub_infrastructure_reporting
- regional_hub_logistics_capacity_planner
- regional_hub_maintenance_solar_power_reporting
- regional_hub_personnel_training_certification_hub_1
- regional_hub_personnel_training_certification_hub_2
- regional_hub_personnel_training_management
- regional_hub_security_deployment_asset_protection_1
- regional_hub_security_deployment_asset_protection_2
- regional_infrastructure_deployment_map
- regional_localization_cultural_adaptation_hub
- regional_logistics_hub_management
- regional_partner_payout_logistics_settlement_automation
- regional_partner_payout_revenue_share
- regional_regulatory_compliance_dashboard
- regional_regulatory_compliance_sovereignty_portal_1
- regional_regulatory_compliance_sovereignty_portal_2
- regional_rights_access_control_console
- regional_solar_hub_ai_predictive_maintenance_hub
- regional_solar_hub_infrastructure_profiling_hub
- regional_solar_hub_maintenance_ai_resilience_schedule_1
- regional_solar_hub_maintenance_ai_resilience_schedule_2
- regional_solar_hub_maintenance_command_center_1
- regional_solar_hub_maintenance_command_center_2
- regional_solar_hub_maintenance_schedule_1
- regional_solar_hub_maintenance_schedule_2
- regional_supplier_vetting_kyc_hub
- security_governance_portal_master_detail_audit_view
- security_hub_definitive_bio_mat_fix
- security_hub_definitive_bio_mat_fix_v2
- security_hub_professional_layout_restoration
- senior_admin_escalation_workflow
- solar_hub_maintenance_flexible_monitoring_view
- unified_activity_live_mission_control
- unified_activity_my_missions_tracker
- universal_ecosystem_health_real_time_uptime_dashboard
- universal_real_time_ecosystem_tracker
- universal_search_ai_discovery_hub_2
- user_acquisition_retention_dashboard
- vendor_analytics_dashboard
- video_kyc_high_risk_executive_onboarding
- video_kyc_high_risk_merchant_verification
- video_kyc_high_risk_regional_onboarding
- video_unboxing_verification_ai_analysis
- wholesale_bulk_order_marketplace
- workforce_retention_intelligence_dashboard

## Every Stitch Folder Utilization Table

| File/folder name | Screen represented | Used now? | Current route/component | Missing | Action |
| --- | --- | --- | --- | --- | --- |
| 2026_06_02_23_27_44_nvidia_geforce_overlay.png | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| a_set_of_3_flat_professional_vector_badges_for_a_logistics_merchant._1._a | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| active_mission_navigator | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | yes | /tracking/[id] timeline/navigation | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| admin_terminal_ecosystem_oversight_verification | Admin, super admin, risk, security, compliance, or governance screen | yes | /admin command terminal | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| ai_dispatch_security_command_center | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ai_document_authentication_cross_border_compliance | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ai_driven_predictive_maintenance_fleet_resilience | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ai_fraud_sentry_cross_border_payment_audit | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ai_fraud_sentry_real_time_transaction_audit | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ai_logistics_resolution_templates_management | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ai_membership_engine_personalized_upgrade_triggers | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ai_powered_dispute_resolution_unboxing_discrepancies | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ai_regional_localization_language_control | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| ai_regional_routing_corridor_intelligence_1 | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| ai_regional_routing_corridor_intelligence_2 | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| ai_threat_assessment_tuner | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ai_training_data_governance_dashboard | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ai_travel_concierge_mobile_assistant | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| api_documentation_portal | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| aura_ai_concierge_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | yes | /aura-ai | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| aura_ai_consumer_chat_interface | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | yes | /help and /aura-ai | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| aura_ai_local_market_intelligence_mobile | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| aura_ai_training_feedback_governance | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| aviation_authority_operator_fleet_command | Dashboard or command screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| aviation_authority_operator_verification_console | Supporting ecosystem screen or reference visual | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| booking_detail_guest_communication | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| burna_vibes_artist_profile | Creator, media, streaming, royalties, or entertainment screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| business_os_multi_service_merchant_command_center | Vendor/business operating system or merchant onboarding screen | yes | /business/* | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| business_profile_service_inventory | Vendor/business operating system or merchant onboarding screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| compliance_audit_logs | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| compliance_policy_manager | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| conformit_r_glementaire_r_gionale_portail_francophone | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| continental_governance | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| continental_logistics_pipeline_lagos_accra_corridor | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| continental_oversight | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| corporate_subscription_enterprise_controls | Dashboard or command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| corridor_personnel_onboarding_vetting_hub | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| creator_channel_experience | Creator, media, streaming, royalties, or entertainment screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| creator_royalties_tax_reporting_francophone | Creator, media, streaming, royalties, or entertainment screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| cross_border_dispute_resolution_international_handoff_command | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| cross_border_escrow_high_value_import_negotiation | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| cross_border_logistics_tracker | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | yes | /tracking/[id] source rail | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| customer_command_center_personalized_ecosystem_hub | Dashboard or command screen | yes | / and /ecosystem-hub via Stitch hero/source panel | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| customer_messaging_center | Dashboard or command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| data_sovereignty_technical_specifications | Dashboard or command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| developer_portal_app_submission_step_1 | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| digital_operating_system_for_african_life | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| digital_operating_system_for_logistics | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| disaster_recovery_simulation_audit_stress_test | Dashboard or command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| discussion_thread_lagos_rainy_season_logistics | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| dispute_escrow_trust_command_center | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | yes | /returns and admin disputes | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| dispute_resolution_deep_dive_dsp_441 | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| driver_compliance_registry_dashboard | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ecosystem_admin_dashboard | Admin, super admin, risk, security, compliance, or governance screen | yes | /admin overview | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| ecosystem_ai_ethics_automated_settlement_audit_1 | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ecosystem_ai_ethics_automated_settlement_audit_2 | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ecosystem_ai_ethics_bias_monitor | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ecosystem_analytics_growth_dashboard | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ecosystem_api_health_developer_dashboard | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ecosystem_coverage_matrix_dashboard | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ecosystem_engine_core_infrastructure_hub | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ecosystem_feature_kill_switch_lifecycle_control | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ecosystem_growth_global_ad_network_dashboard | Dashboard or command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ecosystem_infrastructure_scaling_roadmap | Dashboard or command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ecosystem_logistics_reporting_dashboard | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ecosystem_marketing_campaign_manager | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ecosystem_notification_engagement_control | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ecosystem_personnel_training_certification_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ecosystem_settlement_driver_payout_command_center | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ecosystem_settlement_payments_console | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ecosystem_smart_wallet_financial_hub | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ecosystem_tax_tariff_settlement_console | Dashboard or command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ecosystem_wide_dispute_escalation_command_center | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ecosystem_wide_personnel_retention_intelligence | Dashboard or command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ecosystem_wide_sustainability_green_energy_report | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| elite_rewards_redemption_catalog | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| emerald_velocity | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| emergency_law_enforcement_handoff_workflow | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| executive_fleet_resilience_predictive_maintenance_command | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| executive_security_dispatch_tactical_command | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| executive_security_protocols_high_risk_route_management | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| executive_video_kyc_biometric_enrollment | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| fleet_management_driver_registry_hub | Ride, driver, fleet, mobility, or driver compliance screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| francophone_logistics_corridor_intelligence | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| fraud_security_command_center | Admin, super admin, risk, security, compliance, or governance screen | yes | /admin risk widgets | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| gabon_personnel_training_certification_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| gabon_regional_facility_maintenance_asset_health_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| gabon_regional_hub_security_deployment | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| global_ad_network_manager_dashboard | Dashboard or command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| global_business_verification_system | Vendor/business operating system or merchant onboarding screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| global_expansion_roadmap_strategic_command_center | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| global_financials_settlement_dashboard | Dashboard or command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| global_wallet_capital_reserves_dashboard_1 | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| global_wallet_capital_reserves_dashboard_2 | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| high_value_asset_tracking_security_corridor | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| human_agent_handoff_active_session_sd_9921 | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| identity_verification_kyc | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| incoming_mission_offer | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| kinetic_emerald | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| live_driver_tracking_monitoring_hub | Ride, driver, fleet, mobility, or driver compliance screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| logistics_dispatch_fulfillment_hub | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | yes | /naijasend dispatch panel | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| mama_cass_restaurant_detail | NaijaEats food ordering, restaurant detail, dispatch, or operations screen | yes | /naijaeats and restaurant detail inspiration | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| mastering_the_art_of_bargaining_course_detail | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| merchant_academy_catalog | Vendor/business operating system or merchant onboarding screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| merchant_certification_logistics_achievements | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| merchant_certification_trust_center | Vendor/business operating system or merchant onboarding screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| merchant_community_forum | Vendor/business operating system or merchant onboarding screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| merchant_console_ai_powered_commerce_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | yes | /business/shop and vendor console inspiration | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| merchant_escrow_settlement_dashboard | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| merchant_global_listing_ai_translation_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| merchant_knowledge_base_hub | Vendor/business operating system or merchant onboarding screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| merchant_logistics_marketing_suite | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| merchant_onboarding_step_1_identity | Vendor/business operating system or merchant onboarding screen | yes | /onboarding/[type] source sequence | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| merchant_onboarding_step_2_business_profile | Vendor/business operating system or merchant onboarding screen | yes | /onboarding/[type] source sequence | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| merchant_onboarding_step_3_service_pillars | Vendor/business operating system or merchant onboarding screen | yes | /onboarding/[type] source sequence | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| merchant_onboarding_step_4_payouts_completion | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | yes | /onboarding/[type] source sequence | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| merchant_onboarding_verification_success_welcome | Vendor/business operating system or merchant onboarding screen | yes | /onboarding/[type] source sequence | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| merchant_payouts_mobile | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| merchant_profile_verification_settings | Vendor/business operating system or merchant onboarding screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| merchant_risk_scoring_dashboard | Vendor/business operating system or merchant onboarding screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| merchant_support_center_dashboard | Vendor/business operating system or merchant onboarding screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| mission_verification_audit_dashboard_hub_audit_terminal | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| mobile_aura_chat_interface | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | yes | mobile Aura source panel | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| mobile_language_selection_hub | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| music_podcast_marketplace | Creator, media, streaming, royalties, or entertainment screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naija_ai_personal_ecosystem_concierge | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijaagro_ai_harvest_forecasting_yield_intelligence | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijaagro_consumer_produce_marketplace | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijaagro_heavy_equipment_fleet_rental_management | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijaagro_institutional_credit_risk_assessment_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijaagro_institutional_infrastructure_command | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijaagro_regional_hub_emergency_deployment_command | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijaagro_regional_hub_inventory_fertilizer_inventory_management | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijaagroequipment_heavy_fleet_rental_command | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijaagrofarm_institutional_yield_grain_reserve_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijaagrofish_ai_price_intelligence_demand_forecasting | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijaagrofish_consumer_fresh_fish_marketplace | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijaagrofish_expanded_fresh_fish_marketplace | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijaagrofish_fish_processing_export_command | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijaagrofish_industrial_trading_cold_chain_command | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijaagrofish_institutional_hub_cold_chain_command | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijaagrofish_market_demand_import_intelligence | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijaagroinputs_strategic_reserve_distribution_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijaagrolivestock_institutional_command_health_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijacontractor_institutional_trade_registry_command_hub_command_hub_command | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_ai_powered_customer_support_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_ai_powered_merchant_support_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_ai_tariff_control_corridor_economics_1 | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_ai_tariff_control_corridor_economics_2 | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_brain_ai_intelligence_insights | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_brain_ai_powered_forecasting_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_brain_ai_predictions_dashboard | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_brain_ai_recommendation_engine | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_brain_ai_tariff_control_corridor_optimization | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_brain_ai_tariff_parameter_configuration | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_brain_algorithm_ai_engine_console | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_brain_algorithm_engine_command | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_brain_dynamic_pricing_economic_parity | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_brain_ecosystem_analytics_ai_insights | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_brain_matching_logic_configuration | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_brain_merchant_risk_scoring_integrity_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_brain_naijasend_courier_assignment_logic | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| naijadeals_brain_product_scoring_algorithm | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_brain_ranking_engine_configuration | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_brain_reputation_fraud_sentry | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_brain_reputation_hidden_trust_engine | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_brain_search_core_configuration | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_brain_search_ranking_revenue_optimization | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_brain_universal_search_indexing_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| naijadeals_brain_universal_supply_chain_visualization | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_brain_universal_user_loyalty_gamification_engine | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_ecosystem_reputation_hidden_trust_engine | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_home_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_home_hub_mobile | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_institutional_audit_security_ledger | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_investor_stakeholder_transparency_dashboard | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_master_ecosystem_user_journey_1 | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_master_ecosystem_user_journey_2 | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_master_ecosystem_user_journey_3 | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_plus_unified_rewards_subscription_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_proactive_ai_home_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_proof_of_delivery_scan_ledger | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_root_administration_terminal | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_subscription_confirmation | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_subscription_payment_method | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadeals_subscription_select_plan | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijadrive_admin_dashboard | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijadrive_book_a_ride | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijadrive_cultural_analytics_protocol_audit | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijadrive_dispatch_engine_regional_fleet_dashboard | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijadrive_driver_command_center | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijadrive_driver_tracking | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijadrive_dynamic_surge_pricing_economics | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijadrive_economic_command_center | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijadrive_executive_booking_experience | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijadrive_fare_breakdown_schedule | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijadrive_mobility_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijadrive_super_luxury_chauffeur_protocol_manager | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijadrive_vehicle_selection | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijaeats_delivery_priority_dispatch_logic | NaijaEats food ordering, restaurant detail, dispatch, or operations screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| naijaeats_home_hub | NaijaEats food ordering, restaurant detail, dispatch, or operations screen | yes | /naijaeats and restaurant ordering panels | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| naijaeats_home_hub_mobile | NaijaEats food ordering, restaurant detail, dispatch, or operations screen | yes | mobile eats source panel | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| naijaeats_performance_deep_dive | NaijaEats food ordering, restaurant detail, dispatch, or operations screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| naijaeats_restaurant_operations_center | NaijaEats food ordering, restaurant detail, dispatch, or operations screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| naijaelite_executive_command_center | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijaescrow_admin_command_center | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijagigs_freelancer_profile | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijagigs_marketplace | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijagigs_multi_language_agreement_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijagigs_professional_service_escrow_command | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijagigs_talent_matching_algorithm_control | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijago_driver_command_center | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijago_driver_earnings_subscription | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijago_driver_home | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijago_driver_mission_control_mobile | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijahealth_clinical_insurance_authority_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijajobs_institutional_recruitment_vetting_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijapay_consumer_wallet_home | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | yes | /wallet and /payments | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| naijapay_cross_border_remittance_corridor_pipeline | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| naijapay_crypto_liquidity_remittance_hub | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| naijapay_global_wallet_capital_reserves_dashboard | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| naijapay_hq_financial_command_center_1 | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| naijapay_hq_financial_command_center_2 | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| naijapay_multi_country_bill_payment_settlement_hub | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| naijaprime_business_corporate_loyalty_management | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijaprime_corporate_expense_enterprise_financial_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijaprime_ecosystem_operations_commission_control | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijaprime_membership_profiles | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijaprime_membership_rewards_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijaproperty_real_estate_registry_sales_authority | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| naijasend_admin_dashboard | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| naijasend_cross_border_pipeline_handoffs | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| naijasend_logistics_dashboard | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | yes | /naijasend and /shipping | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| naijashop_advanced_ai_crm_automation_triggers | NaijaShop marketplace, merchant, inventory, CRM, or analytics screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| naijashop_ai_driven_customer_lifetime_value_clv_intelligence | NaijaShop marketplace, merchant, inventory, CRM, or analytics screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| naijashop_ai_powered_crm_customer_intelligence | NaijaShop marketplace, merchant, inventory, CRM, or analytics screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| naijashop_ai_powered_supply_chain_inventory | NaijaShop marketplace, merchant, inventory, CRM, or analytics screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| naijashop_bulk_order_ai_negotiation_hub | NaijaShop marketplace, merchant, inventory, CRM, or analytics screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| naijashop_competitive_intelligence_growth_analytics | NaijaShop marketplace, merchant, inventory, CRM, or analytics screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| naijashop_global_settlement_cross_border_payouts | NaijaShop marketplace, merchant, inventory, CRM, or analytics screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| naijashop_inventory_management | NaijaShop marketplace, merchant, inventory, CRM, or analytics screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| naijashop_marketplace | NaijaShop marketplace, merchant, inventory, CRM, or analytics screen | yes | /naijashop, /product-listing, cards | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| naijashop_marketplace_master_command_hub | NaijaShop marketplace, merchant, inventory, CRM, or analytics screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| naijashop_marketplace_mobile | NaijaShop marketplace, merchant, inventory, CRM, or analytics screen | yes | mobile shop source panel | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| naijashop_merchant_ai_intelligence_command_center | NaijaShop marketplace, merchant, inventory, CRM, or analytics screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| naijashop_merchant_dashboard | NaijaShop marketplace, merchant, inventory, CRM, or analytics screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| naijashop_merchant_hub_mobile | NaijaShop marketplace, merchant, inventory, CRM, or analytics screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| naijashop_performance_deep_dive | NaijaShop marketplace, merchant, inventory, CRM, or analytics screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| naijastay_add_property_basic_info | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijastay_add_property_infrastructure | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijastay_add_property_location_neighborhood | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijastay_add_property_photos | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijastay_add_property_pricing_payouts | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijastay_add_property_review | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijastay_enhanced_property_audit_rigorous_kyc | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijastay_host_analytics_dashboard | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijastay_hotel_occupancy_guest_command_center | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijastay_international_payouts_tax_french | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijastay_merchant_dashboard | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijastay_property_detail_mobile | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijastay_property_ranking_logic_tuner | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijastay_property_verification_admin_console | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijastay_search | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijastay_search_mobile | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijastream_advanced_moderation_safety_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijastream_audience_deep_dive | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijastream_content_licensing_rights_management | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijastream_content_licensing_rights_management_portal | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijastream_creator_monetization_royalties | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijastream_creator_portal | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijastream_creator_studio | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijastream_entertainment_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijastream_francophone_media_rights_dynamic_pricing | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijastream_home_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijastream_live_moderation_safety_console | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijastream_watch_next_recommendation_engine | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijatravel_ai_concierge_trip_builder | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijatravel_concierge_executive_mobile_home | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijatravel_corporate_billing_invoicing_suite | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijatravel_corporate_travel_management_console | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijatravel_elite_circle_loyalty_rewards_dashboard | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijatravel_empty_leg_opportunities | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijatravel_helicopter_charter_offshore_logistics | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijatravel_helicopter_dispatch_offshore_logistics_hub | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijatravel_multi_modal_search_hub_1 | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijatravel_multi_modal_search_hub_2 | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijatravel_private_jet_helicopter_marketplace | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijatravel_private_jet_marketplace | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijatravel_unified_executive_trip_builder | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijautilities_consumer_home_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijautilities_institutional_infrastructure_command | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijautilities_pay_electricity_bill | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijautilities_payment_success_receipt | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| naijawallet_dashboard | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | yes | /wallet ledger panels | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| naijawallet_dashboard_mobile | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | yes | mobile wallet source panel | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| naijawallet_multi_country_tax_settlement_engine | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| naijawallet_multi_currency_settlement_dashboard | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| naijawallet_with_subscriptions | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| naijawholesale_institutional_procurement_supplier_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| pan_african_banking_cross_border_liquidity | Supporting ecosystem screen or reference visual | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| pan_african_fiscal_tax_authority_console | Dashboard or command screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| pan_african_identity_authority_console | Supporting ecosystem screen or reference visual | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| pan_african_logistics_network_real_time_fleet_health | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| pan_african_logistics_predictive_asset_tracking | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| pan_african_logistics_settlement_multi_currency_hub | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| pan_african_multi_currency_settlement_console | Supporting ecosystem screen or reference visual | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| pan_african_multi_currency_tariff_settlement_console_1 | Supporting ecosystem screen or reference visual | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| pan_african_multi_currency_tariff_settlement_console_2 | Supporting ecosystem screen or reference visual | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| pan_african_personnel_vetting_security_hub_1 | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| pan_african_personnel_vetting_security_hub_2 | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| pan_african_personnel_vetting_security_hub_final_layout_fix | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| pan_african_personnel_vetting_security_hub_layout_fix | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| pan_african_personnel_vetting_security_hub_optimized_layout_1 | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| pan_african_personnel_vetting_security_hub_optimized_layout_2 | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| pan_african_personnel_vetting_security_hub_optimized_layout_3 | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| pan_african_personnel_vetting_security_hub_optimized_layout_4 | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| pan_african_regulatory_archive_compliance_vault | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| payment_security_biometric_transfer_approval | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| payout_configuration_final_review | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| payouts_financial_reports_dashboard | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| personnel_onboarding_vetting_workflow | Dashboard or command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| personnel_training_certification_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| predictive_logistics_analytics_congestion_control | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| premium_escrow_insurance_enrollment | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| prime_business_gestion_des_d_penses_french | Vendor/business operating system or merchant onboarding screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| prime_family_shared_wallet_member_controls | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| public_logistics_transparency_tracker | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | yes | /tracking/[id] and /shipping | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| public_transparency_trust_dashboard | Dashboard or command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| public_transparency_trust_portal | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| regional_activation_multi_country_command_center_1 | Supporting ecosystem screen or reference visual | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_activation_multi_country_command_center_2 | Dashboard or command screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_activation_multi_country_command_center_3 | Dashboard or command screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_ad_network_revenue_share_settlement | Dashboard or command screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_ad_network_targeting_hyper_local_market_insights | Dashboard or command screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_hub_disaster_recovery_resilience_console_1 | Dashboard or command screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_hub_disaster_recovery_resilience_console_2 | Supporting ecosystem screen or reference visual | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_hub_disaster_recovery_resilience_console_3 | Dashboard or command screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_hub_disaster_recovery_resilience_console_recovery_resilience_dashboard | Dashboard or command screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_hub_disaster_recovery_resilience_dashboard | Supporting ecosystem screen or reference visual | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_hub_emergency_protocols_gabon_sector | Supporting ecosystem screen or reference visual | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_hub_emergency_tactical_deployment | Supporting ecosystem screen or reference visual | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_hub_facility_maintenance_asset_health_dashboard | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_hub_infrastructure_reporting | Dashboard or command screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_hub_logistics_capacity_planner | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_hub_maintenance_solar_power_reporting | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_hub_personnel_training_certification_hub_1 | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_hub_personnel_training_certification_hub_2 | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_hub_personnel_training_management | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_hub_security_deployment_asset_protection_1 | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_hub_security_deployment_asset_protection_2 | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_infrastructure_deployment_map | Dashboard or command screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_localization_cultural_adaptation_hub | Supporting ecosystem screen or reference visual | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_logistics_hub_management | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_partner_payout_logistics_settlement_automation | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_partner_payout_revenue_share | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_regulatory_compliance_dashboard | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_regulatory_compliance_sovereignty_portal_1 | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_regulatory_compliance_sovereignty_portal_2 | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_rights_access_control_console | Supporting ecosystem screen or reference visual | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_solar_hub_ai_predictive_maintenance_hub | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_solar_hub_infrastructure_profiling_hub | Supporting ecosystem screen or reference visual | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_solar_hub_maintenance_ai_resilience_schedule_1 | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_solar_hub_maintenance_ai_resilience_schedule_2 | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_solar_hub_maintenance_command_center_1 | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_solar_hub_maintenance_command_center_2 | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_solar_hub_maintenance_schedule_1 | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_solar_hub_maintenance_schedule_2 | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| regional_supplier_vetting_kyc_hub | Dashboard or command screen | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| screenshot_20260601_174554_com.android.chrome.jpg | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| screenshot_20260601_174600_com.android.chrome.jpg | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| screenshot_20260601_174707_com.android.chrome.jpg | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| screenshot_20260601_175313_com.ubercab.jpg | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| screenshot_20260601_175335_com.ubercab.jpg | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| screenshot_20260601_175338_com.ubercab.jpg | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| screenshot_20260601_175342_com.ubercab.jpg | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| screenshot_20260601_175344_com.ubercab.jpg | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| screenshot_20260601_175433_com.ubercab.jpg | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| screenshot_20260601_175449_com.ubercab.jpg | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| screenshot_20260601_175511_com.ubercab.jpg | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| screenshot_20260601_175544_com.ubercab.jpg | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| screenshot_20260601_175554_com.ubercab.jpg | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| screenshot_20260601_175657_com.ubercab.jpg | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| screenshot_20260601_175709_com.ubercab.jpg | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| screenshot_20260601_175744_com.ubercab.jpg | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| screenshot_20260601_175834_com.ubercab.jpg | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| screenshot_20260601_175859_com.ubercab.jpg | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| screenshot_20260601_180411_com.jpg | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| screenshot_20260601_180827_com.jpg | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| security_governance_portal_master_detail_audit_view | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| security_hub_definitive_bio_mat_fix | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| security_hub_definitive_bio_mat_fix_v2 | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| security_hub_enhanced_biometric_visibility | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| security_hub_professional_layout_restoration | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| senior_admin_escalation_workflow | Admin, super admin, risk, security, compliance, or governance screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| smart_dispatch_driver_assignment_engine | Ride, driver, fleet, mobility, or driver compliance screen | yes | /admin dispatch/risk widgets | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| solar_hub_maintenance_flexible_monitoring_view | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| tri_persona_engine_integration_hub | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| ubiquity_os | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| unified_activity_live_mission_control | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| unified_activity_my_missions_tracker | NaijaSend logistics, mission tracking, courier dispatch, or delivery proof screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| unified_checkout_mobile | NaijaPay wallet, checkout, escrow, payout, settlement, or financial command screen | yes | /checkout | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| universal_ecosystem_health_real_time_uptime_dashboard | Dashboard or command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| universal_real_time_ecosystem_tracker | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| universal_search_ai_discovery_hub_1 | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | yes | /search and /product-listing via search source hero | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| universal_search_ai_discovery_hub_2 | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Relevant to current MVP but not yet fully incorporated into route/component structure. | merge |
| universal_search_toyota_camry_results | Universal search or discovery screen | yes | /search source rail | Used in Phase 6 source mapping; still needs deeper pixel/component extraction in future pass. | keep |
| user_acquisition_retention_dashboard | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| vendor_analytics_dashboard | Vendor/business operating system or merchant onboarding screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| video_kyc_high_risk_executive_onboarding | Supporting ecosystem screen or reference visual | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| video_kyc_high_risk_merchant_verification | Vendor/business operating system or merchant onboarding screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| video_kyc_high_risk_regional_onboarding | Supporting ecosystem screen or reference visual | no | Not used in current app | Out of current Phase 6 MVP scope or future vertical; document and preserve for roadmap. | defer |
| video_unboxing_verification_ai_analysis | Aura AI, AI engine, recommendation, dispatch intelligence, support, or risk screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| wholesale_bulk_order_marketplace | Dashboard or command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |
| workforce_retention_intelligence_dashboard | Dashboard or command screen | no | Not used in current app | Not mapped to a current route; evaluate for reusable pattern or discard if weak. | rebuild |