@echo off
REM NaijaDeals preview (persistent via Scheduled Task NaijaDealsPreview3015).
REM Serves the production build from the main worktree on port 3015 with the
REM demonstration catalogue enabled so the music UI is populated for review.
REM
REM `next start` does not load .env, so server-side flags must be set here.
cd /d C:\Users\User\Documents\naijadeals.com
set NEXT_DIST_DIR=.next-pay
set NAIJA_STREAM_SHOW_SAMPLES=true

REM NaijaPay internal transfers — DEVELOPMENT ONLY. The database is classified
REM TEST, so lib/payments/boundary.ts blocks live money movement regardless of
REM this flag; no provider credentials are configured in this environment.
set ENABLE_P2P_TRANSFERS=true

REM NaijaPay: local test payment provider for Add Money. Development only.
set ENABLE_TEST_PAYMENTS=true

"C:\Program Files\nodejs\npm.cmd" run start -- --port 3015 >> C:\Users\User\Documents\naijadeals.com\qa-artifacts\preview-3015.log 2>&1
