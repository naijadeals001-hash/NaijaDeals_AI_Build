-- Administrative region scope for Control Center staff.
-- Nullable so existing accounts keep platform-wide access exactly as before.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "scopeCountryCode" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "scopeCityCode" TEXT;
