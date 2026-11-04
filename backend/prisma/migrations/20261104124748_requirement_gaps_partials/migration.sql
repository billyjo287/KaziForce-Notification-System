-- CreateEnum
CREATE TYPE "SummaryFrequency" AS ENUM ('daily', 'weekly', 'monthly');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "mutedByPreference" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "UserPreference" ADD COLUMN     "categorySettings" JSONB,
ADD COLUMN     "summaryFrequency" "SummaryFrequency" NOT NULL DEFAULT 'daily';

-- CreateTable
CREATE TABLE "NotificationRule" (
    "category" VARCHAR(40) NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationRule_pkey" PRIMARY KEY ("category")
);

-- CreateTable
CREATE TABLE "MessageWording" (
    "id" UUID NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "language" "Language" NOT NULL,
    "urgent" BOOLEAN NOT NULL,
    "text" VARCHAR(80),
    "version" INTEGER NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageWording_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageWording_category_language_urgent_version_key" ON "MessageWording"("category", "language", "urgent", "version");

-- AddForeignKey
ALTER TABLE "NotificationRule" ADD CONSTRAINT "NotificationRule_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageWording" ADD CONSTRAINT "MessageWording_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Starting rule: News from KaziForce (admin announcements) is always sent (ADR 0016).
INSERT INTO "NotificationRule" ("category", "mandatory", "updatedAt") VALUES ('announcement', true, CURRENT_TIMESTAMP);
