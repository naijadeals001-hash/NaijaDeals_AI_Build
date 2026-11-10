@echo off
REM Restarts the NaijaDeals worker when it exits, for local development.
REM Analogue of a systemd Restart=always / NSSM service on a server.
REM Each restart is visible in the heartbeat "starts" counter and in
REM /api/health, so a crash loop cannot look like a healthy worker.
set BACKOFF=5
:loop
echo [supervisor] worker starting %DATE% %TIME%
call npx tsx scripts/infra-worker.ts
echo [supervisor] worker exited with code %ERRORLEVEL%; restarting in %BACKOFF%s
timeout /t %BACKOFF% /nobreak >nul
goto loop
