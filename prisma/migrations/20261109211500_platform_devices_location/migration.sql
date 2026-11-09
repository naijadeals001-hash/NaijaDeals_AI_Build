-- CreateTable
CREATE TABLE "DeviceRegistration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "pushToken" TEXT,
    "appVersion" TEXT,
    "capabilities" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviceRegistration_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "LocationPing" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionRef" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracyM" DOUBLE PRECISION,
    "speedMps" DOUBLE PRECISION,
    "headingDeg" DOUBLE PRECISION,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'browser',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LocationPing_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "DeviceRegistration_userId_platform_idx" ON "DeviceRegistration"("userId", "platform");
-- CreateIndex
CREATE INDEX "LocationPing_sessionRef_capturedAt_idx" ON "LocationPing"("sessionRef", "capturedAt");
-- CreateIndex
CREATE INDEX "LocationPing_userId_capturedAt_idx" ON "LocationPing"("userId", "capturedAt");
-- CreateIndex
CREATE UNIQUE INDEX "LocationPing_deviceId_clientId_key" ON "LocationPing"("deviceId", "clientId");
-- AddForeignKey
ALTER TABLE "DeviceRegistration" ADD CONSTRAINT "DeviceRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "LocationPing" ADD CONSTRAINT "LocationPing_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "DeviceRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
