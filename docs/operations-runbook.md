# Operations Runbook

## 1. Daily Checks
- **Health:** Check container status (`docker ps`).
- **Logs:** Review recent errors (`docker logs --tail 100 <container>`).
- **Resources:** CPU/RAM check (`htop`).

## 2. Backups & Restore
- **PostgreSQL:** Daily automated `pg_dump` to off-server storage.
- **Media:** Scheduled sync to S3/Cloud Storage.
- **Restore:** Recreate DB from latest dump, sync media from backup storage.

## 3. Incident Response
- **Service Down:** Check server status, restart containers, review error logs.
- **Database Error:** Verify connectivity, check disk space/RAM, restore from backup if data corruption.
- **Security Breach:** Isolate server, rotate all credentials, investigate logs, patch vulnerability.

## 4. Maintenance
- **Patching:** Monthly OS/Docker updates.
- **Monitoring:** Set up uptime alerts (e.g., UptimeRobot).
- **Cost:** Review monthly usage/egress.
