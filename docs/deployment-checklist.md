# NaijaDeals Deployment Checklist

Do not deploy until every item here is reviewed by the owner.

## Pre-Deployment

- Confirm all required `.env` variables exist in platform secret storage.
- Run `npm run lint`.
- Run `npm run build`.
- Run `npm run type-check`.
- Run `npm run qa:visual`.
- Review `qa-artifacts/visual-qa-report.md`.
- Confirm `npm audit` findings and decide whether to upgrade framework major versions.
- Confirm no real secrets are committed.
- Confirm payment, wallet, and escrow providers are in test mode unless launch is approved.

## VPS Checklist

- Provision Ubuntu LTS VPS with least-privilege deploy user.
- Install Node.js LTS matching the project runtime.
- Install process manager such as PM2 or configure systemd service.
- Configure firewall: allow only SSH, HTTP, and HTTPS.
- Configure Nginx reverse proxy to `localhost:3000`.
- Enable TLS with Let’s Encrypt.
- Add security headers at Nginx and app levels.
- Configure log rotation.
- Configure uptime monitoring and disk alerts.
- Store environment variables outside the repo.
- Set up database connectivity using private network or TLS.
- Run `npm ci`, `npm run build`, then `npm run start`.

## GitHub Checklist

- Create a protected main branch.
- Require PR reviews before merge.
- Add GitHub Actions for lint, build, type-check, and visual QA where browser support is available.
- Store deployment secrets in GitHub Environments, not repository variables.
- Add Dependabot or equivalent dependency monitoring.
- Add release tags for investor-demo builds.
- Do not push generated `node_modules` or `.next`.

## Production Domain Checklist

- Point `naijadeals.com` DNS to the deployment target.
- Add `www.naijadeals.com` redirect policy.
- Configure HTTPS certificate for apex and www.
- Set `NEXT_PUBLIC_APP_URL=https://naijadeals.com`.
- Set `NEXTAUTH_URL=https://naijadeals.com`.
- Configure payment and escrow webhook URLs.
- Configure email/SMS sender domains and SPF/DKIM/DMARC.
- Configure maps/location domain restrictions.
- Configure storage bucket CORS and signed upload policy.
- Validate Open Graph metadata.
- Run smoke tests on home, search, product detail, cart, checkout, wallet, tracking, admin, and super admin.

## Launch Hold Points

- Do not enable real payments until provider webhooks are verified.
- Do not enable escrow release until ledger reconciliation is tested.
- Do not enable KYC decisions until audit logging is live.
- Do not enable AI support actions that mutate orders until human review rules are defined.
- Do not enable admin mutations until RBAC and 2FA are enforced.
