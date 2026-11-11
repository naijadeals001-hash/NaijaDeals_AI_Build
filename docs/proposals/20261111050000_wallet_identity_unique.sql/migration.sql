CREATE UNIQUE INDEX "Wallet_user_identity_key" ON "Wallet" ("userId", "ownerType", "currency") WHERE "userId" IS NOT NULL;
CREATE UNIQUE INDEX "Wallet_vendor_identity_key" ON "Wallet" ("vendorId", "ownerType", "currency") WHERE "vendorId" IS NOT NULL;
CREATE UNIQUE INDEX "Wallet_system_identity_key" ON "Wallet" ("ownerType", "currency") WHERE "ownerType" = 'SYSTEM';
