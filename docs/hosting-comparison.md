# Hosting Research: NaijaDeals Pilot & Production

## 1. Application Requirements
- **Runtime:** Next.js 14 (Node.js)
- **Database:** PostgreSQL (Prisma ORM)
- **Media/Assets:** Product images, potential future music streaming (requires storage + egress)
- **Workload:** Background jobs, API, SSR/ISR
- **Region Focus:** Nigeria (African market latency critical)

## 2. Hosting Comparison (Assumptions: Pilot phase < 500 users/mo)

| Feature | Option A: Pilot (VPS) | Option B: Production (Cloud) |
|---|---|---|
| **Provider** | Hostinger/Vultr (e.g., VPS-1) | Vercel + Neon/Supabase |
| **Total Monthly Cost** | ~$5 - $10 USD | ~$40+ USD (Vercel Pro + DB) |
| **Setup Complexity** | High (Self-managed) | Low (Managed) |
| **Resilience** | Single-server risk | High (Global CDN/Distributed DB) |
| **Nigeria Latency** | Moderate (EU/US edge) | Low (Vercel Edge/CDN) |

## 3. Recommendations

### A. Lowest-cost viable pilot (Self-managed VPS)
- **Why:** Best cost control, predictable pricing.
- **Tradeoff:** Operational burden (updates, security patches, DB backups).
- **Assumptions:** Team can manage Linux server, Docker, and Nginx.

### B. Better-resilience production option (Cloud Managed)
- **Why:** Scales effortlessly, high availability, excellent performance in African markets due to edge caching.
- **Tradeoff:** Higher costs; pricing increases significantly with traffic/media egress.
- **Assumptions:** Revenue justifies managed costs; focus on development over server management.

## 4. Next Steps
1. Perform server-side audit of current VPS capacity.
2. Draft deployment plan using Docker Compose.
3. Review security practices for off-server backups.
