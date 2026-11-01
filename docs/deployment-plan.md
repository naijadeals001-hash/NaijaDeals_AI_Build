# Deployment Plan

## 1. Build & Release
- **Environment:** Docker containers for runtime and worker.
- **Workflow:** GitHub Actions → Build image → Push to Registry → Deploy to host.
- **Artifact:** OCI-compliant image.

## 2. Configuration
- **Local:** `.env.local` (Git ignored)
- **Production:** Server-side environment variables via secure store (e.g., systemd env files or secrets manager).
- **Sensitive data:** Never committed.

## 3. Deployment Steps
1. **Prepare:** Run `npm run build` locally to verify success.
2. **Push:** Tag and push code to `naijashop-marketplace`.
3. **Deploy (Server):**
   - Pull new image.
   - Run database migrations (`npx prisma migrate deploy`).
   - Swap service (blue/green or rolling restart).
4. **Verification:** Check health endpoint and logs.

## 4. Rollback
- If failure occurs: Revert to previous image tag and restart containers.
- Check logs: `docker logs <container_name>`

## 5. Security & Infrastructure
- **Firewall:** UFW (strict rules).
- **TLS:** Let's Encrypt (Certbot).
- **Access:** SSH key only, no root login.
- **Database:** Internal access, managed/local backups.
