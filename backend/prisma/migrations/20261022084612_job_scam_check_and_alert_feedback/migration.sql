-- AlterEnum
ALTER TYPE "JobStatus" ADD VALUE 'held';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "heldAt" TIMESTAMP(3),
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" UUID,
ADD COLUMN     "spamReasons" JSONB,
ADD COLUMN     "spamScore" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "notImportantNote" VARCHAR(300),
ADD COLUMN     "notImportantReason" VARCHAR(30);
