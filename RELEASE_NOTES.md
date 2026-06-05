# NaijaDeals.com Local Release Candidate

Release: Local RC 1

Date: June 5, 2026

## Status

This release is a local investor-demo release candidate. It is suitable for local review, stakeholder walkthroughs, product critique, and backend integration planning.

It has not been deployed and has not been pushed to GitHub.

## Highlights

- Built a Next.js, TypeScript, Tailwind CSS super-app marketplace experience.
- Added mobile-first app shell with desktop sidebar and mobile bottom navigation.
- Added public routes for home, ecosystem hub, categories, search, listing, detail, cart, checkout, account, orders, wallet, help, returns, safety, shipping, and payments.
- Added vertical routes for NaijaShop, NaijaEats, NaijaGigs, NaijaStay, NaijaDrive, NaijaSend, NaijaStream, NaijaPay, and Aura AI.
- Added business seller pages and onboarding flows for vendors, drivers, restaurants, creators, and hosts.
- Added admin and super admin dashboards with operations queues, risk alerts, wallet/escrow summaries, AI monitoring, and Pan-African roadmap controls.
- Added investor-demo sections covering market opportunity, trust and escrow, AI commerce, logistics advantage, seller growth, and roadmap.
- Added local Stitch screenshot assets for visual richness.
- Added backend-ready typed service layer placeholders for future API integration.
- Added `.env.example`, README launch instructions, and deployment checklist.
- Added automated visual QA script covering 39 routes at mobile, tablet, and desktop widths.

## Verification

The local release candidate passes:

```powershell
npm run lint
npm run build
npm run type-check
npm run qa:visual
```

Latest visual QA coverage:

- 39 routes
- 117 screenshots
- 0 visual failures
- 0 broken internal links

## Known Limitations

- Backend services are typed placeholders and demo data.
- Payments, wallet ledger, escrow, KYC, dispatch, AI, email/SMS, storage, and maps are not connected to live providers.
- `npm audit` still reports framework/tooling advisories whose available fix is a semver-major upgrade.
- Production RBAC, 2FA, webhook verification, ledger reconciliation, and observability must be implemented before serving real customers.

## Local URL

```text
http://localhost:3000
```
