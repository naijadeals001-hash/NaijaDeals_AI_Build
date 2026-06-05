# NaijaDeals.com Super Ecosystem

NaijaDeals.com is a Next.js + TypeScript + Tailwind investor-demo build for an African super-app marketplace: ecommerce, food, gigs, shortlets, rides, logistics, streaming, wallet, escrow, Aura AI, admin, and super admin.

## Local Setup

Install dependencies:

```powershell
npm install
```

Create a local environment file:

```powershell
Copy-Item .env.example .env.local
```

Edit `.env.local` with local or staging credentials. Do not commit real secrets.

## Build

```powershell
npm run build
```

## Run

Development:

```powershell
npm run dev
```

Production preview:

```powershell
npm run build
npm run start -- -p 3000
```

Open:

```text
http://localhost:3000
```

## Stop Server

Find the Node process:

```powershell
Get-Process node
```

Stop by PID:

```powershell
Stop-Process -Id <PID> -Force
```

## QA

Run code checks:

```powershell
npm run lint
npm run build
npm run type-check
```

Run visual QA:

```powershell
npm run qa:visual
```

Visual QA uses local Chrome via `playwright-core`, tests major routes at mobile, tablet, and desktop widths, checks internal links, detects horizontal overflow, and writes screenshots to `qa-artifacts/`.

## Environment Setup

Use `.env.example` as the source of required variables for:

- Database: `DATABASE_URL`, pool sizes
- Auth/session: `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `JWT_SECRET`
- Payments: Paystack, Flutterwave, webhook secret
- Escrow/wallet: ledger API, escrow account, release webhook secret
- Email/SMS: Resend, SendGrid, Termii, SMS sender ID
- Maps/location: Google Maps, Mapbox, location webhook secret
- AI provider: OpenAI key, provider name, Aura model
- Storage: S3 endpoint, bucket, region, access credentials

## Backend-Ready Service Layer

API-ready service placeholders live in `lib/services/`.

Current modules:

- `auth-service.ts`
- `users-service.ts`
- `vendors-service.ts`
- `orders-service.ts`
- `wallet-ledger-service.ts`
- `escrow-service.ts`
- `payments-service.ts`
- `disputes-service.ts`
- `tracking-service.ts`
- `admin-analytics-service.ts`

Each module includes TODO comments marking where real backend integration, validation, idempotency, audit logging, provider webhook verification, and ledger rules should be implemented.

## Security Notes

- Real secrets belong in `.env.local` or platform secret storage only.
- Baseline security headers are configured in `next.config.mjs`.
- Remote image allowlists are removed; current demo images are local assets under `public/stitch`.
- `npm audit fix --force` is intentionally not run because it proposes semver-major framework upgrades.

## Demo Scope

This is a production-shaped investor demo, not a live financial system. Wallet, escrow, payments, dispatch, KYC, AI, and storage are represented through typed service placeholders and realistic UI flows until real APIs are connected.
