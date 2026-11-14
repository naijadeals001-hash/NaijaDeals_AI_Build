@echo off
REM REVIEW-only preview launcher. DATABASE_URL is taken from REVIEW_DATABASE_URL,
REM never from .env, so the financial TEST database cannot be used by accident.
setlocal
if "%REVIEW_DATABASE_URL%"=="" (
  echo REFUSED: set REVIEW_DATABASE_URL to the REVIEW-classified database. 1>&2
  exit /b 2
)
if "%REVIEW_EXPECTED_DATABASE%"=="" (
  echo REFUSED: set REVIEW_EXPECTED_DATABASE to the expected database name. 1>&2
  exit /b 2
)
set DATABASE_URL=%REVIEW_DATABASE_URL%
set NEXT_PUBLIC_REVIEW_CATALOGUE=1
set REVIEW_TEST_SEAMS=1
set NEXT_DIST_DIR=.next-programme
call npx tsx scripts/review-preview-guard.ts
if errorlevel 1 (
  echo REFUSED: REVIEW guard failed; preview not started. 1>&2
  exit /b 2
)
call npx next start -p 3047
