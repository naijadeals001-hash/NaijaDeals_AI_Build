-- AlterTable
ALTER TABLE "StreamLiveEvent" ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "organizerId" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3);
